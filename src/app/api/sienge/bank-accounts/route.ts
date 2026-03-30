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
    // First, try to get bank accounts list
    const firstPage = await siengeGet<SiengeRawResponse>(
      "/bank-accounts",
      { offset: "0", limit: "100" }
    );

    console.log("[bank-accounts] Raw first page response keys:", Object.keys(firstPage || {}));
    console.log("[bank-accounts] Raw first page sample:", JSON.stringify(firstPage).substring(0, 1000));

    // Handle both possible response shapes
    const results = firstPage?.results || firstPage?.data || (Array.isArray(firstPage) ? firstPage : []);
    const total = firstPage?.resultSetMetadata?.count || results.length;

    // Collect all accounts with pagination
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allAccounts: any[] = [...results];
    let offset = results.length;

    while (offset < total) {
      const page = await siengeGet<SiengeRawResponse>(
        "/bank-accounts",
        { offset: String(offset), limit: "100" }
      );
      const pageResults = page?.results || page?.data || [];
      if (pageResults.length === 0) break;
      allAccounts.push(...pageResults);
      offset += pageResults.length;
    }

    console.log(`[bank-accounts] Total accounts fetched: ${allAccounts.length}`);
    if (allAccounts.length > 0) {
      console.log("[bank-accounts] Sample account fields:", Object.keys(allAccounts[0]));
      console.log("[bank-accounts] Sample account:", JSON.stringify(allAccounts[0]).substring(0, 500));
    }

    // For each account, try to fetch balance if not present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await Promise.all(allAccounts.map(async (acc: any) => {
      const id = acc.bankAccountId || acc.id;
      let balance = acc.currentBalance ?? acc.balance ?? acc.saldo ?? null;

      // If no balance in the account data, try dedicated balance endpoint
      if (balance === null && id) {
        try {
          const balanceData = await siengeGet<SiengeRawResponse>(
            `/bank-accounts/${id}/balance`
          );
          balance = balanceData?.currentBalance ?? balanceData?.balance ?? balanceData?.value ?? 0;
          console.log(`[bank-accounts] Balance for ${id}:`, JSON.stringify(balanceData).substring(0, 200));
        } catch {
          // Balance endpoint might not exist, try another pattern
          try {
            const balanceData2 = await siengeGet<SiengeRawResponse>(
              `/bank-accounts/${id}`
            );
            balance = balanceData2?.currentBalance ?? balanceData2?.balance ?? balanceData2?.saldo ?? 0;
          } catch {
            balance = 0;
          }
        }
      }

      return {
        bankAccountId: id || 0,
        bankAccountDescription: acc.bankAccountDescription || acc.description || acc.name || "",
        bankCode: acc.bankCode || acc.bank?.code || "",
        bankName: acc.bankName || acc.bank?.name || acc.bankDescription || "",
        agencyNumber: acc.agencyNumber || acc.agency || "",
        accountNumber: acc.accountNumber || acc.account || "",
        companyId: acc.companyId || acc.company?.id || 0,
        companyName: acc.companyName || acc.company?.name || "",
        currentBalance: balance ?? 0,
      };
    }));

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank accounts", details: String(error) },
      { status: 500 }
    );
  }
}
