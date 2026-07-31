// Confere a pagina "Controle de Locacoes" (Alugueis — modo Holding) contra o
// snapshot validations/holding/alugueis.json, extraido do Power BI
// FINANCEIRO HOLDING.pbix.
//
// O snapshot fica em validations/holding/ (subdiretorio) de proposito:
// scripts/check-validations.js le apenas validations/*.json na raiz, entao os
// snapshots da Holding nao interferem na conferencia das demais empresas.
//
// Uso: node scripts/valida-alugueis.js
//
// A regra de negocio vive em src/lib/alugueis-utils.ts (fonte da verdade, e o
// que a pagina importa). Aqui ela e reescrita em JS puro — mesmo padrao dos
// demais scripts de conferencia deste diretorio. Se alterar um lado, alterar
// o outro: este script existe justamente pra acusar a divergencia.
//
// Escopo: SOMENTE alugueis. Nao toca em nenhuma outra tela/empresa.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// === Espelho de src/lib/alugueis-utils.ts ===
const ALUGUEL_DOC_IDS = new Set(["LOC", "LNC"]);
const ALUGUEL_CATEGORY_IDS = new Set(["10513", "10514"]);

function isAluguel(item) {
  if (!ALUGUEL_DOC_IDS.has((item.documentIdentificationId || "").trim())) return false;
  const cats = item.paymentsCategories || item.receiptsCategories || [];
  return cats.some(c => ALUGUEL_CATEGORY_IDS.has(String(c.financialCategoryId || "").trim()));
}

function recebidoNoPeriodo(item, inicio, fim) {
  let total = 0;
  for (const p of item.payments || []) {
    const data = (p.paymentDate || "").slice(0, 10);
    if (!data || data < inicio || data > fim) continue;
    total += p.netAmount || 0;
  }
  return total;
}

function saldoAberto(item) {
  const corrigido = item.correctedBalanceAmount ?? item.balanceAmount ?? 0;
  return corrigido - (item.discountAmount || 0);
}
// === fim do espelho ===

(async () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "validations", "holding", "alugueis.json"), "utf8")
  );

  const r = await pool.query("SELECT data, cached_at FROM cached_income ORDER BY cached_at DESC LIMIT 1");
  if (!r.rows[0]) {
    console.error("Sem cache de income no banco (cached_income vazio).");
    process.exit(1);
  }
  const all = r.rows[0].data?.data || r.rows[0].data || [];
  const alug = all.filter(isAluguel);

  console.log(`Cache de ${new Date(r.rows[0].cached_at).toISOString().slice(0, 10)}`);
  console.log(`${all.length} titulos a receber | ${alug.length} de locacao (LOC/LNC + cat 10513/10514)\n`);

  let falhas = 0;
  for (const v of snapshot.validations) {
    if (v.scope !== "alugueis-realizado") continue;
    let total = 0;
    for (const i of alug) {
      if (v.company !== "TOTAL" && i.companyName !== v.company) continue;
      total += recebidoNoPeriodo(i, v.startDate, v.endDate);
    }
    const diff = Math.abs(total - v.expected);
    const passou = diff <= (v.tolerance ?? 0.005);
    if (!passou) falhas++;
    console.log(
      `  ${passou ? "OK " : "FAIL"} ${v.company.padEnd(46)} ` +
      `calculado ${fmt(total).padStart(18)}  esperado ${fmt(v.expected).padStart(18)}` +
      (passou ? "" : `  diff ${fmt(diff)}`)
    );
  }

  // Panorama corrente (nao validado — so pra acompanhar o que a tela mostra hoje)
  const anoAtual = new Date().getFullYear();
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  let receber = 0, atrasado = 0, recebido = 0;
  for (const i of alug) {
    const venc = (i.dueDate || "").slice(0, 10);
    if (venc.startsWith(String(anoAtual))) {
      const s = saldoAberto(i);
      if (s > 0) {
        receber += s;
        if (venc < hojeISO) atrasado += s;
      }
    }
    for (const p of i.payments || []) {
      if ((p.paymentDate || "").startsWith(String(anoAtual))) recebido += p.netAmount || 0;
    }
  }
  console.log(`\n  Panorama ${anoAtual} (informativo):`);
  console.log(`    A receber ......... ${fmt(receber)}`);
  console.log(`    Atrasado .......... ${fmt(atrasado)}`);
  console.log(`    Recebido .......... ${fmt(recebido)}`);

  console.log(falhas === 0 ? "\n>>> OK — 0 divergencias" : `\n>>> ${falhas} DIVERGENCIA(S)`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
})();
