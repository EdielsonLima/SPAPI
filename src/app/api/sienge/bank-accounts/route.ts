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
    // Sienge endpoint: GET /accounts-balances (Saldo de Contas Correntes)
    const today = new Date().toISOString().split("T")[0];

    const firstPage = await siengeGet<SiengeRawResponse>(
      "/accounts-balances",
      { date: today, offset: "0", limit: "100" }
    );

    console.log("[accounts-balances] Raw response keys:", Object.keys(firstPage || {}));
    console.log("[accounts-balances] Sample:", JSON.stringify(firstPage).substring(0, 1000));

    const results = firstPage?.results || firstPage?.data || (Array.isArray(firstPage) ? firstPage : []);
    const total = firstPage?.resultSetMetadata?.count || results.length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allAccounts: any[] = [...results];
    let offset = results.length;

    while (offset < total) {
      const page = await siengeGet<SiengeRawResponse>(
        "/accounts-balances",
        { date: today, offset: String(offset), limit: "100" }
      );
      const pageResults = page?.results || page?.data || [];
      if (pageResults.length === 0) break;
      allAccounts.push(...pageResults);
      offset += pageResults.length;
    }

    console.log(`[accounts-balances] Total fetched: ${allAccounts.length}`);
    if (allAccounts.length > 0) {
      console.log("[accounts-balances] Sample fields:", Object.keys(allAccounts[0]));
      console.log("[accounts-balances] Sample:", JSON.stringify(allAccounts[0]).substring(0, 500));
    }

    // Map to normalized structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = allAccounts.map((acc: any) => ({
      bankAccountId: acc.bankAccountId || acc.accountId || acc.id || 0,
      bankAccountDescription: acc.bankAccountDescription || acc.description || acc.accountDescription || "",
      bankCode: acc.bankCode || acc.bank?.code || "",
      bankName: acc.bankName || acc.bank?.name || acc.bankDescription || "",
      agencyNumber: acc.agencyNumber || acc.agency || "",
      accountNumber: acc.accountNumber || acc.account || "",
      companyId: acc.companyId || acc.company?.id || 0,
      companyName: acc.companyName || acc.company?.name || acc.enterpriseName || "",
      currentBalance: acc.currentBalance ?? acc.balance ?? acc.value ?? acc.saldo ?? 0,
    }));

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching accounts-balances:", error);
    return NextResponse.json(
      { error: "Failed to fetch account balances", details: String(error) },
      { status: 500 }
    );
  }
}
