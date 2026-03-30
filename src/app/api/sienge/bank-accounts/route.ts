import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

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

    // 3. Fetch bank account details for EVERY unique account via their link
    const bankAccountDetails: Record<string, { bankName: string; agencyNumber: string; description: string }> = {};

    // Collect unique links
    const linkMap = new Map<string, string>(); // accountNumber -> link href
    for (const acc of allAccounts) {
      const bankLink = (acc.links || []).find((l: R) => l.rel === "bank-account");
      if (bankLink?.href && acc.accountNumber) {
        linkMap.set(acc.accountNumber, bankLink.href);
      }
    }

    // Fetch details in batches of 5 to avoid rate limits
    const entries = Array.from(linkMap.entries());
    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      const promises = batch.map(async ([accNum, link]) => {
        try {
          const urlPath = new URL(link).pathname.replace(/.*\/public\/api\/v1/, "");
          const detail = await siengeGet<R>(urlPath);
          if (i === 0) console.log(`[bank-account-detail] ${accNum}:`, JSON.stringify(detail).substring(0, 500));
          bankAccountDetails[accNum] = {
            bankName: detail?.bankName || detail?.bank?.name || detail?.bankDescription || detail?.name || "",
            agencyNumber: detail?.agencyNumber || detail?.agency || "",
            description: detail?.description || detail?.bankAccountDescription || detail?.name || "",
          };
        } catch { /* skip */ }
      });
      await Promise.all(promises);
    }

    console.log(`[accounts-balances] ${allAccounts.length} accounts, ${Object.keys(bankAccountDetails).length} with details`);

    // 4. Map to normalized structure
    const enriched = allAccounts.map((acc: R) => {
      const accNum = acc.accountNumber || "";
      const detail = bankAccountDetails[accNum];
      return {
        bankAccountId: accNum,
        bankAccountDescription: detail?.description || `Conta ${accNum}`,
        bankCode: "",
        bankName: detail?.bankName || "",
        agencyNumber: detail?.agencyNumber || "",
        accountNumber: accNum,
        companyId: acc.companyId || 0,
        companyName: companiesMap[acc.companyId] || `Empresa ${acc.companyId}`,
        currentBalance: acc.amount ?? 0,
        reconciledAmount: acc.reconciledAmount ?? 0,
        accountStatus: acc.accountStatus || "",
      };
    });

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching accounts-balances:", error);
    return NextResponse.json({ error: "Failed to fetch account balances", details: String(error) }, { status: 500 });
  }
}
