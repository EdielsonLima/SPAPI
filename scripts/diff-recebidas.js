// Mostra Total Recebido (Líquido) por empresa, mesma fórmula do Painel:
// soma p.netAmount onde receipt tem bankMovements[] (= Sienge "Contas
// Recebidas por Data de Vencimento" coluna Líquido).
//
// Para cruzar com o PDF Sienge agrupado por empresa.
// Uso: node scripts/diff-recebidas.js

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_income ORDER BY cached_at DESC LIMIT 1");
  if (!r.rows.length) {
    console.log("Cache vazio. Faça refresh no painel primeiro.");
    process.exit(0);
  }
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache cached_at: ${r.rows[0].cached_at}`);
  console.log(`Itens: ${items.length}\n`);

  const perCompany = new Map();
  let total = 0;
  let countPayments = 0;
  let countSkipped = 0;
  for (const item of items) {
    const company = item.companyName || "(sem)";
    if (!perCompany.has(company)) {
      perCompany.set(company, { total: 0, count: 0, skipped: 0, skippedValue: 0 });
    }
    const e = perCompany.get(company);
    for (const p of (item.payments || [])) {
      // payments sintetizados em api/sienge/income já têm netAmount=0 quando
      // o receipt não tem bankMovements (= Por Bens). Aqui apenas somamos.
      if (p.netAmount > 0) {
        e.total += p.netAmount;
        e.count++;
        total += p.netAmount;
        countPayments++;
      } else if (p.grossAmount > 0) {
        // Recebimento com Líquido=0 mas Valor>0 — provável Por Bens.
        // Conta para diagnóstico para sabermos quanto está sendo excluído.
        e.skipped++;
        e.skippedValue += p.grossAmount;
        countSkipped++;
      }
    }
  }

  console.log(`Total Recebido (sistema): ${fmt(total)} (${countPayments} recebimentos, ${countSkipped} ignorados como Por Bens)\n`);

  console.log("Por empresa:");
  console.log("Empresa".padEnd(60), "Total Líquido".padStart(20), "Recebs".padStart(8), "Por Bens skipped".padStart(20));
  console.log("-".repeat(115));
  Array.from(perCompany.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([co, e]) => {
      console.log(
        co.padEnd(60).slice(0, 60),
        fmt(e.total).padStart(20),
        String(e.count).padStart(8),
        e.skipped > 0 ? `${e.skipped}× ${fmt(e.skippedValue)}`.padStart(20) : "-".padStart(20)
      );
    });

  await pool.end();
})();
