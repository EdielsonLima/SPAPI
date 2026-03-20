import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { getCachedSalesContracts, cacheSalesContracts, ensureSalesContractsTable } from "@/lib/db";
import { SiengeSalesContract } from "@/types/sienge";

interface SiengeListResponse {
  resultSetMetadata: { count: number; offset: number; limit: number };
  results: SiengeSalesContract[];
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  // Ensure table exists (auto-migration for production)
  await ensureSalesContractsTable();

  // Check cache first
  if (!forceRefresh) {
    try {
      const cached = await getCachedSalesContracts();
      if (cached) {
        const d = cached.data as Record<string, unknown>;
        return NextResponse.json({ ...d, cachedAt: cached.cachedAt });
      }
    } catch {
      // Cache miss, proceed to fetch
    }
  }

  try {
    // Fetch all pages of sales contracts
    const allContracts: SiengeSalesContract[] = [];
    const pageSize = 200;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await siengeGet<SiengeListResponse>(
        "/sales-contracts",
        { limit: String(pageSize), offset: String(offset) }
      );

      if (response.results && response.results.length > 0) {
        allContracts.push(...response.results);
        offset += response.results.length;
        hasMore = response.results.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const result = { data: allContracts, total: allContracts.length };

    // Cache the result
    try {
      await cacheSalesContracts(result);
    } catch (e) {
      console.error("Failed to cache sales contracts:", e);
    }

    return NextResponse.json({ ...result, cachedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error fetching sales contracts:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales contracts" },
      { status: 500 }
    );
  }
}
