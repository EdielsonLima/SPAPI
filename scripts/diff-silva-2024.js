// Análise per-credor SILVA PACKER 2024 — comparando cache vs PDF Sienge
// "Contas Pagas (por Credor) Sintético" 01/01/2024 a 31/12/2024.
//
// Objetivo: identificar exatamente quais credores causam o diff de R$ 42.325,92
// para trazer o total dentro de tolerance R$ 5k.
//
// Uso: node scripts/diff-silva-2024.js

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COMPANY = "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA";
const YEAR = "2024";
// Inclui "por bens" pois SILVA PACKER usa "por Credor" report que exclui Por Bens.
// Simula o filtro per-empresa salvo via standalone Contas Pagas.
const EXCLUDED_OP = ["substitui", "cancelamento", "estorno", "abatimento", "por bens"];
const PDF_TOTAL_2024 = 8473580.88;
const EXCLUDE_HISTORIC_PATTERNS = [
  "rendimento", "aplicação", "aplicacao", "resgate",
  "transferência", "transferencia", "saque", "depósito", "deposito",
  "estorno",
  "recebimento",
];

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  const bm = await pool.query("SELECT data FROM cached_bank_movements ORDER BY cached_at DESC LIMIT 1");
  const bms = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  // Build per-credor aggregation for SILVA PACKER, year 2024 only
  const perCredor = new Map();
  let total = 0;
  let countPayments = 0;

  for (const item of items) {
    if (item.companyName !== COMPANY) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;

    // Detect Adiantamento+Estorno pairs in the same item: same date, opposite
    // values. Sienge cancels these from the Líquido total — we must too,
    // otherwise the Adiantamento side gets counted while the Estorno is
    // filtered out by EXCLUDED_OP (net result: +1× the value).
    const estornados = new Set();
    const payments = item.payments || [];
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

    for (const p of payments) {
      if (estornados.has(p)) continue;
      if (p.netAmount === 0) continue;
      if (!p.paymentDate || !p.paymentDate.startsWith(YEAR)) continue;
      if (EXCLUDED_OP.some(x => (p.operationTypeName || "").toLowerCase().includes(x))) continue;

      const credor = (item.creditorName || "(sem credor)").trim();
      if (!perCredor.has(credor)) {
        perCredor.set(credor, { total: 0, count: 0, payments: [] });
      }
      const e = perCredor.get(credor);
      e.total += p.netAmount;
      e.count++;
      e.payments.push({
        date: p.paymentDate,
        net: p.netAmount,
        op: p.operationTypeName,
        doc: item.documentIdentificationName,
      });
      total += p.netAmount;
      countPayments++;
    }
  }

  // Add bank movements (synthesized as outcome)
  let bmTotal = 0;
  for (const m of bms) {
    if (m.companyName !== COMPANY) continue;
    if (m.bankMovementAmount === 0) continue;
    if (!m.bankMovementDate || !m.bankMovementDate.startsWith(YEAR)) continue;
    const historic = (m.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    const credor = `[BM] ${(m.bankMovementHistoricName || "Tarifa").trim()}`;
    if (!perCredor.has(credor)) perCredor.set(credor, { total: 0, count: 0, payments: [] });
    const v = Math.abs(m.bankMovementAmount);
    perCredor.get(credor).total += v;
    perCredor.get(credor).count++;
    bmTotal += v;
    total += v;
  }

  console.log(`SILVA PACKER ${YEAR}`);
  console.log(`Cache total (sim. filtro per-empresa s/ Por Bens): ${fmt(total)}`);
  console.log(`PDF Sienge 2024:                                  ${fmt(PDF_TOTAL_2024)}`);
  console.log(`Diff (cache - PDF):                               ${fmt(total - PDF_TOTAL_2024)}`);
  console.log(`(${countPayments} payments outcome + BMs ${fmt(bmTotal)})\n`);

  // Sort credors by total desc
  const sorted = Array.from(perCredor.entries())
    .map(([credor, e]) => ({ credor, ...e }))
    .sort((a, b) => b.total - a.total);

  console.log("Top 60 credores:");
  console.log("Credor".padEnd(75), "Total".padStart(18), "#".padStart(4));
  console.log("-".repeat(100));
  sorted.slice(0, 60).forEach(c => {
    console.log(c.credor.padEnd(75).slice(0, 75), fmt(c.total).padStart(18), String(c.count).padStart(4));
  });

  // Specifically print the credors the user flagged (with reductions)
  console.log("\n=== Credores flagrados no PDF com Líquido < Valor Baixa ===");
  const FLAGGED = [
    { name: "VOLKSWAGEN", expectedLiquid: 28381.00 },
    { name: "PACOPEDRA", expectedLiquid: 36055.25 },
    { name: "MERCADOPAGO", expectedLiquid: 5656.29 },
    { name: "MAGAZINE LUIZA", expectedLiquid: 4904.09 },
    { name: "KOERICH", expectedLiquid: 1847.00 },
    { name: "FAST SHOP", expectedLiquid: 6553.18 },
  ];
  for (const f of FLAGGED) {
    const matches = sorted.filter(c => c.credor.toUpperCase().includes(f.name.toUpperCase()));
    console.log(`\n${f.name} (PDF Líquido esperado: ${fmt(f.expectedLiquid)}):`);
    if (matches.length === 0) {
      console.log("  (sem matches no cache 2024)");
      continue;
    }
    for (const m of matches) {
      console.log(`  Cache: ${fmt(m.total)} (${m.count} payments)`);
      m.payments.forEach(p => {
        console.log(`    ${p.date} ${fmt(p.net).padStart(12)} ${(p.op || "").padEnd(30)} ${(p.doc || "").substring(0, 40)}`);
      });
      console.log(`  Diff (cache - PDF): ${fmt(m.total - f.expectedLiquid)}`);
    }
  }

  await pool.end();
})();
