import { NextRequest, NextResponse } from "next/server";
import { getDreExcelSupplementary, saveDreExcelSupplementary } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());

  try {
    const data = await getDreExcelSupplementary(year);
    return NextResponse.json({ data, year });
  } catch (error) {
    console.error("Error fetching DRE supplementary:", error);
    return NextResponse.json({ data: {}, year });
  }
}

// POST: Accept accounts data and save to database
// Body: { year: string, accounts: [{ financialPlanId, financialPlanName, amount }] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, accounts } = body;
    if (!year || !accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ error: "Missing year or accounts" }, { status: 400 });
    }
    await saveDreExcelSupplementary(year, accounts);
    return NextResponse.json({ message: `Saved ${accounts.length} accounts for ${year}` });
  } catch (error) {
    console.error("Error saving DRE supplementary:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
