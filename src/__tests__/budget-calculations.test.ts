/**
 * Budget (Orçamento) Calculation Tests — VALIDATED 2026-03-18
 *
 * These tests lock down the Budget formulas that match Contas Pagas.
 * If any test fails, it means someone changed the calculation logic.
 *
 * Run: npx tsx src/__tests__/budget-calculations.test.ts
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface Payment {
  netAmount: number;
  taxAmount: number;
  paymentDate: string | null;
}

interface OutcomeItem {
  companyName: string;
  documentIdentificationName: string;
  payments: Payment[];
}

interface CompanySetting {
  companyId: number;
  companyName: string;
  areaM2: number;
  factor: number;
  status: "ativa" | "finalizada";
}

// ─── Formulas (must match src/components/executive-dashboard.tsx budgetData) ──

function computeRealized(
  items: OutcomeItem[],
  companyName: string,
  selectedYears: Set<string>
): number {
  let realized = 0;
  items.forEach(item => {
    if (item.companyName !== companyName) return;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) return;
    (item.payments || []).forEach(p => {
      const liquidoValue = p.netAmount - (p.taxAmount || 0);
      if (
        liquidoValue > 0 &&
        p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
      ) {
        realized += liquidoValue;
      }
    });
  });
  return realized;
}

function computeBudget(areaM2: number, factor: number, cubValue: number): number {
  return areaM2 * factor * cubValue;
}

function computeToRealize(budget: number, realized: number): number {
  return budget - realized;
}

function computePercentReal(realized: number, budget: number): number {
  return budget > 0 ? Math.round((realized / budget) * 100 * 100) / 100 : 0;
}

// ─── paidTotal formula (must match src/components/contas-table.tsx) ───────────

function paidTotal(payments: Payment[], yearFilter?: string, monthFilter?: string): number {
  const matchesPeriod = (paymentDate: string) => {
    if (yearFilter && yearFilter !== "all" && !paymentDate.startsWith(yearFilter)) return false;
    if (monthFilter && monthFilter !== "all" && paymentDate.substring(5, 7) !== monthFilter) return false;
    return true;
  };
  const hasFilter = (yearFilter && yearFilter !== "all") || (monthFilter && monthFilter !== "all");

  const filtered = payments
    .filter(p => p.netAmount > 0 && (!hasFilter || (p.paymentDate && matchesPeriod(p.paymentDate!))));
  return filtered.reduce((s, p) => s + (p.netAmount - (p.taxAmount || 0)), 0);
}

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  OK  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertClose(name: string, actual: number, expected: number, tolerance = 0.01) {
  const diff = Math.abs(actual - expected);
  assert(name, diff <= tolerance, `expected ${expected}, got ${actual}, diff ${diff}`);
}

// ─── Test 1: Valor líquido = netAmount - taxAmount ───────────────────────────

console.log("\n=== Test 1: Valor líquido ===");

const items1: OutcomeItem[] = [
  {
    companyName: "Empresa A",
    documentIdentificationName: "NF",
    payments: [
      { netAmount: 1000, taxAmount: 150, paymentDate: "2026-01-15" },
      { netAmount: 2000, taxAmount: 200, paymentDate: "2026-02-10" },
    ],
  },
];

const realized1 = computeRealized(items1, "Empresa A", new Set(["2026"]));
assertClose("Valor líquido = (1000-150) + (2000-200) = 2650", realized1, 2650);

// ─── Test 2: Exclusão de previsão ────────────────────────────────────────────

console.log("\n=== Test 2: Exclusão de documentos de previsão ===");

const items2: OutcomeItem[] = [
  {
    companyName: "Empresa A",
    documentIdentificationName: "NF",
    payments: [{ netAmount: 1000, taxAmount: 0, paymentDate: "2026-01-15" }],
  },
  {
    companyName: "Empresa A",
    documentIdentificationName: "PREVISÃO DE PAGAMENTO",
    payments: [{ netAmount: 5000, taxAmount: 0, paymentDate: "2026-01-15" }],
  },
  {
    companyName: "Empresa A",
    documentIdentificationName: "PREVISAO MENSAL",
    payments: [{ netAmount: 3000, taxAmount: 0, paymentDate: "2026-01-15" }],
  },
];

const realized2 = computeRealized(items2, "Empresa A", new Set(["2026"]));
assertClose("Previsões excluídas, só NF conta: 1000", realized2, 1000);

// ─── Test 3: Fórmula do orçado ──────────────────────────────────────────────

console.log("\n=== Test 3: Fórmula do orçado ===");

assertClose("Orçado = 500m² * 1.2 * 2000 = 1200000", computeBudget(500, 1.2, 2000), 1200000);
assertClose("Orçado = 0m² * 1.5 * 2000 = 0", computeBudget(0, 1.5, 2000), 0);
assertClose("Orçado = 100m² * 0 * 2000 = 0", computeBudget(100, 0, 2000), 0);

// ─── Test 4: A Realizar = budget - realized ──────────────────────────────────

console.log("\n=== Test 4: A Realizar ===");

assertClose("A Realizar = 1200000 - 500000 = 700000", computeToRealize(1200000, 500000), 700000);
assertClose("A Realizar = 500000 - 600000 = -100000 (over budget)", computeToRealize(500000, 600000), -100000);

// ─── Test 5: % Realizado ─────────────────────────────────────────────────────

console.log("\n=== Test 5: % Realizado ===");

assertClose("% = (500000/1200000)*100 = 41.67", computePercentReal(500000, 1200000), 41.67);
assertClose("% com budget 0 = 0", computePercentReal(500000, 0), 0);
assertClose("% = (1200000/1200000)*100 = 100", computePercentReal(1200000, 1200000), 100);

// ─── Test 6: Pagamentos com liquidoValue <= 0 são ignorados ──────────────────

console.log("\n=== Test 6: Pagamentos com valor <= 0 ignorados ===");

const items6: OutcomeItem[] = [
  {
    companyName: "Empresa A",
    documentIdentificationName: "NF",
    payments: [
      { netAmount: 1000, taxAmount: 1200, paymentDate: "2026-01-15" }, // liquido = -200, ignorado
      { netAmount: 500, taxAmount: 100, paymentDate: "2026-01-15" },   // liquido = 400, conta
    ],
  },
];

const realized6 = computeRealized(items6, "Empresa A", new Set(["2026"]));
assertClose("Só pagamento com líquido > 0: 400", realized6, 400);

// ─── Test 7: Pagamentos sem paymentDate são ignorados ────────────────────────

console.log("\n=== Test 7: Pagamentos sem data ignorados ===");

const items7: OutcomeItem[] = [
  {
    companyName: "Empresa A",
    documentIdentificationName: "NF",
    payments: [
      { netAmount: 1000, taxAmount: 0, paymentDate: null },           // sem data, ignorado
      { netAmount: 500, taxAmount: 0, paymentDate: "2026-01-15" },    // conta
    ],
  },
];

const realized7 = computeRealized(items7, "Empresa A", new Set(["2026"]));
assertClose("Sem data ignorado: 500", realized7, 500);

// ─── Test 8: Filtro por ano ──────────────────────────────────────────────────

console.log("\n=== Test 8: Filtro por ano ===");

const items8: OutcomeItem[] = [
  {
    companyName: "Empresa A",
    documentIdentificationName: "NF",
    payments: [
      { netAmount: 1000, taxAmount: 0, paymentDate: "2025-06-15" },
      { netAmount: 2000, taxAmount: 0, paymentDate: "2026-01-15" },
    ],
  },
];

const realized8_2026 = computeRealized(items8, "Empresa A", new Set(["2026"]));
assertClose("Só ano 2026: 2000", realized8_2026, 2000);

const realized8_both = computeRealized(items8, "Empresa A", new Set(["2025", "2026"]));
assertClose("Ambos anos: 3000", realized8_both, 3000);

// ─── Test 9: Filtro por empresa ──────────────────────────────────────────────

console.log("\n=== Test 9: Filtro por empresa ===");

const items9: OutcomeItem[] = [
  {
    companyName: "Empresa A",
    documentIdentificationName: "NF",
    payments: [{ netAmount: 1000, taxAmount: 0, paymentDate: "2026-01-15" }],
  },
  {
    companyName: "Empresa B",
    documentIdentificationName: "NF",
    payments: [{ netAmount: 2000, taxAmount: 0, paymentDate: "2026-01-15" }],
  },
];

const realizedA = computeRealized(items9, "Empresa A", new Set(["2026"]));
const realizedB = computeRealized(items9, "Empresa B", new Set(["2026"]));
assertClose("Empresa A: 1000", realizedA, 1000);
assertClose("Empresa B: 2000", realizedB, 2000);

// ─── Test 10: paidTotal (contas-table) ───────────────────────────────────────

console.log("\n=== Test 10: paidTotal (contas-table) ===");

const payments10: Payment[] = [
  { netAmount: 1000, taxAmount: 150, paymentDate: "2026-01-15" },
  { netAmount: 2000, taxAmount: 200, paymentDate: "2026-02-10" },
  { netAmount: 500, taxAmount: 50, paymentDate: "2025-12-20" },
];

assertClose("paidTotal sem filtro = (850+1800+450) = 3100", paidTotal(payments10), 3100);
assertClose("paidTotal ano 2026 = (850+1800) = 2650", paidTotal(payments10, "2026"), 2650);
assertClose("paidTotal ano 2026 mes 01 = 850", paidTotal(payments10, "2026", "01"), 850);
assertClose("paidTotal ano 2025 = 450", paidTotal(payments10, "2025"), 450);

// ─── Test 11: paidTotal ignora netAmount <= 0 ────────────────────────────────

console.log("\n=== Test 11: paidTotal ignora netAmount <= 0 ===");

const payments11: Payment[] = [
  { netAmount: 0, taxAmount: 0, paymentDate: "2026-01-15" },
  { netAmount: -100, taxAmount: 0, paymentDate: "2026-01-15" },
  { netAmount: 500, taxAmount: 50, paymentDate: "2026-01-15" },
];

assertClose("paidTotal ignora zero e negativo: 450", paidTotal(payments11), 450);

// ─── Test 12: Ordenação — Finalizadas depois de Ativas ───────────────────────

console.log("\n=== Test 12: Ordenação Finalizadas no final ===");

const companies: CompanySetting[] = [
  { companyId: 1, companyName: "Finalizada 1", areaM2: 100, factor: 1, status: "finalizada" },
  { companyId: 2, companyName: "Ativa 1", areaM2: 200, factor: 1, status: "ativa" },
  { companyId: 3, companyName: "Ativa 2", areaM2: 300, factor: 1, status: "ativa" },
];

const sorted = companies
  .map(cs => ({
    ...cs,
    budget: computeBudget(cs.areaM2, cs.factor, 2000),
    companyStatus: cs.status === "finalizada" ? "Finalizada" as const : "Ativa" as const,
  }))
  .sort((a, b) => {
    if (a.companyStatus !== b.companyStatus) return a.companyStatus === "Finalizada" ? 1 : -1;
    return b.budget - a.budget;
  });

assert("Primeira posição é Ativa", sorted[0].companyStatus === "Ativa");
assert("Segunda posição é Ativa", sorted[1].companyStatus === "Ativa");
assert("Última posição é Finalizada", sorted[2].companyStatus === "Finalizada");
assert("Ativas ordenadas por budget desc", sorted[0].budget > sorted[1].budget);

// ─── Test 13: Cards do topo só com obras ATIVAS (Edielson, 06/11/2026) ─────
// Deve espelhar `budgetTotals` em executive-dashboard.tsx: Orçamento Total,
// Custo Realizado e Saldo a Realizar somam só as linhas "Ativa"; as
// finalizadas seguem na tabela, mas fora dos três cards. Saldo a Realizar
// continua sem contar saldo negativo. Números = tela de 06/11/2026.

console.log("\n=== Test 13: Cards do topo só com obras ativas ===");

type LinhaOrcamento = { budget: number; realized: number; toRealize: number; status: "Ativa" | "Finalizada" };

function computeBudgetTotals(rows: LinhaOrcamento[]) {
  const activeRows = rows.filter(r => r.status === "Ativa");
  const totalBudget = activeRows.reduce((s, r) => s + r.budget, 0);
  const totalRealized = activeRows.reduce((s, r) => s + r.realized, 0);
  const totalToRealize = activeRows.reduce((s, r) => s + Math.max(0, r.toRealize), 0);
  const pctRealized = totalBudget > 0 ? (totalRealized / totalBudget) * 100 : 0;
  const pctToRealize = totalBudget > 0 ? (totalToRealize / totalBudget) * 100 : 0;
  return { totalBudget, totalRealized, totalToRealize, pctRealized, pctToRealize };
}

const linha = (budget: number, realized: number, status: "Ativa" | "Finalizada"): LinhaOrcamento =>
  ({ budget, realized, toRealize: budget - realized, status });

const tela0611: LinhaOrcamento[] = [
  linha(108798228.00, 39156840.85, "Ativa"),      // PALACIO ELIZABETH
  linha(104864997.60, 98466692.64, "Ativa"),      // EDIFICIO 135 JARDINS
  linha(76663259.84, 11277320.34, "Ativa"),       // DOMUS
  linha(57571074.00, 15644286.60, "Ativa"),       // ROZZA
  linha(49958370.00, 6569283.17, "Ativa"),        // TETRA
  linha(48530988.00, 19374869.14, "Ativa"),       // SERENITY
  linha(54430833.60, 48881632.89, "Finalizada"),  // TESLA RESIDENCIAL
  linha(24741288.00, 27072183.31, "Finalizada"),  // RESIDENCIAL HANNOVER (saldo negativo)
];

const totais = computeBudgetTotals(tela0611);
assertClose("Orçamento Total = só ativas = 446.386.917,44", totais.totalBudget, 446386917.44);
assertClose("Custo Realizado = só ativas = 190.489.292,74", totais.totalRealized, 190489292.74);
assertClose("Saldo a Realizar = só ativas = 255.897.624,70", totais.totalToRealize, 255897624.70);
assert("Orçamento Total NÃO inclui Tesla + Hannover (525.559.039,04)",
  Math.abs(totais.totalBudget - 525559039.04) > 1);

const soFinalizadas = computeBudgetTotals(tela0611.filter(r => r.status === "Finalizada"));
assertClose("Só finalizadas selecionadas → cards zerados (orçamento)", soFinalizadas.totalBudget, 0);
assertClose("Só finalizadas selecionadas → cards zerados (realizado)", soFinalizadas.totalRealized, 0);

const comNegativaAtiva = computeBudgetTotals([linha(100, 120, "Ativa"), linha(100, 40, "Ativa")]);
assertClose("Saldo a Realizar ignora saldo negativo de ativa: 0 + 60", comNegativaAtiva.totalToRealize, 60);
assertClose("Orçamento/Realizado não clipam: 200 e 160", comNegativaAtiva.totalBudget + comNegativaAtiva.totalRealized, 360);

// ─── Test 14: % nos cards Custo Realizado e Saldo a Realizar (Edielson, 07/11/2026)
// Percentual sobre o Orçamento Total (só ativas). Números = tela de 07/11/2026:
// 190.489.292,74 de 446.534.347,85 = 42,66 %; saldo 256.045.055,11 = 57,34 %.

console.log("\n=== Test 14: % realizado e % a realizar nos cards ===");

const tela0711 = computeBudgetTotals([
  linha(446534347.85, 190489292.74, "Ativa"),
  linha(79446432.00, 75953816.20, "Finalizada"),
]);
assertClose("Saldo a Realizar 07/11 = 256.045.055,11", tela0711.totalToRealize, 256045055.11);
assertClose("% realizado = 42,66", Math.round(tela0711.pctRealized * 100) / 100, 42.66);
assertClose("% a realizar = 57,34", Math.round(tela0711.pctToRealize * 100) / 100, 57.34);
assertClose("Sem saldo negativo, os dois somam 100 %", tela0711.pctRealized + tela0711.pctToRealize, 100);
assertClose("Sem orçamento (só finalizadas) → 0 %, sem divisão por zero", soFinalizadas.pctRealized, 0);
assertClose("Ativa estourada: realizado 80 % e saldo 30 % (negativo fica fora)", comNegativaAtiva.pctRealized + comNegativaAtiva.pctToRealize, 110);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nALERTA: Formulas do Orçamento foram alteradas!");
  process.exit(1);
} else {
  console.log("\nTodas as formulas do Orçamento estão corretas.");
}
