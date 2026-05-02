// Compara totais per-historic/credor para SILVA ADMINISTRADORA HOLDING LTDA
// vs Sienge "Contas Pagas (por Data) Sintético" (R$ 14.950.266,42).
//
// HOLDING é empresa admin com alto volume de movimentos bancários — historic
// patterns como Transferência/Saque/Depósito normalmente dominam o cache.
//
// Uso: node scripts/diff-holding.js

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PDF_TOTAL = 14950266.42;
const COMPANY = "SILVA ADMINISTRADORA HOLDING LTDA";

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];

  const bm = await pool.query("SELECT data FROM cached_bank_movements ORDER BY cached_at DESC LIMIT 1");
  const bms = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  console.log(`Cache: ${items.length} outcome items, ${bms.length} bank movements`);
  console.log(`Empresa: ${COMPANY}\n`);

  // Outcome breakdown by op type
  const EXCLUDED_OP = ["substitui", "cancelamento", "estorno"];
  const byOp = new Map();
  let outcomeTotal = 0;
  for (const item of items) {
    if (item.companyName !== COMPANY) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0) continue;
      if (EXCLUDED_OP.some(x => (p.operationTypeName || "").toLowerCase().includes(x))) continue;
      const op = p.operationTypeName || "(sem op)";
      byOp.set(op, (byOp.get(op) || 0) + p.netAmount);
      outcomeTotal += p.netAmount;
    }
  }
  console.log("=== Outcome breakdown by op type ===");
  Array.from(byOp.entries()).sort((a, b) => b[1] - a[1]).forEach(([op, v]) => {
    console.log(`  ${op.padEnd(40)} ${fmt(v).padStart(20)}`);
  });
  console.log(`  TOTAL outcome: ${fmt(outcomeTotal)}\n`);

  // Bank movements breakdown by historic
  const byHistoric = new Map();
  let bmTotal = 0;
  for (const m of bms) {
    if (m.companyName !== COMPANY) continue;
    if (m.bankMovementAmount === 0) continue;
    const historic = (m.bankMovementHistoricName || "(sem historic)").trim();
    byHistoric.set(historic, (byHistoric.get(historic) || 0) + Math.abs(m.bankMovementAmount));
    bmTotal += Math.abs(m.bankMovementAmount);
  }
  console.log("=== Bank movements breakdown by historic (top 30) ===");
  Array.from(byHistoric.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([h, v]) => {
    console.log(`  ${h.padEnd(60).slice(0, 60)} ${fmt(v).padStart(20)}`);
  });
  console.log(`  TOTAL all BMs (no exclusion): ${fmt(bmTotal)}\n`);

  // Apply current Painel fix exclusions (only historic, no category check)
  const EXCLUDE_HISTORIC_PATTERNS = [
    "rendimento", "aplicação", "aplicacao", "resgate",
    "transferência", "transferencia", "saque", "depósito", "deposito",
    "estorno",
  ];
  const byHistoricFiltered = new Map();
  let bmTotalFiltered = 0;
  for (const m of bms) {
    if (m.companyName !== COMPANY) continue;
    if (m.bankMovementAmount === 0) continue;
    const historic = (m.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    const h = (m.bankMovementHistoricName || "(sem)").trim();
    byHistoricFiltered.set(h, (byHistoricFiltered.get(h) || 0) + Math.abs(m.bankMovementAmount));
    bmTotalFiltered += Math.abs(m.bankMovementAmount);
  }
  console.log("=== Bank movements DEPOIS de exclusão (top 30) ===");
  Array.from(byHistoricFiltered.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([h, v]) => {
    console.log(`  ${h.padEnd(60).slice(0, 60)} ${fmt(v).padStart(20)}`);
  });
  console.log(`  TOTAL BMs após exclusão: ${fmt(bmTotalFiltered)}\n`);

  console.log("=== Resumo ===");
  console.log(`PDF Sienge:                 ${fmt(PDF_TOTAL)}`);
  console.log(`Outcome puro:               ${fmt(outcomeTotal)}`);
  console.log(`+ BMs todos:                ${fmt(outcomeTotal + bmTotal)}`);
  console.log(`+ BMs após exclusão:        ${fmt(outcomeTotal + bmTotalFiltered)}`);
  console.log(`Diff (outcome+BM filtrado - PDF): ${fmt((outcomeTotal + bmTotalFiltered) - PDF_TOTAL)}`);

  // Inspect Retenção impostos and Estorno Tarifa Bancária categories
  console.log("\n=== Retenção impostos — sample categorias ===");
  const retencao = bms.filter(m => m.companyName === COMPANY && (m.bankMovementHistoricName || "").toLowerCase().includes("retenção"));
  retencao.slice(0, 5).forEach(m => {
    console.log(`  ${fmt(m.bankMovementAmount).padStart(15)} | hist=${m.bankMovementHistoricName} | cats=${(m.financialCategories || []).map(fc => fc.financialCategoryName).join(" | ")}`);
  });
  console.log(`  Total Retenção: ${fmt(retencao.reduce((s, m) => s + Math.abs(m.bankMovementAmount), 0))} (${retencao.length} entradas)`);

  console.log("\n=== Estorno Tarifa Bancária — sample categorias ===");
  const estorno = bms.filter(m => m.companyName === COMPANY && (m.bankMovementHistoricName || "").toLowerCase().includes("estorno"));
  estorno.slice(0, 5).forEach(m => {
    console.log(`  ${fmt(m.bankMovementAmount).padStart(15)} | hist=${m.bankMovementHistoricName} | cats=${(m.financialCategories || []).map(fc => fc.financialCategoryName).join(" | ")}`);
  });
  console.log(`  Total Estorno: ${fmt(estorno.reduce((s, m) => s + Math.abs(m.bankMovementAmount), 0))} (${estorno.length} entradas)`);

  await pool.end();
})();
