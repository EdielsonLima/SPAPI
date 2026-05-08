// Compara Total a Receber por empresa (Sistema vs Sienge "Contas a Receber por Cliente").
// Mesma fórmula do Painel: correctedBalanceAmount - discountAmount - taxAmount
// para items com correctedBalanceAmount > 0 e dueDate >= hoje.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = new Date().toISOString().split("T")[0]; // 2026-05-08

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_income ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache cached_at: ${r.rows[0].cached_at}`);
  console.log(`Hoje: ${todayStr}\n`);

  // Excluir HOLDING/ADMINISTRADORA + tipo doc CONTRATO DE LOCA (mesmo padrão Painel)
  const isExcludedCompany = (n) => {
    const u = (n || "").toUpperCase();
    return u.includes("HOLDING") || u.includes("ADMINISTRADORA");
  };
  const isExcludedDocType = (t) => {
    const u = (t || "").toUpperCase();
    return u.startsWith("PREVISÃO") || u.startsWith("PREVISAO") || u.startsWith("CONTRATO DE LOCA");
  };

  const perCompany = new Map();
  let total = 0;
  let count = 0;
  // Período PDF: 09/05/2026 a 31/12/2040 — vamos ignorar dueDate > 2040-12-31 também
  const periodEnd = "2040-12-31";

  for (const i of items) {
    if (isExcludedCompany(i.companyName)) continue;
    if (isExcludedDocType(i.documentIdentificationName)) continue;
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate < todayStr) continue;
    if (i.dueDate > periodEnd) continue;
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

  // PDF Total da empresa por empresa — usuário compartilhou só DOMUS R$ 31.943.781,02
  // Total geral PDF: R$ 165.826.426,59
  const PDF = {
    "DOMUS": 31943781.02,
  };
  const PDF_TOTAL = 165826426.59;

  console.log("Empresa".padEnd(50), "Sistema".padStart(20), "PDF".padStart(20), "Diff".padStart(15), "#parcelas".padStart(10));
  console.log("-".repeat(120));
  Array.from(perCompany.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([co, e]) => {
    const pdf = PDF[co] || 0;
    const diff = pdf > 0 ? e.total - pdf : null;
    console.log(
      co.padEnd(50).slice(0, 50),
      fmt(e.total).padStart(20),
      pdf > 0 ? fmt(pdf).padStart(20) : "(s/PDF)".padStart(20),
      diff !== null ? fmt(diff).padStart(15) : "-".padStart(15),
      String(e.count).padStart(10)
    );
  });
  console.log("-".repeat(120));
  console.log("TOTAL".padEnd(50), fmt(total).padStart(20), fmt(PDF_TOTAL).padStart(20), fmt(total - PDF_TOTAL).padStart(15), String(count).padStart(10));

  await pool.end();
})();
