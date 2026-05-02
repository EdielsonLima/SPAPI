// Mede o impacto do fix de pareamento Adiantamento+Estorno em CADA empresa
// validada — calcula total SEM e COM o fix para garantir que não quebra
// nenhum snapshot existente.
//
// Pareamento: para cada item.payments[], se um payment é Estorno (op type
// contém "estorno") e há outro payment no mesmo item com mesma paymentDate
// e netAmount oposto, ambos saem do total. Imita o comportamento do Sienge
// "Contas Pagas Sintético" Líquido.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EXCLUDED_OP = ["substitui", "cancelamento", "estorno", "abatimento"];
const EXCLUDE_HISTORIC_PATTERNS = [
  "rendimento", "aplicação", "aplicacao", "resgate",
  "transferência", "transferencia", "saque", "depósito", "deposito",
  "estorno",
  "recebimento",
];

function detectEstornados(payments) {
  const estornados = new Set();
  const estornos = payments.filter(p => (p.operationTypeName || "").toLowerCase().includes("estorno"));
  for (const e of estornos) {
    const orig = payments.find(p =>
      p !== e &&
      p.paymentDate === e.paymentDate &&
      Math.abs((p.netAmount || 0) + (e.netAmount || 0)) < 0.01 &&
      !estornados.has(p)
    );
    if (orig) estornados.add(orig);
  }
  return estornados;
}

function computePagas(items, bms, company, withPairing) {
  let total = 0;
  let pairedSkipped = 0;
  for (const item of items) {
    if (item.companyName !== company) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    const payments = item.payments || [];
    const estornados = withPairing ? detectEstornados(payments) : new Set();
    for (const p of payments) {
      if (estornados.has(p)) { pairedSkipped++; continue; }
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (EXCLUDED_OP.some(x => (p.operationTypeName || "").toLowerCase().includes(x))) continue;
      total += p.netAmount;
    }
  }
  for (const m of bms) {
    if (m.companyName !== company) continue;
    if (m.bankMovementAmount === 0) continue;
    if (!m.bankMovementDate) continue;
    const historic = (m.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    total += Math.abs(m.bankMovementAmount);
  }
  return { total, pairedSkipped };
}

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  const bm = await pool.query("SELECT data FROM cached_bank_movements ORDER BY cached_at DESC LIMIT 1");
  const bms = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  console.log(`Cache cached_at: ${r.rows[0].cached_at}\n`);

  // Read validations
  const validationsDir = path.join(__dirname, "..", "validations", "contas-pagas.json");
  const cfg = JSON.parse(fs.readFileSync(validationsDir, "utf8"));

  console.log("Empresa".padEnd(50), "SEM pair".padStart(20), "COM pair".padStart(20), "Diff".padStart(15), "Pairs", "PDF expected".padStart(20));
  console.log("-".repeat(150));
  let totalImpact = 0;
  for (const v of cfg.validations) {
    const without = computePagas(items, bms, v.company, false);
    const withPair = computePagas(items, bms, v.company, true);
    const diff = withPair.total - without.total;
    totalImpact += Math.abs(diff);
    console.log(
      v.company.padEnd(50).slice(0, 50),
      fmt(without.total).padStart(20),
      fmt(withPair.total).padStart(20),
      fmt(diff).padStart(15),
      String(withPair.pairedSkipped).padStart(5),
      fmt(v.expected).padStart(20)
    );
  }
  console.log(`\nImpacto total absoluto do fix: ${fmt(totalImpact)}`);

  await pool.end();
})();
