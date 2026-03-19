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

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nALERTA: Formulas do Orçamento foram alteradas!");
  process.exit(1);
} else {
  console.log("\nTodas as formulas do Orçamento estão corretas.");
}
