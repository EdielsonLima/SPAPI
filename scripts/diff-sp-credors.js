// Compara SP credor por credor — só lista os com diff >= R$ 50 entre cache
// (filtrado paymentDate<=09/05) e o que sabemos do PDF.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

const COMPANY = "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA";
const PDF_END = "2026-05-09";

const EXCLUDED_OP = ["substitui", "cancelamento", "abatimento", "devolu"];
const isExcludedOp = (n) => EXCLUDED_OP.some(x => (n || "").toLowerCase().includes(x));

// Credores notáveis com Líquido conhecido do PDF SP 09/05.
// Valor zero significa "informativo" — não vou validar todos, só os principais
// que podem ter Por Bens (Valor != Líquido).
const PDF_NOTABLE = [
  ["VOLKSWAGEN DO BRASIL INDUSTRIA DE VEICULOS AUTOMOTORES LTDA", 109638.30],
  ["MAGAZINE LUIZA S/A", 12102.19],
  ["FAST SHOP S.A", 6553.18],
  ["KOERICH SA COMERCIO E INDUSTRIA", 1847.00],
  ["PACOPEDRA PAVIMENTADORA E COMERCIO DE PEDRAS LTDA", 41575.25],
];

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = (r.rows[0].data?.data || []).filter(i => i.companyName === COMPANY);

  const byCreditor = new Map();
  for (const item of items) {
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (p.paymentDate > PDF_END) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      const key = norm(item.creditorName);
      if (!byCreditor.has(key)) byCreditor.set(key, { name: item.creditorName, total: 0, parts: [] });
      const r = byCreditor.get(key);
      r.total += p.netAmount;
      r.parts.push({ amt: p.netAmount, date: p.paymentDate, bill: item.billId, op: p.operationTypeName });
    }
  }

  for (const [pdfName, expected] of PDF_NOTABLE) {
    const key = norm(pdfName);
    const c = byCreditor.get(key);
    if (!c) {
      console.log(`✗ ${pdfName}: não encontrado no cache (PDF Líquido=${fmt(expected)})`);
      continue;
    }
    const diff = c.total - expected;
    const flag = Math.abs(diff) <= 0.5 ? "✓" : "✗";
    console.log(`${flag} ${pdfName}`);
    console.log(`  cache=${fmt(c.total)}  pdf=${fmt(expected)}  diff=${fmt(diff)}`);
    if (Math.abs(diff) > 0.5) {
      for (const p of c.parts) console.log(`    ${p.date} bill=${p.bill} op=${p.op} ${fmt(p.amt)}`);
    }
  }

  // Também mostra credores com somatório suspeito (pagamentos com "Por Bens", etc)
  console.log("\n=== Credores com paymentDate <= PDF_END mas op não-Pagamento (excluídos por EXCLUDED_OP) já filtrados ===");
  // Conferir Por Bens
  let porBensTotal = 0;
  const porBensSamples = [];
  for (const item of items) {
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0 || !p.paymentDate || p.paymentDate > PDF_END) continue;
      const op = (p.operationTypeName || "").toLowerCase();
      if (op.includes("por bens") || op.includes("permuta")) {
        porBensTotal += p.netAmount;
        if (porBensSamples.length < 10) porBensSamples.push({
          date: p.paymentDate, creditor: item.creditorName, amt: p.netAmount, op: p.operationTypeName,
        });
      }
    }
  }
  console.log(`\n=== Por Bens / Permuta ainda no cache: ${fmt(porBensTotal)} ===`);
  for (const s of porBensSamples) console.log(`  ${s.date} ${fmt(s.amt).padStart(15)} ${s.creditor} (${s.op})`);

  await pool.end();
})();
