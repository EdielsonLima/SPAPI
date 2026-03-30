import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

// Mapping: accountNumber → bankName (from Power BI DimBanco)
const BANK_NAMES: Record<string, string> = {
  "570920-2": "Banco XP",
  "A0257918-9": "Aplicação Bradesco",
  "275226-3": "Banco do Brasil",
  "0257918-9": "Banco Bradesco",
  "2261-8": "Caixa Econômica",
  "CAIXA": "Cash",
  "479-0": "Banco do Brasil",
  "490-1": "Banco do Brasil",
  "487-1": "Banco do Brasil",
  "274-7": "Banco do Brasil",
  "276-3": "Banco do Brasil",
  "277-1": "Banco do Brasil",
  "572226-0": "Banco XP",
  "5370-8": "Banco do Brasil",
  "5026-3": "Caixa Econômica",
  "0241711-1": "Banco Bradesco",
  "00483730-8": "BTG Pactual - CH",
  "00910779-3": "BTG Pactual - JP",
};

// Set of valid accounts from DimBanco
const VALID_ACCOUNTS = new Set(Object.keys(BANK_NAMES));

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 1. Fetch account balances
    const firstPage = await siengeGet<R>("/accounts-balances", { balanceDate: today, offset: "0", limit: "100" });
    const results = firstPage?.results || [];
    const total = firstPage?.resultSetMetadata?.count || results.length;
    const allAccounts: R[] = [...results];
    let offset = results.length;
    while (offset < total) {
      const page = await siengeGet<R>("/accounts-balances", { balanceDate: today, offset: String(offset), limit: "100" });
      const pr = page?.results || [];
      if (pr.length === 0) break;
      allAccounts.push(...pr);
      offset += pr.length;
    }

    // 2. Fetch companies for name lookup
    const companiesMap: Record<number, string> = {};
    try {
      const cd = await siengeGet<R>("/companies", { offset: "0", limit: "100" });
      (cd?.results || []).forEach((c: R) => { companiesMap[c.id] = c.name; });
    } catch { /* ignore */ }

    // 3. Map to normalized structure with bank names from DimBanco
    const enriched = allAccounts.map((acc: R) => {
      const accNum = acc.accountNumber || "";
      return {
        bankAccountId: accNum,
        bankAccountDescription: accNum,
        bankCode: "",
        bankName: BANK_NAMES[accNum] || "",
        agencyNumber: "",
        accountNumber: accNum,
        companyId: acc.companyId || 0,
        companyName: companiesMap[acc.companyId] || `Empresa ${acc.companyId}`,
        currentBalance: acc.amount ?? 0,
        reconciledAmount: acc.reconciledAmount ?? 0,
        accountStatus: acc.accountStatus || "",
        isInDimBanco: VALID_ACCOUNTS.has(accNum),
      };
    });

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching accounts-balances:", error);
    return NextResponse.json({ error: "Failed to fetch account balances", details: String(error) }, { status: 500 });
  }
}
