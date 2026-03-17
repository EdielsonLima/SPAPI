import { NextRequest, NextResponse } from "next/server";
import { getDreExcelData, saveDreExcelData } from "@/lib/db";

// GET: Fetch DRE data from Excel cache, optionally filtered by companies and months
// Supports ?monthly=true to return per-month breakdown for DRE Completa view
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());
  const companiesParam = searchParams.get("companies");
  const monthsParam = searchParams.get("months");
  const monthly = searchParams.get("monthly") === "true";

  try {
    const companyNames = companiesParam ? companiesParam.split(",").map(s => s.trim()) : undefined;
    const months = monthsParam ? monthsParam.split(",").map(s => s.trim()) : undefined;
    const rows = await getDreExcelData(year, companyNames, months);

    if (monthly) {
      // Return per-month breakdown: { fcId: { name, dreCategory, months: { "01": amount, "02": amount, ... } } }
      const byAccount: Record<string, { name: string; dreCategory: string; months: Record<string, number> }> = {};
      for (const row of rows) {
        const key = row.financialPlanId;
        if (!byAccount[key]) {
          byAccount[key] = { name: row.financialPlanName, dreCategory: row.dreCategory, months: {} };
        }
        byAccount[key].months[row.month] = (byAccount[key].months[row.month] || 0) + row.amount;
      }
      return NextResponse.json({ data: byAccount, year, monthly: true, rowCount: rows.length });
    }

    // Default: aggregate all months into yearly total (backwards compatible)
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
