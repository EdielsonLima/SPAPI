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

// Accounts that are only valid for specific companies (companyId)
// CAIXA exists in all companies but only Silva Packer (companyId=1) should be in DimBanco
const COMPANY_RESTRICTED_ACCOUNTS: Record<string, number> = {
  "CAIXA": 1, // Only Silva Packer
};

function isInDimBanco(accountNumber: string, companyId: number): boolean {
  if (!BANK_NAMES[accountNumber]) return false;
  const restriction = COMPANY_RESTRICTED_ACCOUNTS[accountNumber];
  if (restriction !== undefined && restriction !== companyId) return false;
  return true;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 1. Fetch companies first
    const companiesMap: Record<number, string> = {};
    const companyIds: number[] = [];
    try {
      const cd = await siengeGet<R>("/companies", { offset: "0", limit: "100" });
      (cd?.results || []).forEach((c: R) => {
        companiesMap[c.id] = c.name;
        companyIds.push(c.id);
      });
    } catch { /* ignore */ }

    // 2. Fetch account balances - first try global, then per company for missing ones
    const allAccounts: R[] = [];
    const seenCompanies = new Set<number>();

    // Global fetch
    const firstPage = await siengeGet<R>("/accounts-balances", { balanceDate: today, offset: "0", limit: "100" });
    const results = firstPage?.results || [];
    const total = firstPage?.resultSetMetadata?.count || results.length;
    allAccounts.push(...results);
    let offset = results.length;
    while (offset < total) {
      const page = await siengeGet<R>("/accounts-balances", { balanceDate: today, offset: String(offset), limit: "100" });
      const pr = page?.results || [];
      if (pr.length === 0) break;
      allAccounts.push(...pr);
      offset += pr.length;
    }

    // Track which companies were returned
    for (const acc of allAccounts) {
      if (acc.companyId) seenCompanies.add(acc.companyId);
    }

    // Fetch missing companies individually (e.g., Hannover companyId=7)
    const missingCompanies = companyIds.filter(id => !seenCompanies.has(id));
    if (missingCompanies.length > 0) {
      console.log(`[accounts-balances] Missing companies from global fetch: ${missingCompanies.map(id => `${id}(${companiesMap[id]})`).join(", ")}`);
      for (const compId of missingCompanies) {
        try {
          const compPage = await siengeGet<R>("/accounts-balances", {
            balanceDate: today, companyId: String(compId), offset: "0", limit: "100"
          });
          const compResults = compPage?.results || [];
          if (compResults.length > 0) {
            console.log(`[accounts-balances] Found ${compResults.length} accounts for company ${compId} (${companiesMap[compId]})`);
            allAccounts.push(...compResults);
          }
        } catch {
          // companyId param might not be supported, skip
        }
      }
    }

    // 3. Map to normalized structure with bank names from DimBanco
    // Use composite key companyId:accountNumber to uniquely identify accounts
    const enriched = allAccounts.map((acc: R) => {
      const accNum = acc.accountNumber || "";
      const compId = acc.companyId || 0;
      const uniqueId = `${compId}:${accNum}`;
      return {
        bankAccountId: uniqueId,
        bankAccountDescription: accNum,
        bankCode: "",
        bankName: BANK_NAMES[accNum] || "",
        agencyNumber: "",
        accountNumber: accNum,
        companyId: compId,
        companyName: companiesMap[compId] || `Empresa ${compId}`,
        currentBalance: acc.amount ?? 0,
        reconciledAmount: acc.reconciledAmount ?? 0,
        accountStatus: acc.accountStatus || "",
        isInDimBanco: isInDimBanco(accNum, compId),
      };
    });

    // Log which DimBanco accounts were found/missing
    const foundAccNums = new Set(allAccounts.map((a: R) => a.accountNumber));
    const dimBancoNums = Object.keys(BANK_NAMES);
    const missing = dimBancoNums.filter(n => !foundAccNums.has(n));
    if (missing.length > 0) {
      console.log(`[accounts-balances] DimBanco accounts NOT found in API: ${missing.join(", ")}`);
    }
    console.log(`[accounts-balances] Found ${enriched.filter((e: R) => e.isInDimBanco).length} DimBanco accounts out of ${dimBancoNums.length}`);

    return NextResponse.json({
      data: enriched,
      _debug: {
        missingDimBanco: missing,
        totalFromApi: allAccounts.length,
        dimBancoMatched: enriched.filter((e: R) => e.isInDimBanco).length,
        allAccountNumbers: allAccounts.map((a: R) => `${a.companyId}:${a.accountNumber}`),
      }
    });
  } catch (error) {
    console.error("Error fetching accounts-balances:", error);
    return NextResponse.json({ error: "Failed to fetch account balances", details: String(error) }, { status: 500 });
  }
}
