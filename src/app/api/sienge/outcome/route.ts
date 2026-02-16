import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
  const startDate = searchParams.get("startDate") || "2015-01-01";
  const endDate = searchParams.get("endDate") || "2040-12-31";

  const url = new URL(`${SIENGE_BASE}/outcome`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("selectionType", "D");
  url.searchParams.set("correctionIndexerId", "0");
  url.searchParams.set("correctionDate", new Date().toISOString().split("T")[0]);
  url.searchParams.set("withAuthorizations", "false");
  url.searchParams.set("withBankMovements", "true");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      next: { revalidate: 120 },
    });

    if (!response.ok) {
      throw new Error(`Sienge API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching outcome:", error);
    return NextResponse.json(
      { error: "Failed to fetch outcome data" },
      { status: 500 }
    );
  }
}
