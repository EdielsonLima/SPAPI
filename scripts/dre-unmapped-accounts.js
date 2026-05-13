// Lista contas do plano financeiro com movimento em 2026 que NAO estao
// mapeadas em dre_mappings — ordenadas por valor absoluto (maior primeiro).
// Use a saida pra priorizar quais contas mapear em /cadastros/dre.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const YEAR = "2026";

function isPrevisao(name) {
  if (!name) return false;
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return n.startsWith("PREVISAO");
}

(async () => {
  console.log(`=== DRE API: contas nao mapeadas com movimento em ${YEAR} ===\n`);

  // 1. Mapeamentos atuais
  const mappingsRes = await pool.query(
    `SELECT financial_plan_id, dre_category, financial_plan_name FROM dre_mappings`
  );
  const mapped = new Map();
  mappingsRes.rows.forEach(r => {
    mapped.set(String(r.financial_plan_id).trim(), { dre: r.dre_category, name: r.financial_plan_name });
  });
  console.log(`Mapeamentos atuais: ${mapped.size}\n`);

  // 2. Cache outcome + income
  const startDate = `${YEAR}-01-01`;
  const endDate = `${YEAR}-12-31`;
  const outR = await pool.query(
    "SELECT data FROM cached_outcome WHERE start_date=$1 AND end_date=$2 ORDER BY cached_at DESC LIMIT 1",
    [startDate, endDate]
  );
  const incR = await pool.query(
    "SELECT data FROM cached_income WHERE start_date=$1 AND end_date=$2 ORDER BY cached_at DESC LIMIT 1",
    [startDate, endDate]
  );
  const bmR = await pool.query(
    "SELECT data FROM cached_bank_movements WHERE start_date=$1 AND end_date=$2 AND start_date NOT LIKE 'all:%' ORDER BY cached_at DESC LIMIT 1",
    [startDate, endDate]
  );

  if (outR.rows.length === 0 || incR.rows.length === 0) {
    console.log("Cache de 2026 nao encontrado. Abra o painel pra preencher cache primeiro.");
    process.exit(1);
  }

  const outcome = outR.rows[0].data?.data || outR.rows[0].data || [];
  const income = incR.rows[0].data?.data || incR.rows[0].data || [];
  const bms = bmR.rows[0]?.data?.data || bmR.rows[0]?.data || [];

  console.log(`Outcome items: ${outcome.length}, Income items: ${income.length}, BMs avulsos: ${bms.length}\n`);

  // 3. Agregar por financialCategoryId, separando movimento mapeado vs nao
  const accAll = new Map(); // fcId → { name, total, sources }

  const addRow = (fcId, name, amount, rate, src) => {
    if (!fcId) return;
    const id = String(fcId).trim();
    if (!accAll.has(id)) {
      accAll.set(id, { name: name || `Conta ${id}`, total: 0, sources: { out: 0, inc: 0, bm: 0 } });
    }
    const entry = accAll.get(id);
    const value = amount * (typeof rate === "number" && rate > 0 ? rate / 100 : 1);
    entry.total += Math.abs(value);
    entry.sources[src] += Math.abs(value);
    if (!entry.name && name) entry.name = name;
  };

  // Outcome
  for (const item of outcome) {
    if (isPrevisao(item.documentIdentificationName) || item.forecastDocument === "S") continue;
    const cats = item.paymentsCategories || [];
    if (cats.length === 0) continue;
    for (const p of item.payments || []) {
      if (!p.netAmount || !p.paymentDate) continue;
      if (!p.paymentDate.startsWith(YEAR)) continue;
      for (const c of cats) {
        addRow(c.financialCategoryId, c.financialCategoryName, p.netAmount, c.financialCategoryRate, "out");
      }
    }
  }

  // Income
  for (const item of income) {
    if (isPrevisao(item.documentIdentificationName)) continue;
    const cats = item.receiptsCategories || item.paymentsCategories || [];
    if (cats.length === 0) continue;
    for (const p of item.payments || []) {
      if (!p.netAmount || p.netAmount <= 0 || !p.paymentDate) continue;
      if (!p.paymentDate.startsWith(YEAR)) continue;
      for (const c of cats) {
        addRow(c.financialCategoryId, c.financialCategoryName, p.netAmount, c.financialCategoryRate, "inc");
      }
    }
  }

  // BMs avulsos com financialCategories
  for (const bm of bms) {
    if (!bm.bankMovementAmount) continue;
    if (!bm.bankMovementDate?.startsWith(YEAR)) continue;
    const cats = bm.financialCategories || [];
    if (cats.length === 0) continue;
    const amount = Math.abs(bm.bankMovementAmount);
    for (const c of cats) {
      addRow(c.financialCategoryId, c.financialCategoryName, amount, c.financialCategoryRate, "bm");
    }
  }

  // 4. Filtrar nao-mapeadas
  const unmapped = [];
  const mappedList = [];
  for (const [id, data] of accAll.entries()) {
    if (mapped.has(id)) {
      mappedList.push({ id, ...data, dre: mapped.get(id).dre });
    } else {
      unmapped.push({ id, ...data });
    }
  }

  unmapped.sort((a, b) => b.total - a.total);
  mappedList.sort((a, b) => b.total - a.total);

  const totUnmapped = unmapped.reduce((s, r) => s + r.total, 0);
  const totMapped = mappedList.reduce((s, r) => s + r.total, 0);
  const totGeral = totUnmapped + totMapped;

  console.log(`Total movimento 2026 (valor absoluto): ${fmt(totGeral)}`);
  console.log(`  ✓ Mapeado:    ${fmt(totMapped)} (${((totMapped/totGeral)*100).toFixed(1)}%) em ${mappedList.length} contas`);
  console.log(`  ✗ NAO mapeado: ${fmt(totUnmapped)} (${((totUnmapped/totGeral)*100).toFixed(1)}%) em ${unmapped.length} contas\n`);

  if (unmapped.length === 0) {
    console.log("Tudo mapeado!");
    process.exit(0);
  }

  console.log("--- TOP 40 CONTAS NAO MAPEADAS (priorize estas em /cadastros/dre) ---");
  console.log("%-15s %-50s %-18s %s".replace(/%-?\d+s/g, m => m).padEnd(0), "");
  const fmtRow = (id, name, value, src) =>
    `${id.padEnd(12)} ${name.slice(0, 48).padEnd(50)} ${fmt(value).padStart(18)}  ${src}`;
  console.log(fmtRow("ID", "NOME", 0, "FONTE").replace(/R\$ 0,00/, "VALOR".padStart(18)));
  console.log("-".repeat(110));

  for (const row of unmapped.slice(0, 40)) {
    const src = [];
    if (row.sources.out > 0) src.push(`out ${fmt(row.sources.out)}`);
    if (row.sources.inc > 0) src.push(`inc ${fmt(row.sources.inc)}`);
    if (row.sources.bm > 0) src.push(`bm ${fmt(row.sources.bm)}`);
    console.log(fmtRow(row.id, row.name, row.total, src.join(" | ")));
  }

  if (unmapped.length > 40) {
    const restante = unmapped.slice(40).reduce((s, r) => s + r.total, 0);
    console.log("-".repeat(110));
    console.log(`... + ${unmapped.length - 40} contas com soma ${fmt(restante)}`);
  }

  await pool.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
