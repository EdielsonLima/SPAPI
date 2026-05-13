// Diagnóstico: BMs no cached_bank_movements estão sendo somados em cima dos
// receipts (cada BM vinculado a uma bill já está contado via payments).
// Verifica quantos BMs têm billId e qual o impacto no total.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

(async () => {
  const bm = await pool.query("SELECT data, cached_at FROM cached_bank_movements ORDER BY cached_at DESC LIMIT 1");
  const bankMovements = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  const sample = bankMovements[0];
  console.log("Sample BM keys:", Object.keys(sample));
  console.log();

  const totals = { all: 0, withBillId: 0, withoutBillId: 0 };
  const counts = { all: 0, withBillId: 0, withoutBillId: 0 };
  const byCompany = {};

  for (const m of bankMovements) {
    if (!m.bankMovementDate) continue;
    if (m.bankMovementAmount === 0) continue;
    const amt = Math.abs(m.bankMovementAmount);
    const company = m.companyName || "?";
    if (!byCompany[company]) byCompany[company] = { withBillId: 0, withoutBillId: 0, withBillIdN: 0, withoutBillIdN: 0 };
    if (m.billId) {
      totals.withBillId += amt;
      counts.withBillId++;
      byCompany[company].withBillId += amt;
      byCompany[company].withBillIdN++;
    } else {
      totals.withoutBillId += amt;
      counts.withoutBillId++;
      byCompany[company].withoutBillId += amt;
      byCompany[company].withoutBillIdN++;
    }
    totals.all += amt;
    counts.all++;
  }

  console.log(`Total BMs:                 ${counts.all.toLocaleString("pt-BR")} = ${fmt(totals.all)}`);
  console.log(`  com billId (vinculados): ${counts.withBillId.toLocaleString("pt-BR")} = ${fmt(totals.withBillId)}`);
  console.log(`  sem billId (avulsos):    ${counts.withoutBillId.toLocaleString("pt-BR")} = ${fmt(totals.withoutBillId)}`);
  console.log();
  console.log("Por empresa:");
  console.log("Empresa".padEnd(50) + "Vinculados".padStart(22) + "Avulsos".padStart(22));
  console.log("-".repeat(94));
  const sorted = Object.entries(byCompany).sort((a, b) => (b[1].withBillId + b[1].withoutBillId) - (a[1].withBillId + a[1].withoutBillId));
  for (const [c, v] of sorted) {
    console.log(`${c.padEnd(50)}${(fmt(v.withBillId) + ` (${v.withBillIdN})`).padStart(22)}${(fmt(v.withoutBillId) + ` (${v.withoutBillIdN})`).padStart(22)}`);
  }

  await pool.end();
})();
