import { NextRequest, NextResponse } from "next/server";
import { getDreExcelData, saveDreExcelData } from "@/lib/db";

// GET: Fetch DRE data from Excel cache, optionally filtered by companies
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());
  const companiesParam = searchParams.get("companies"); // comma-separated company names

  try {
    const companyNames = companiesParam ? companiesParam.split(",").map(s => s.trim()) : undefined;
    const rows = await getDreExcelData(year, companyNames);

    // Aggregate by financial plan ID (sum across companies)
    const byAccount: Record<string, { name: string; amount: number; dreCategory: string }> = {};
    for (const row of rows) {
      const key = row.financialPlanId;
      if (!byAccount[key]) {
        byAccount[key] = { name: row.financialPlanName, amount: 0, dreCategory: row.dreCategory };
      }
      byAccount[key].amount += row.amount;
    }

    return NextResponse.json({ data: byAccount, year, rowCount: rows.length });
  } catch (error) {
    console.error("Error fetching DRE supplementary:", error);
    return NextResponse.json({ data: {}, year });
  }
}

// POST: Accept per-company accounts data and save to database
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, accounts } = body;
    if (!year || !accounts || !Array.isArray(accounts)) {
      return NextResponse.json({ error: "Missing year or accounts" }, { status: 400 });
    }
    await saveDreExcelData(year, accounts);
    return NextResponse.json({ message: `Saved ${accounts.length} records for ${year}` });
  } catch (error) {
    console.error("Error saving DRE supplementary:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
