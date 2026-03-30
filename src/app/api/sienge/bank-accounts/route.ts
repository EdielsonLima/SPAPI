import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SiengeRawResponse = any;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 1. Fetch account balances
    const firstPage = await siengeGet<SiengeRawResponse>(
      "/accounts-balances",
      { balanceDate: today, offset: "0", limit: "100" }
    );

    const results = firstPage?.results || [];
    const total = firstPage?.resultSetMetadata?.count || results.length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allAccounts: any[] = [...results];
    let offset = results.length;

    while (offset < total) {
      const page = await siengeGet<SiengeRawResponse>(
        "/accounts-balances",
        { balanceDate: today, offset: String(offset), limit: "100" }
      );
      const pageResults = page?.results || [];
      if (pageResults.length === 0) break;
      allAccounts.push(...pageResults);
      offset += pageResults.length;
    }

    // 2. Fetch companies for name lookup
    const companiesMap: Record<number, string> = {};
    try {
      const companiesData = await siengeGet<SiengeRawResponse>(
        "/companies",
        { offset: "0", limit: "100" }
      );
      const companyResults = companiesData?.results || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyResults.forEach((c: any) => {
        companiesMap[c.id] = c.name;
      });
    } catch {
      console.log("[accounts-balances] Could not fetch companies for name lookup");
    }

    // 3. Try to get bank account details for each unique account
    // Extract bank account IDs from links
    const bankAccountDetails: Record<string, { bankName: string; agencyNumber: string; description: string }> = {};
    const uniqueAccountLinks = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const acc of allAccounts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bankLink = (acc.links || []).find((l: any) => l.rel === "bank-account");
      if (bankLink?.href) {
        uniqueAccountLinks.add(bankLink.href);
      }
    }

    // Fetch bank account details (limited to avoid rate limits)
    const linkArray = Array.from(uniqueAccountLinks);
    for (const link of linkArray.slice(0, 30)) {
      try {
        // Extract the path from the full URL
        const urlPath = new URL(link).pathname.replace(/.*\/public\/api\/v1/, "");
        const detail = await siengeGet<SiengeRawResponse>(urlPath);
        const accNum = detail?.accountNumber || detail?.account || "";
        if (accNum) {
          bankAccountDetails[accNum] = {
            bankName: detail?.bankName || detail?.bank?.name || detail?.bankDescription || "",
            agencyNumber: detail?.agencyNumber || detail?.agency || "",
            description: detail?.description || detail?.name || "",
          };
        }
      } catch {
        // Skip if we can't fetch details
      }
    }

    // 4. Map to normalized structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = allAccounts.map((acc: any) => {
      const accNum = acc.accountNumber || "";
      const detail = bankAccountDetails[accNum];
      return {
        bankAccountId: acc.accountNumber || 0,
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
    return NextResponse.json(
      { error: "Failed to fetch account balances", details: String(error) },
      { status: 500 }
    );
  }
}
