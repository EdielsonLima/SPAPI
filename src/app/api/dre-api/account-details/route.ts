import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedOutcomeContaining, getCachedIncomeContaining, getCachedBankMovementsContaining } from "@/lib/db";

// Debug endpoint — mostra transacoes de uma financialCategoryId especifica
// agrupadas por empresa. Util pra investigar onde uma conta tem movimento
// quando ela aparece no Excel mas some do DRE API (ou vice-versa).
//
// GET /api/dre-api/account-details?id=10302&year=2026

type SiengePayment = {
  netAmount: number;
  paymentDate?: string;
};

type SiengePaymentsCategory = {
  financialCategoryId: string | number;
  financialCategoryName?: string;
  financialCategoryRate?: number;
};

type SiengeOutcomeItem = {
  companyName: string;
  documentIdentificationName?: string | null;
  forecastDocument?: string | null;
  paymentsCategories?: SiengePaymentsCategory[];
  payments?: SiengePayment[];
};

type SiengeIncomeItem = {
  companyName: string;
  clientName?: string;
  documentIdentificationName?: string | null;
  receiptsCategories?: SiengePaymentsCategory[];
  paymentsCategories?: SiengePaymentsCategory[];
  payments?: SiengePayment[];
};

type SiengeBankMovementItem = {
  companyName: string;
  bankMovementAmount: number;
  bankMovementDate?: string;
  bankMovementHistoricName?: string;
  bankMovementOperationType?: string;
  documentIdentificationName?: string | null;
  billId?: number | null;
  financialCategories?: SiengePaymentsCategory[];
};

function readArray<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== "object") return [];
  const r = payload as Record<string, unknown>;
  if (Array.isArray(r.data)) return r.data as T[];
  if (Array.isArray(r.results)) return r.results as T[];
  return [];
}

function isPrevisao(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().startsWith("PREVISAO");
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetId = String(searchParams.get("id") || "").trim();
  const year = searchParams.get("year") || String(new Date().getFullYear());
  if (!targetId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  try {
    const [outR, incR, bmR] = await Promise.all([
      getCachedOutcomeContaining(startDate, endDate),
      getCachedIncomeContaining(startDate, endDate),
      getCachedBankMovementsContaining(startDate, endDate),
    ]);

    type CompanyStat = { totalOut: number; totalInc: number; totalBm: number; count: number };
    const byCompany = new Map<string, CompanyStat>();
    const addCompany = (company: string, src: "out" | "inc" | "bm", amount: number) => {
      if (!byCompany.has(company)) {
        byCompany.set(company, { totalOut: 0, totalInc: 0, totalBm: 0, count: 0 });
      }
      const e = byCompany.get(company)!;
      e.count++;
      if (src === "out") e.totalOut += amount;
      if (src === "inc") e.totalInc += amount;
      if (src === "bm") e.totalBm += amount;
    };

    const samples: Array<{ source: string; company: string; date: string; amount: number; name?: string }> = [];

    const outcome = readArray<SiengeOutcomeItem>(outR?.data);
    for (const item of outcome) {
      if (isPrevisao(item.documentIdentificationName) || item.forecastDocument === "S") continue;
      const cats = item.paymentsCategories || [];
      if (!cats.some(c => String(c.financialCategoryId).trim() === targetId)) continue;
      for (const p of item.payments || []) {
        if (!p.netAmount || !p.paymentDate?.startsWith(year)) continue;
        const cat = cats.find(c => String(c.financialCategoryId).trim() === targetId)!;
        const rate = (typeof cat.financialCategoryRate === "number" && cat.financialCategoryRate > 0) ? cat.financialCategoryRate / 100 : 1;
        const value = p.netAmount * rate;
        addCompany(item.companyName, "out", value);
        if (samples.length < 30) {
          samples.push({ source: "out", company: item.companyName, date: p.paymentDate, amount: value, name: item.documentIdentificationName || undefined });
        }
      }
    }

    const income = readArray<SiengeIncomeItem>(incR?.data);
    for (const item of income) {
      if (isPrevisao(item.documentIdentificationName)) continue;
      const cats = item.receiptsCategories || item.paymentsCategories || [];
      if (!cats.some(c => String(c.financialCategoryId).trim() === targetId)) continue;
      for (const p of item.payments || []) {
        if (!p.netAmount || p.netAmount <= 0 || !p.paymentDate?.startsWith(year)) continue;
        const cat = cats.find(c => String(c.financialCategoryId).trim() === targetId)!;
        const rate = (typeof cat.financialCategoryRate === "number" && cat.financialCategoryRate > 0) ? cat.financialCategoryRate / 100 : 1;
        const value = p.netAmount * rate;
        addCompany(item.companyName, "inc", value);
        if (samples.length < 30) {
          samples.push({ source: "inc", company: item.companyName, date: p.paymentDate, amount: value, name: item.clientName });
        }
      }
    }

    const bms = readArray<SiengeBankMovementItem>(bmR?.data);
    for (const bm of bms) {
      if (!bm.bankMovementAmount || !bm.bankMovementDate?.startsWith(year)) continue;
      const cats = bm.financialCategories || [];
      if (!cats.some(c => String(c.financialCategoryId).trim() === targetId)) continue;
      const cat = cats.find(c => String(c.financialCategoryId).trim() === targetId)!;
      const rate = (typeof cat.financialCategoryRate === "number" && cat.financialCategoryRate > 0) ? cat.financialCategoryRate / 100 : 1;
      const value = Math.abs(bm.bankMovementAmount) * rate;
      addCompany(bm.companyName, "bm", value);
      if (samples.length < 30) {
        samples.push({ source: "bm", company: bm.companyName, date: bm.bankMovementDate, amount: value, name: bm.bankMovementHistoricName });
      }
    }

    const companies = Array.from(byCompany.entries())
      .map(([company, stats]) => ({
        company,
        total: stats.totalOut + stats.totalInc + stats.totalBm,
        totalOut: stats.totalOut,
        totalInc: stats.totalInc,
        totalBm: stats.totalBm,
        transactionCount: stats.count,
      }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    const grandTotal = companies.reduce((s, c) => s + c.total, 0);

    return NextResponse.json({
      year,
      financialCategoryId: targetId,
      grandTotal,
      transactionCount: companies.reduce((s, c) => s + c.transactionCount, 0),
      companies,
      samples,
    });
  } catch (error) {
    console.error("Error in account-details:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
