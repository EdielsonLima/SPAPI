import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool, { getCompanySettings } from "@/lib/db";

interface OutcomeItem {
  companyName: string;
  balanceAmount: number;
  correctedBalanceAmount: number;
  discountAmount: number;
  taxAmount: number;
  buildingsCosts?: { costEstimationSheetName?: string }[];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getCompanySettings();
    const controladas = new Set(
      settings.filter(s => s.controlaOrcamento).map(s => s.companyName)
    );

    if (controladas.size === 0) {
      return NextResponse.json({ count: 0, valor: 0, companies: [] });
    }

    const r = await pool.query(
      `SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1`
    );
    if (!r.rows.length) {
      return NextResponse.json({ count: 0, valor: 0, companies: [] });
    }

    const rowData = r.rows[0].data;
    const items: OutcomeItem[] = (rowData?.data || rowData || []) as OutcomeItem[];

    const byCompany = new Map<string, { count: number; valor: number }>();
    for (const i of items) {
      if (!controladas.has(i.companyName)) continue;
      if ((i.balanceAmount || 0) <= 0) continue;
      const costs = i.buildingsCosts || [];
      const missing = costs.length === 0 || costs.every(bc => !bc.costEstimationSheetName);
      if (!missing) continue;
      const v = (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
      const prev = byCompany.get(i.companyName) || { count: 0, valor: 0 };
      byCompany.set(i.companyName, { count: prev.count + 1, valor: prev.valor + v });
    }

    const companies = Array.from(byCompany.entries())
      .map(([companyName, s]) => ({ companyName, count: s.count, valor: s.valor }))
      .sort((a, b) => b.valor - a.valor);

    const count = companies.reduce((s, c) => s + c.count, 0);
    const valor = companies.reduce((s, c) => s + c.valor, 0);

    return NextResponse.json({ count, valor, companies });
  } catch (error) {
    console.error("Error computing budget-missing alerts:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
