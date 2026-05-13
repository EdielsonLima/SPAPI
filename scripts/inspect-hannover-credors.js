// Inspeciona payments dos 4 credores com diff em HANNOVER:
// EVELIN APARECIDA, A10 ACABAMENTOS, N. OPCAO, ZEUS DO BRASIL.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COMPANY = "RESIDENCIAL HANNOVER";

const targets = [
  { match: "EVELIN APARECIDA", expectedPdf: 6600.00 },
  { match: "A10 ACABAMENTOS",  expectedPdf: 290665.87 },
  { match: "N. OPCAO",         expectedPdf: 2057.29 },
  { match: "ZEUS DO BRASIL",   expectedPdf: 88453.06 },
];

const EXCLUDED_OP = ["substitui", "cancelamento", "estorno", "abatimento"];
const isExcludedOp = (n) => EXCLUDED_OP.some(x => (n || "").toLowerCase().includes(x));

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = (r.rows[0].data?.data || []).filter(i => i.companyName === COMPANY);

  for (const t of targets) {
    console.log(`\n=== ${t.match} (PDF Líquido: ${fmt(t.expectedPdf)}) ===`);
    const matches = items.filter(i => (i.creditorName || "").toUpperCase().includes(t.match));
    let totalCache = 0;
    for (const item of matches) {
      const payments = (item.payments || []).filter(p => p.netAmount !== 0 && p.paymentDate);
      console.log(`bill=${item.billId} ${item.creditorName} doc=${item.documentIdentificationName}`);
      for (const p of payments) {
        const excluded = isExcludedOp(p.operationTypeName);
        const flag = excluded ? "✗" : "✓";
        console.log(`  ${flag} ${p.paymentDate} op="${p.operationTypeName}" net=${fmt(p.netAmount)} gross=${fmt(p.grossAmount || 0)}`);
        if (!excluded) totalCache += p.netAmount;
      }
    }
    console.log(`  → Cache total (excl. estorno/cancelamento/abatimento/substituição): ${fmt(totalCache)}`);
    console.log(`  → Diff vs PDF: ${fmt(totalCache - t.expectedPdf)}`);
  }

  await pool.end();
})();
