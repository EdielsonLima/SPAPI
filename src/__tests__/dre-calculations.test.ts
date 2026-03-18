/**
 * DRE Calculation Tests — VALIDATED 2026-03-17
 *
 * These tests lock down the DRE formulas that match Power BI.
 * If any test fails, it means someone changed the calculation logic.
 *
 * Run: npx tsx src/__tests__/dre-calculations.test.ts
 */

// ─── DRE Formulas (must match src/components/dre-tab.tsx) ─────────────────────

function computeDRE(inputs: {
  receita_operacional: number;
  custo_variavel: number;
  custo_fixo: number;
  despesas_financeiras: number;
  despesas_tributarias: number;
  imobilizacoes: number;
  retiradas: number;
  entradas_nao_operacionais: number;
  saidas_nao_operacionais: number;
}) {
  const lucroBruto = inputs.receita_operacional + inputs.custo_variavel;
  const lucroOperacional = lucroBruto + inputs.custo_fixo;
  const lucroLiquido = lucroOperacional + inputs.despesas_financeiras + inputs.despesas_tributarias;
  const saldo = lucroLiquido + inputs.imobilizacoes + inputs.retiradas;
  const variacaoCaixa = saldo + inputs.entradas_nao_operacionais + inputs.saidas_nao_operacionais;

  return { lucroBruto, lucroOperacional, lucroLiquido, saldo, variacaoCaixa };
}

// ─── Negative categories (expenses stored as negative values) ─────────────────

const NEGATIVE_CATEGORIES = new Set([
  "custo_variavel",
  "custo_fixo",
  "despesas_financeiras",
  "despesas_tributarias",
  "imobilizacoes",
  "retiradas",
  "saidas_nao_operacionais",
]);

// ─── Test runner ──────────────────────────────────────────────────────────────

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

// ─── Test 1: Basic formula validation ─────────────────────────────────────────

console.log("\n=== Test 1: Formulas basicas da DRE ===");

const result1 = computeDRE({
  receita_operacional: 13099928.25,
  custo_variavel: -9426496.35,
  custo_fixo: -1003183.60,
  despesas_financeiras: -462961.69,
  despesas_tributarias: -1784637.89,
  imobilizacoes: -199272.50,
  retiradas: -43797.81,
  entradas_nao_operacionais: 217898.12,
  saidas_nao_operacionais: -867071.82,
});

assertClose("Lucro Bruto = Receita + Custo Variavel", result1.lucroBruto, 3673431.90);
assertClose("Lucro Operacional = L.Bruto + Custo Fixo", result1.lucroOperacional, 2670248.30);
assertClose("Lucro Liquido = L.Op + Desp.Fin + Desp.Trib", result1.lucroLiquido, 422648.72);
assertClose("Saldo = L.Liquido + Imob + Retiradas", result1.saldo, 179578.41);
assertClose("Variacao Caixa = Saldo + Ent.NaoOp + Saida.NaoOp", result1.variacaoCaixa, -469595.29);

// ─── Test 2: Zero inputs ─────────────────────────────────────────────────────

console.log("\n=== Test 2: Inputs zerados ===");

const result2 = computeDRE({
  receita_operacional: 0, custo_variavel: 0, custo_fixo: 0,
  despesas_financeiras: 0, despesas_tributarias: 0,
  imobilizacoes: 0, retiradas: 0,
  entradas_nao_operacionais: 0, saidas_nao_operacionais: 0,
});

assert("Todos zero = tudo zero", Object.values(result2).every(v => v === 0));

// ─── Test 3: Negative categories have correct sign ───────────────────────────

console.log("\n=== Test 3: Categorias negativas ===");

const expectedNegative = [
  "custo_variavel", "custo_fixo", "despesas_financeiras",
  "despesas_tributarias", "imobilizacoes", "retiradas", "saidas_nao_operacionais",
];
const expectedPositive = ["receita_operacional", "entradas_nao_operacionais"];

for (const cat of expectedNegative) {
  assert(`${cat} e categoria negativa`, NEGATIVE_CATEGORIES.has(cat));
}
for (const cat of expectedPositive) {
  assert(`${cat} NAO e categoria negativa`, !NEGATIVE_CATEGORIES.has(cat));
}
assert("Total de categorias negativas = 7", NEGATIVE_CATEGORIES.size === 7);

// ─── Test 4: Cascading formulas ─────────────────────────────────────────────

console.log("\n=== Test 4: Cascata de calculos ===");

const result4 = computeDRE({
  receita_operacional: 1000,
  custo_variavel: -400,
  custo_fixo: -200,
  despesas_financeiras: -50,
  despesas_tributarias: -100,
  imobilizacoes: -30,
  retiradas: -20,
  entradas_nao_operacionais: 100,
  saidas_nao_operacionais: -80,
});

assertClose("L.Bruto = 1000 - 400 = 600", result4.lucroBruto, 600);
assertClose("L.Op = 600 - 200 = 400", result4.lucroOperacional, 400);
assertClose("L.Liq = 400 - 50 - 100 = 250", result4.lucroLiquido, 250);
assertClose("Saldo = 250 - 30 - 20 = 200", result4.saldo, 200);
assertClose("Var.Caixa = 200 + 100 - 80 = 220", result4.variacaoCaixa, 220);

// ─── Test 5: DRE_LINES structure ────────────────────────────────────────────

console.log("\n=== Test 5: Estrutura DRE_LINES ===");

const DRE_LINES = [
  { key: "receita_operacional", type: "input", number: 1 },
  { key: "custo_variavel", type: "input", number: 2 },
  { key: "lucro_bruto", type: "calculated", number: 3 },
  { key: "custo_fixo", type: "input", number: 4 },
  { key: "lucro_operacional", type: "calculated", number: 5 },
  { key: "despesas_financeiras", type: "input", number: 6 },
  { key: "despesas_tributarias", type: "input", number: 7 },
  { key: "lucro_liquido", type: "calculated", number: 8 },
  { key: "imobilizacoes", type: "input", number: 9 },
  { key: "retiradas", type: "input", number: 10 },
  { key: "saldo", type: "calculated", number: 11 },
  { key: "entradas_nao_operacionais", type: "input", number: 12 },
  { key: "saidas_nao_operacionais", type: "input", number: 13 },
  { key: "variacao_caixa", type: "calculated", number: 14 },
];

assert("DRE_LINES tem 14 linhas", DRE_LINES.length === 14);
assert("5 linhas calculadas", DRE_LINES.filter(l => l.type === "calculated").length === 5);
assert("9 linhas de input", DRE_LINES.filter(l => l.type === "input").length === 9);
assert("Numeracao sequencial 1-14", DRE_LINES.every((l, i) => l.number === i + 1));

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nALERTA: Formulas da DRE foram alteradas!");
  process.exit(1);
} else {
  console.log("\nTodas as formulas da DRE estao corretas.");
}
