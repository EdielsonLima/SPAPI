import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedOutcome, getCachedIncome, getCachedBankMovements, getDreMappings } from "@/lib/db";

// DRE API — calcula DRE em runtime a partir das movimentações financeiras do
// Sienge (outcome/income/bank-movements), sem depender do Excel.
//
// Agrupa por financialCategoryId (paymentsCategories[].financialCategoryId)
// e usa a tabela dre_mappings (financialPlanId → dreCategory) pra obter a
// linha DRE correspondente. Conta sem mapping aparece com dreCategory vazio
// — soma nos detalhes mas não entra nas linhas calculadas até o usuário
// configurar em Cadastros > DRE.
//
// Formato de saída idêntico ao /api/dre-supplementary pra que a DreTab
// consuma ambos sem mudar o resto da lógica.

type SiengePayment = {
  netAmount: number;
  paymentDate?: string;
  operationTypeName?: string;
};

type SiengePaymentsCategory = {
  financialCategoryId: string | number;
  financialCategoryName: string;
  financialCategoryRate?: number; // 0-100, proporção do payment
  costCenterName?: string;
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

function isExcludedDocType(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  return n.startsWith("PREVISAO");
}

// Filtros de BMs avulsos pra DRE — mesmos validados nas páginas CP/CR.
function bmIsRelevantOutflow(bm: SiengeBankMovementItem): boolean {
  if (!bm.bankMovementAmount || bm.bankMovementAmount === 0) return false;
  if (bm.bankMovementOperationType !== "S") return false;
  const docName = (bm.documentIdentificationName || "").toUpperCase();
  if (docName.includes("TRANSFER") && docName.includes("ENTRE CONTAS")) return false;
  const cats = bm.financialCategories || [];
  if (cats.length === 0) return false;
  const historic = (bm.bankMovementHistoricName || "").toLowerCase();
  const excl = ["rendimento", "aplicação", "aplicacao", "resgate", "saque", "depósito", "deposito", "recebimento", "cheque"];
  if (excl.some(p => historic.includes(p))) return false;
  return true;
}

function bmIsRelevantInflow(bm: SiengeBankMovementItem): boolean {
  if (!bm.bankMovementAmount || bm.bankMovementAmount === 0) return false;
  if (bm.billId) return false; // já está em receipts[]
  if (bm.bankMovementOperationType !== "E") return false;
  const historic = (bm.bankMovementHistoricName || "").toLowerCase().trim();
  if (historic.includes("transferência") || historic.includes("transferencia")) return false;
  if (historic === "aplicação" || historic === "aplicacao") return false;
  if (historic.includes("pagamento") || historic.includes("saque") ||
      historic.includes("depósito") || historic.includes("deposito") ||
      historic.includes("cheque emitido")) return false;
  const cats = bm.financialCategories || [];
  const isReceita = cats.length === 0 || cats.some(fc => (fc as unknown as { financialCategoryType?: string }).financialCategoryType === "R");
  if (!isReceita) return false;
  const catNames = cats.map(fc => (fc.financialCategoryName || "").toLowerCase()).join(" ");
  if (catNames.includes("transferência") || catNames.includes("transferencia")) return false;
  return true;
}

function readArray<T>(payload: unknown, key = "data"): T[] {
  if (!payload || typeof payload !== "object") return [];
  const r = payload as Record<string, unknown>;
  const candidates = [r[key], r.data, r.results];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as T[];
  }
  return [];
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());
  const excludeParam = searchParams.get("excludeCompanies");
  const monthsParam = searchParams.get("months");
  const monthly = searchParams.get("monthly") === "true";

  const excludeCompanies = excludeParam
    ? new Set(excludeParam.split(",").map(s => s.trim().toUpperCase()))
    : new Set<string>();
  const monthsFilter = monthsParam
    ? new Set(monthsParam.split(",").map(s => s.trim().padStart(2, "0")))
    : null;

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  try {
    const [outcomeCache, incomeCache, bmCache, mappingsByCategory] = await Promise.all([
      getCachedOutcome(startDate, endDate),
      getCachedIncome(startDate, endDate),
      getCachedBankMovements(startDate, endDate),
      getDreMappings(),
    ]);

    // Inverte dre_mappings: financialPlanId → dreCategory
    const fpToDre: Record<string, string> = {};
    const fpNames: Record<string, string> = {};
    for (const [dreCat, rows] of Object.entries(mappingsByCategory)) {
      for (const r of rows) {
        fpToDre[r.financialPlanId] = dreCat;
        fpNames[r.financialPlanId] = r.financialPlanName;
      }
    }

    // Acumulador: { financialPlanId: { name, dreCategory, months: { "01": amount } } }
    const acc: Record<string, { name: string; dreCategory: string; months: Record<string, number> }> = {};

    const addToAcc = (cat: SiengePaymentsCategory, amount: number, dateStr: string | undefined, sign: 1 | -1) => {
      if (!dateStr) return;
      const yr = dateStr.substring(0, 4);
      if (yr !== year) return;
      const mm = dateStr.substring(5, 7);
      if (monthsFilter && !monthsFilter.has(mm)) return;

      const fcId = String(cat.financialCategoryId || "").trim();
      if (!fcId) return;

      const rate = typeof cat.financialCategoryRate === "number" && cat.financialCategoryRate > 0
        ? cat.financialCategoryRate / 100
        : 1;
      const value = sign * amount * rate;
      if (value === 0) return;

      const dreCat = fpToDre[fcId] || "";
      const name = fpNames[fcId] || cat.financialCategoryName || `Conta ${fcId}`;

      if (!acc[fcId]) {
        acc[fcId] = { name, dreCategory: dreCat, months: {} };
      }
      acc[fcId].months[mm] = (acc[fcId].months[mm] || 0) + value;
    };

    // 1) Outcome (despesas — saída de caixa)
    const outcomePayload = outcomeCache?.data;
    const outcomeItems = readArray<SiengeOutcomeItem>(outcomePayload);
    for (const item of outcomeItems) {
      if (excludeCompanies.has((item.companyName || "").toUpperCase())) continue;
      if (isExcludedDocType(item.documentIdentificationName) || item.forecastDocument === "S") continue;
      const cats = item.paymentsCategories || [];
      if (cats.length === 0) continue;
      const payments = item.payments || [];
      for (const p of payments) {
        if (!p.netAmount || !p.paymentDate) continue;
        for (const c of cats) addToAcc(c, p.netAmount, p.paymentDate, 1);
      }
    }

    // 2) Income (receitas — entrada de caixa)
    const incomePayload = incomeCache?.data;
    const incomeItems = readArray<SiengeIncomeItem>(incomePayload);
    for (const item of incomeItems) {
      if (excludeCompanies.has((item.companyName || "").toUpperCase())) continue;
      if (isExcludedDocType(item.documentIdentificationName)) continue;
      const cats = item.receiptsCategories || item.paymentsCategories || [];
      if (cats.length === 0) continue;
      const payments = item.payments || [];
      for (const p of payments) {
        if (!p.netAmount || p.netAmount <= 0 || !p.paymentDate) continue;
        for (const c of cats) addToAcc(c, p.netAmount, p.paymentDate, 1);
      }
    }

    // 3) Bank Movements (avulsos sem bill)
    const bmPayload = bmCache?.data;
    const bmItems = readArray<SiengeBankMovementItem>(bmPayload);
    for (const bm of bmItems) {
      if (excludeCompanies.has((bm.companyName || "").toUpperCase())) continue;
      const cats = bm.financialCategories || [];
      if (cats.length === 0) continue;
      const date = bm.bankMovementDate;
      if (bmIsRelevantOutflow(bm)) {
        const amount = Math.abs(bm.bankMovementAmount);
        for (const c of cats) addToAcc(c, amount, date, 1);
      } else if (bmIsRelevantInflow(bm)) {
        const amount = Math.abs(bm.bankMovementAmount);
        for (const c of cats) addToAcc(c, amount, date, 1);
      }
    }

    if (monthly) {
      return NextResponse.json({ data: acc, year, monthly: true, rowCount: Object.keys(acc).length });
    }

    // Default: agrega meses no total anual
    const byAccount: Record<string, { name: string; amount: number; dreCategory: string }> = {};
    for (const [fcId, data] of Object.entries(acc)) {
      const total = Object.values(data.months).reduce((s, v) => s + v, 0);
      byAccount[fcId] = { name: data.name, amount: total, dreCategory: data.dreCategory };
    }
    return NextResponse.json({ data: byAccount, year, rowCount: Object.keys(byAccount).length });
  } catch (error) {
    console.error("Error computing DRE API:", error);
    return NextResponse.json({ data: {}, year, error: error instanceof Error ? error.message : "Unknown" });
  }
}
