// Confere cache atual de Contas Pagas contra PDF "Contas Pagas (por Credor) Sintético"
// gerado em 08/05/2026 às 18:36:08, período 01/01/2001 a 08/05/2026.
// Reporta empresa por empresa: cache - PDF = diff.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Totais Líquido extraídos do PDF de 08/05/2026 (col "Líquido", linha "Total" da empresa).
const PDF_08_05 = [
  { company: "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA", expected: 112729270.93 },
  { company: "SILVA ADMINISTRADORA HOLDING LTDA",             expected:  15184547.30 },
  { company: "SUL BRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA",  expected:  84036994.84 },
  { company: "EDIFICIO 135 JARDINS",                          expected:  84839464.79 },
  { company: "SOLAR DI CAPRI",                                expected:  31443274.83 },
  { company: "PALACIO ELIZABETH",                             expected:  33744388.48 },
  { company: "RESIDENCIAL HANNOVER",                          expected:  26924856.29 },
  { company: "SOLAR DI SIENA",                                expected:  21599874.89 },
  { company: "TESLA RESIDENCIAL",                             expected:  48707727.73 },
  { company: "SERENITY",                                      expected:  15204091.90 },
  { company: "ROZZA",                                         expected:  12281742.47 },
  { company: "DOMUS",                                         expected:   7599762.96 },
  { company: "TETRA",                                         expected:   6517902.90 },
  { company: "GALPÃO - RUA CANELINHA PROJ: 120/15",           expected:   1127065.47 },
];

const EXCLUDED_OP = ["substitui", "cancelamento", "abatimento", "devolu"];
function isExcludedOp(name) {
  const lower = (name || "").toLowerCase();
  return EXCLUDED_OP.some(x => lower.includes(x));
}
function getEstornoPairs() { return new Set(); }

const EXCLUDE_HISTORIC_PATTERNS = [
  "rendimento", "aplicação", "aplicacao", "resgate",
  "transferência", "transferencia", "saque", "depósito", "deposito",
  "estorno",
  "recebimento",
];

// Mesma fórmula de check-validations.js
function computePagas(items, bankMovements, company) {
  let total = 0;
  let count = 0;
  let totalReceipts = 0;
  let totalBM = 0;

  for (const item of items) {
    if (item.companyName !== company) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    const payments = item.payments || [];
    const canceled = getEstornoPairs(payments);
    for (const p of payments) {
      if (canceled.has(p)) continue;
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      total += p.netAmount;
      totalReceipts += p.netAmount;
      count++;
    }
  }

  for (const bm of bankMovements) {
    if (bm.companyName !== company) continue;
    if (bm.bankMovementAmount === 0) continue;
    if (!bm.bankMovementDate) continue;
    // Só contar BMs avulsos. Os vinculados (com billId) já estão em
    // item.payments via receipts.bankMovements — somá-los de novo dobra.
    const historic = (bm.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    total += Math.abs(bm.bankMovementAmount);
    totalBM += Math.abs(bm.bankMovementAmount);
    count++;
  }

  return { total, count, totalReceipts, totalBM };
}

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  const cachedAt = r.rows[0].cached_at;

  // Pega só o cache de BMs avulsos (sem prefixo `all:`).
  const bm = await pool.query(
    "SELECT data, cached_at FROM cached_bank_movements WHERE start_date NOT LIKE 'all:%' ORDER BY cached_at DESC LIMIT 1"
  );
  const bankMovements = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];
  const bmCachedAt = bm.rows[0]?.cached_at;

  console.log(`Cache outcome:        ${items.length.toLocaleString("pt-BR")} itens (cached_at ${cachedAt})`);
  console.log(`Cache bank movements: ${bankMovements.length.toLocaleString("pt-BR")} itens (cached_at ${bmCachedAt})`);
  console.log(`PDF de referência: 08/05/2026 18:36 — período 01/01/2001 a 08/05/2026\n`);

  console.log("Empresa".padEnd(50) + "Cache".padStart(20) + "PDF".padStart(20) + "Diff".padStart(18) + "  Receipts/BM");
  console.log("-".repeat(125));

  let pdfTotal = 0;
  let cacheTotal = 0;
  for (const v of PDF_08_05) {
    const r = computePagas(items, bankMovements, v.company);
    const diff = r.total - v.expected;
    const pct = v.expected > 0 ? (diff / v.expected) * 100 : 0;
    pdfTotal += v.expected;
    cacheTotal += r.total;
    const flag = Math.abs(diff) <= 1 ? "✓" : Math.abs(pct) < 1 ? "≈" : "✗";
    const ratio = r.total / v.expected;
    console.log(
      `${flag} ${v.company.padEnd(48)}${fmt(r.total).padStart(20)}${fmt(v.expected).padStart(20)}${fmt(diff).padStart(18)}  R/BM ${fmt(r.totalReceipts)}/${fmt(r.totalBM)} (×${ratio.toFixed(3)})`
    );
  }
  console.log("-".repeat(125));
  console.log(`${"TOTAL".padEnd(50)}${fmt(cacheTotal).padStart(20)}${fmt(pdfTotal).padStart(20)}${fmt(cacheTotal - pdfTotal).padStart(18)}`);
  console.log(`Razão cache/PDF: ${(cacheTotal / pdfTotal).toFixed(4)}`);
  await pool.end();
})();
