// Compara Total a Pagar por empresa (Sistema vs Sienge "Contas a Pagar").
// Mesma fórmula do Painel: correctedBalanceAmount - discountAmount - taxAmount
// para items com correctedBalanceAmount > 0 e dueDate >= hoje (09/05/2026 em diante).

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Para alinhar com PDF "a partir de amanhã"
const todayStr = "2026-05-09";

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache outcome cached_at: ${r.rows[0].cached_at}`);

  // Excluir HOLDING/ADMINISTRADORA + tipo doc PREVISÃO (mesmo padrão Painel)
  const isExcludedDocType = (t) => {
    const u = (t || "").toUpperCase();
    return u.startsWith("PREVISÃO") || u.startsWith("PREVISAO");
  };

  const perCompany = new Map();
  let total = 0;
  let count = 0;

  for (const i of items) {
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate < todayStr) continue;
    if (isExcludedDocType(i.documentIdentificationName)) continue;
    const eff = (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
    if (eff <= 0) continue;
    const co = i.companyName || "(sem)";
    if (!perCompany.has(co)) perCompany.set(co, { total: 0, count: 0 });
    const e = perCompany.get(co);
    e.total += eff;
    e.count++;
    total += eff;
    count++;
  }

  console.log("\nEmpresa".padEnd(50), "Total a Pagar".padStart(20), "#parcelas".padStart(10));
  console.log("-".repeat(85));
  Array.from(perCompany.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([co, e]) => {
    console.log(co.padEnd(50).slice(0, 50), fmt(e.total).padStart(20), String(e.count).padStart(10));
  });
  console.log("-".repeat(85));
  console.log("TOTAL".padEnd(50), fmt(total).padStart(20), String(count).padStart(10));

  await pool.end();
})();
