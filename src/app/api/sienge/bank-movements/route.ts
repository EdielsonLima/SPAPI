import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedBankMovements, cacheBankMovements } from "@/lib/db";
import { siengeBulkGet } from "@/lib/sienge";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SIENGE_USERNAME = process.env.SIENGE_USERNAME!;
  const SIENGE_PASSWORD = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || "2024-01-01";
  const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    const cached = await getCachedBankMovements(startDate, endDate);
    if (cached) {
        const d = cached.data as Record<string, unknown>;
        return NextResponse.json({ ...d, cachedAt: cached.cachedAt });
      }
  }

  const SIENGE_BASE = process.env.SIENGE_BULK_API_URL!;
  const url = new URL(`${SIENGE_BASE}/bank-movement`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("selectionType", "M");
  url.searchParams.set("onlyDetachedMovement", "S");

  try {
    const response = await siengeBulkGet(url.toString(), authHeader);

    if (response.status === 404) {
      const empty = { data: [] };
      await cacheBankMovements(startDate, endDate, empty);
      return NextResponse.json(empty);
    }

    if (!response.ok) {
      throw new Error(`Sienge API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    await cacheBankMovements(startDate, endDate, data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching bank movements:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank movements" },
      { status: 500 }
    );
  }
}
