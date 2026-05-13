import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedOutcomeContaining, getCachedIncomeContaining, getCachedBankMovementsContaining, getDreMappings } from "@/lib/db";

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
//
// IMPORTANTE — sinais: DreTab calcula lucroBruto = receita + custo_variavel
// (soma). O Excel armazena custo_variavel como negativo. Pra DRE API bater
// com a mesma fórmula, aplico sinal negativo nas categorias de despesa
// listadas em NEGATIVE_CATEGORIES (espelho de dre-tab.tsx linha 56-64).
const NEGATIVE_CATEGORIES = new Set([
  "custo_variavel",
  "custo_fixo",
  "despesas_financeiras",
  "despesas_tributarias",
  "imobilizacoes",
  "retiradas",
  "saidas_nao_operacionais",
]);

// Contas do plano financeiro que representam movimentacao bancaria/financeira
// interna (transferencias, aplicacoes/resgates, retencoes temporarias) — nao
// entram na DRE, sao apenas movimento de caixa entre contas. Identificadas em
// 2026-05-13 cruzando /api/dre-api/unmapped com o plano financeiro do Sienge.
const IGNORED_FINANCIAL_CATEGORIES = new Set([
  "10307",      // Transferências Entre Contas
  "1070301",    // Resgate de aplicações financeiras
  "1070305",    // Estorno da Taxa IR da Aplicação (Banco)
  "1070306",    // Estorno da Taxa IOF da Aplicação (Banco)
  "1070309",    // Aplicação
  "2090117",    // Resgate de Aplicação (Banco)
  "2090118",    // Estorno de Resgate Automático (BANCO)
  "2090119",    // Garantia Bloqueada / DAC (Banco)
  "10601",      // Retenção de Caução/Sinal
  "201150251",  // Pagamento Retenção Caução/Sinal
  "202020412",  // Movimentações Administrativas (Escritório) — R$ 11M em BMs
                // avulsos, suspeita de transferencia interna intercompany
]);

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
// IMPORTANTE:
// - billId DEVE ser null pra evitar duplicacao com outcome.payments[]
//   (BMs vinculados a bills sao a mesma movimentacao que ja aparece no payment)
// - "Transferência" no historic pode ser:
//   (a) transferencia interna entre contas da mesma empresa → excluir
//   (b) transferencia intercompany legitima classificada como receita/despesa
//       → INCLUIR (sera filtrada por IGNORED_FINANCIAL_CATEGORIES se for 10307,
//       ou processada normalmente se for receita/despesa real)
//   Diferenciamos pelo `financialCategories`: se a categoria for IGNORED ou
//   estiver vazia, e transferencia interna → excluir.
function hasMeaningfulCategory(cats: SiengePaymentsCategory[]): boolean {
  if (cats.length === 0) return false;
  return cats.some(c => !IGNORED_FINANCIAL_CATEGORIES.has(String(c.financialCategoryId).trim()));
}

function bmIsRelevantOutflow(bm: SiengeBankMovementItem): boolean {
  if (!bm.bankMovementAmount || bm.bankMovementAmount === 0) return false;
  if (bm.billId) return false; // ja contado em outcome.payments[]
  if (bm.bankMovementOperationType !== "S") return false;
  const docName = (bm.documentIdentificationName || "").toUpperCase();
  if (docName.includes("TRANSFER") && docName.includes("ENTRE CONTAS")) return false;
  const cats = bm.financialCategories || [];
  if (!hasMeaningfulCategory(cats)) return false;
  const historic = (bm.bankMovementHistoricName || "").toLowerCase();
  // Bloqueia historic financeiros internos APENAS quando nao ha categoria
  // mapeada como real (despesa/receita). Se tem categoria real, deixa passar.
  const exclHistoric = ["rendimento", "aplicação", "aplicacao", "resgate", "saque", "depósito", "deposito", "recebimento", "cheque"];
  if (exclHistoric.some(p => historic.includes(p)) && !hasMappedRealCategory(cats)) return false;
  return true;
}

function bmIsRelevantInflow(bm: SiengeBankMovementItem): boolean {
  if (!bm.bankMovementAmount || bm.bankMovementAmount === 0) return false;
  if (bm.billId) return false; // já está em receipts[]
  if (bm.bankMovementOperationType !== "E") return false;
  const cats = bm.financialCategories || [];
  if (!hasMeaningfulCategory(cats)) return false;
  const historic = (bm.bankMovementHistoricName || "").toLowerCase().trim();
  // Bloqueia historic financeiros internos APENAS quando nao ha categoria
  // mapeada como real. Transferencias intercompany categorizadas como receita
  // (ex: 10302 - Receita de Locacao Outras Empresas) DEVEM passar aqui.
  const exclHistoric = ["aplicação", "aplicacao", "saque", "depósito", "deposito", "cheque emitido"];
  if (historic === "aplicação" || historic === "aplicacao") return false;
  if (exclHistoric.some(p => historic.includes(p)) && !hasMappedRealCategory(cats)) return false;
  if (historic.includes("pagamento") && !hasMappedRealCategory(cats)) return false;
  return true;
}

// Categorias mapeadas pra alguma linha real da DRE (receita/despesa) sao
// "categorias reais"; aceitamos elas mesmo quando o historic do BM sugere
// movimento interno. Setado dinamicamente dentro do GET (depois de carregar
// dre_mappings).
let mappedRealCategoryIds: Set<string> = new Set();
function hasMappedRealCategory(cats: SiengePaymentsCategory[]): boolean {
  return cats.some(c => mappedRealCategoryIds.has(String(c.financialCategoryId).trim()));
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
      getCachedOutcomeContaining(startDate, endDate),
      getCachedIncomeContaining(startDate, endDate),
      getCachedBankMovementsContaining(startDate, endDate),
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
    // Popula mappedRealCategoryIds usado por bmIsRelevant* pra deixar passar
    // BMs com historic "Transferência" desde que a categoria seja mapeada
    // (ex: 10302 - Receita de Locacao Outras Empresas e uma transferencia
    // intercompany legitima categorizada como receita).
    mappedRealCategoryIds = new Set(Object.keys(fpToDre));

    // Acumulador: { financialPlanId: { name, dreCategory, months: { "01": amount } } }
    const acc: Record<string, { name: string; dreCategory: string; months: Record<string, number> }> = {};

    const addToAcc = (cat: SiengePaymentsCategory, amount: number, dateStr: string | undefined) => {
      if (!dateStr) return;
      const yr = dateStr.substring(0, 4);
      if (yr !== year) return;
      const mm = dateStr.substring(5, 7);
      if (monthsFilter && !monthsFilter.has(mm)) return;

      const fcId = String(cat.financialCategoryId || "").trim();
      if (!fcId) return;
      if (IGNORED_FINANCIAL_CATEGORIES.has(fcId)) return;

      const rate = typeof cat.financialCategoryRate === "number" && cat.financialCategoryRate > 0
        ? cat.financialCategoryRate / 100
        : 1;
      const dreCat = fpToDre[fcId] || "";
      // Aplica sinal negativo nas categorias de despesa pra que a fórmula
      // lucroBruto = receita + custo_variavel da DreTab funcione corretamente.
      const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
      const value = sign * amount * rate;
      if (value === 0) return;

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
        for (const c of cats) addToAcc(c, p.netAmount, p.paymentDate);
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
        for (const c of cats) addToAcc(c, p.netAmount, p.paymentDate);
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
        for (const c of cats) addToAcc(c, amount, date);
      } else if (bmIsRelevantInflow(bm)) {
        const amount = Math.abs(bm.bankMovementAmount);
        for (const c of cats) addToAcc(c, amount, date);
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
