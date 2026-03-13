import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedIncome, cacheIncome } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SIENGE_BASE = process.env.SIENGE_BULK_API_URL!;
  const SIENGE_USERNAME = process.env.SIENGE_USERNAME!;
  const SIENGE_PASSWORD = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || "2024-01-01";
  const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    const cached = await getCachedIncome(startDate, endDate);
    if (cached) return NextResponse.json(cached);
  }

  const url = new URL(`${SIENGE_BASE}/income`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("selectionType", "D");
  url.searchParams.set("correctionIndexerId", "0");
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  url.searchParams.set("correctionDate", localDate);
  url.searchParams.set("withAuthorizations", "false");
  url.searchParams.set("withBankMovements", "true");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Sienge API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    await cacheIncome(startDate, endDate, data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching income:", error);
    return NextResponse.json(
      { error: "Failed to fetch income data" },
      { status: 500 }
    );
  }
}
