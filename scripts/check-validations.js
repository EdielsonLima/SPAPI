// Compara valores calculados pelo cache local contra o snapshot de validações
// validations/contas-pagar.json. Reporta pass/fail por entrada.
//
// Uso: node scripts/check-validations.js
//
// Cada entrada do snapshot foi conferida manualmente contra o relatório
// Sienge correspondente. Se qualquer total divergir após uma mudança de
// código, este script falha e indica qual empresa/período quebrou.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Tipos de operação que dobram contagem ou são reversões — mesma lista
// aplicada como default em executive-dashboard.tsx e contas-table.tsx.
const EXCLUDED_OP = ["substitui", "cancelamento", "estorno"];
function isExcludedOp(name) {
  const lower = (name || "").toLowerCase();
  return EXCLUDED_OP.some(x => lower.includes(x));
}

// Total a Pagar para uma empresa em um mês específico.
// Mesma fórmula usada na UI: effectiveAmount = corrected - discount - tax.
function computeAPagar(items, company, year, month) {
  const prefix = `${year}-${month}`;
  let total = 0;
  let count = 0;
  for (const i of items) {
    if (i.companyName !== company) continue;
    if (!i.dueDate || !i.dueDate.startsWith(prefix)) continue;
    if ((i.balanceAmount || 0) <= 0) continue;
    total += (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
    count++;
  }
  return { total, count };
}

// Total Pago para uma empresa em um mês específico.
// Soma netAmount dos payments dentro do mês, excluindo op types reversíveis.
function computePagas(items, bankMovements, company, year, month) {
  const prefix = `${year}-${month}`;
  let total = 0;
  let count = 0;

  for (const item of items) {
    if (item.companyName !== company) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0) continue;
      if (!p.paymentDate || !p.paymentDate.startsWith(prefix)) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      total += p.netAmount;
      count++;
    }
  }

  // Bank movements avulsos (tarifas bancárias) — exclui rendimentos/aplicações/resgates
  const incomePatterns = ["rendimento", "aplicação", "aplicacao", "resgate"];
  for (const bm of bankMovements) {
    if (bm.companyName !== company) continue;
    if (bm.bankMovementAmount === 0) continue;
    if (!bm.bankMovementDate || !bm.bankMovementDate.startsWith(prefix)) continue;
    const historic = (bm.bankMovementHistoricName || "").toLowerCase();
    if (incomePatterns.some(p => historic.includes(p))) continue;
    const catNames = (bm.financialCategories || []).map(fc => (fc.financialCategoryName || "").toLowerCase()).join(" ");
    if (incomePatterns.some(p => catNames.includes(p))) continue;
    total += Math.abs(bm.bankMovementAmount);
    count++;
  }

  return { total, count };
}

(async () => {
  const file = path.join(__dirname, "..", "validations", "contas-pagar.json");
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  const validations = cfg.validations || [];

  if (validations.length === 0) {
    console.log("Nenhuma validação registrada em validations/contas-pagar.json");
    process.exit(0);
  }

  const r = await pool.query("SELECT data, cached_at FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  if (!r.rows.length) {
    console.error("Sem cache de outcome no banco. Faça uma fetch primeiro.");
    process.exit(1);
  }
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  const cachedAt = r.rows[0].cached_at;

  const bm = await pool.query("SELECT data FROM cached_bank_movements ORDER BY cached_at DESC LIMIT 1");
  const bankMovements = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  console.log(`Cache outcome: ${items.length} itens (cached_at ${cachedAt})`);
  console.log(`Cache bank movements: ${bankMovements.length} itens`);
  console.log(`Validações: ${validations.length}\n`);

  const cachedAtDate = new Date(cachedAt);

  let passed = 0, failed = 0, staleSkipped = 0;
  for (const v of validations) {
    const tolerance = v.tolerance ?? 0.5;
    let result;
    if (v.mode === "a-pagar") {
      result = computeAPagar(items, v.company, v.year, v.month);
    } else if (v.mode === "pagas") {
      result = computePagas(items, bankMovements, v.company, v.year, v.month);
    } else {
      console.log(`✗ ${v.company} ${v.year}-${v.month} ${v.mode}: modo desconhecido`);
      failed++;
      continue;
    }
    const diff = result.total - v.expected;
    const ok = Math.abs(diff) <= tolerance;
    const flag = ok ? "✓" : "✗";
    const label = `${v.company} ${v.year}-${v.month} ${v.mode}`;

    // Cache mais antigo que a validação? Pode ser causa do mismatch — sinaliza.
    const validatedDate = new Date(v.validated_at);
    const staleCache = !ok && cachedAtDate < validatedDate;

    if (ok) {
      console.log(`${flag} ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, ${result.count} parcelas)`);
      passed++;
    } else if (staleCache) {
      console.log(`⚠ ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, diff ${fmt(diff)}) — cache mais antigo que a validação, refresh dos dados via app antes de avaliar`);
      staleSkipped++;
    } else {
      console.log(`${flag} ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, diff ${fmt(diff)}, ${result.count} parcelas)`);
      console.log(`   tolerance: ${fmt(tolerance)} · validado em ${v.validated_at}`);
      console.log(`   fonte: ${v.source}`);
      failed++;
    }
  }

  console.log(`\nResumo: ${passed} ✓ · ${failed} ✗${staleSkipped > 0 ? ` · ${staleSkipped} ⚠ (cache desatualizado)` : ""}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
})();
