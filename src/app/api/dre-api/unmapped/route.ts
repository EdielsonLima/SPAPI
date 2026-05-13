import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedOutcomeContaining, getCachedIncomeContaining, getCachedBankMovementsContaining, getDreMappings } from "@/lib/db";

// Lista contas do plano financeiro com movimento no ano selecionado que
// NAO estao mapeadas em dre_mappings, ordenadas por valor absoluto.
// Use pra priorizar quais contas mapear em /cadastros/dre.

type SiengePaymentsCategory = {
  financialCategoryId: string | number;
  financialCategoryName: string;
  financialCategoryRate?: number;
};

type SiengeOutcomeItem = {
  documentIdentificationName?: string | null;
  forecastDocument?: string | null;
  paymentsCategories?: SiengePaymentsCategory[];
  payments?: { netAmount: number; paymentDate?: string }[];
};

type SiengeIncomeItem = {
  documentIdentificationName?: string | null;
  receiptsCategories?: SiengePaymentsCategory[];
  paymentsCategories?: SiengePaymentsCategory[];
  payments?: { netAmount: number; paymentDate?: string }[];
};

type SiengeBankMovementItem = {
  bankMovementAmount: number;
  bankMovementDate?: string;
  financialCategories?: SiengePaymentsCategory[];
};

function isPrevisao(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return n.startsWith("PREVISAO");
}

function readArray<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== "object") return [];
  const r = payload as Record<string, unknown>;
  if (Array.isArray(r.data)) return r.data as T[];
  if (Array.isArray(r.results)) return r.results as T[];
  return [];
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  try {
    const [outR, incR, bmR, mappingsByCategory] = await Promise.all([
      getCachedOutcomeContaining(startDate, endDate),
      getCachedIncomeContaining(startDate, endDate),
      getCachedBankMovementsContaining(startDate, endDate),
      getDreMappings(),
    ]);

    const mapped = new Set<string>();
    for (const [, rows] of Object.entries(mappingsByCategory)) {
      for (const r of rows) mapped.add(String(r.financialPlanId).trim());
    }

    const acc = new Map<string, { name: string; total: number; out: number; inc: number; bm: number }>();
    const addRow = (fcId: string | number | undefined, name: string | undefined, amount: number, rate: number | undefined, src: "out" | "inc" | "bm") => {
      if (!fcId) return;
      const id = String(fcId).trim();
      if (!id) return;
      const value = amount * (typeof rate === "number" && rate > 0 ? rate / 100 : 1);
      const v = Math.abs(value);
      if (v === 0) return;
      let entry = acc.get(id);
      if (!entry) {
        entry = { name: name || `Conta ${id}`, total: 0, out: 0, inc: 0, bm: 0 };
        acc.set(id, entry);
      }
      entry.total += v;
      entry[src] += v;
      if (!entry.name && name) entry.name = name;
    };

    const outcome = readArray<SiengeOutcomeItem>(outR?.data);
    for (const item of outcome) {
      if (isPrevisao(item.documentIdentificationName) || item.forecastDocument === "S") continue;
      const cats = item.paymentsCategories || [];
      if (cats.length === 0) continue;
      for (const p of item.payments || []) {
        if (!p.netAmount || !p.paymentDate?.startsWith(year)) continue;
        for (const c of cats) addRow(c.financialCategoryId, c.financialCategoryName, p.netAmount, c.financialCategoryRate, "out");
      }
    }

    const income = readArray<SiengeIncomeItem>(incR?.data);
    for (const item of income) {
      if (isPrevisao(item.documentIdentificationName)) continue;
      const cats = item.receiptsCategories || item.paymentsCategories || [];
      if (cats.length === 0) continue;
      for (const p of item.payments || []) {
        if (!p.netAmount || p.netAmount <= 0 || !p.paymentDate?.startsWith(year)) continue;
        for (const c of cats) addRow(c.financialCategoryId, c.financialCategoryName, p.netAmount, c.financialCategoryRate, "inc");
      }
    }

    const bms = readArray<SiengeBankMovementItem>(bmR?.data);
    for (const bm of bms) {
      if (!bm.bankMovementAmount || !bm.bankMovementDate?.startsWith(year)) continue;
      const cats = bm.financialCategories || [];
      if (cats.length === 0) continue;
      const amount = Math.abs(bm.bankMovementAmount);
      for (const c of cats) addRow(c.financialCategoryId, c.financialCategoryName, amount, c.financialCategoryRate, "bm");
    }

    const unmapped: Array<{ id: string; name: string; total: number; out: number; inc: number; bm: number }> = [];
    let mappedTotal = 0;
    for (const [id, data] of acc.entries()) {
      if (mapped.has(id)) {
        mappedTotal += data.total;
      } else {
        unmapped.push({ id, ...data });
      }
    }
    unmapped.sort((a, b) => b.total - a.total);

    const unmappedTotal = unmapped.reduce((s, r) => s + r.total, 0);
    const grandTotal = unmappedTotal + mappedTotal;

    return NextResponse.json({
      year,
      mappedCount: mapped.size,
      unmappedCount: unmapped.length,
      mappedTotal,
      unmappedTotal,
      grandTotal,
      mappedPct: grandTotal > 0 ? (mappedTotal / grandTotal) * 100 : 0,
      unmappedPct: grandTotal > 0 ? (unmappedTotal / grandTotal) * 100 : 0,
      top: unmapped.slice(0, limit),
    });
  } catch (error) {
    console.error("Error computing unmapped accounts:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
