import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

interface SiengeBankAccountBalance {
  bankAccountId: number;
  bankAccountDescription: string;
  bankCode: string;
  bankName: string;
  agencyNumber: string;
  accountNumber: string;
  companyId: number;
  companyName: string;
  currentBalance: number;
}

interface SiengePaginatedResponse {
  resultSetMetadata: { count: number; offset: number; limit: number };
  results: SiengeBankAccountBalance[];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all bank accounts with pagination
    const allAccounts: SiengeBankAccountBalance[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await siengeGet<SiengePaginatedResponse>(
        "/bank-accounts",
        { offset: String(offset), limit: String(limit) }
      );

      if (data.results && data.results.length > 0) {
        allAccounts.push(...data.results);
      }

      const total = data.resultSetMetadata?.count || 0;
      offset += limit;
      if (offset >= total || !data.results || data.results.length === 0) break;
    }

    return NextResponse.json({ data: allAccounts });
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank accounts", details: String(error) },
      { status: 500 }
    );
  }
}
