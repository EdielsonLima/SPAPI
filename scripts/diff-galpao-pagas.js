const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

const COMPANY = "GALPÃO - RUA CANELINHA PROJ: 120/15";
const PDF_END = "2026-05-09";
const PDF_TOTAL = 1127065.47;

const PDF_GALPAO = [
  ["51.022.476 JULIANE SABINO DOS SANTOS", 700.00],
  ["ACOMULTI COMERCIO DE METAIS EIRELI", 390.00],
  ["ADJALMO DA SILVA", 1176.00],
  ["AMARAL E AMARAL SERVICOS HIDRAULICOS LTDA", 10875.00],
  ["AMBIENTAL LIMPEZA URBANA E SANEAMENTO LTDA", 400.36],
  ["ARCA AGRO AMBIENTAL LTDA", 955.20],
  ["BALNEARIO MATERIAIS DE CONSTRUCAO EIRELI", 47726.25],
  ["BIOMAX AMBIENTAL CONSULTORIA LTDA", 700.00],
  ["BRUNO CÉSAR CERQUEIRA", 50000.00],
  ["CAIXINHA OBRA", 522.94],
  ["CASAS DA AGUA MATERIAIS PARA CONSTRUCAO LTDA", 4765.94],
  ["CELESC DISTRIBUICAO S.A", 11400.81],
  ["COMERCIO DE FERRAGENS LEANDRO LTDA", 100.00],
  ["CORREA MATERIAIS ELETRICOS LTDA - EM RECUPERACAO JUDICIAL", 5900.00],
  ["DEVALDO GALITZKI LTDA", 2800.00],
  ["DOGMA REPRESENTAÇÕES E CONSULTORIA EM ENERGIA LTDA.", 1927.53],
  ["ENERGILUZ COMERCIO DE MATERIAIS ELETRICOS LTDA", 8200.00],
  ["FIDATI DK INSTALACOES LTDA", 5200.00],
  ["GALANCINI TERRAPLANAGEM LTDA", 41377.50],
  ["GIACOMOSSI ESTRUTURAS EIRELI", 718322.11],
  ["IDEAL INDUSTRIA E COMERCIO DE FERRAGENS LTDA", 18603.70],
  ["INSTITUTO NACIONAL DE SEGURIDADE SOCIAL", 8115.80],
  ["IRMAOS SCHMIDT INDUSTRIA E COMERCIO DE POSTES E ARTEFATOS DE CIMENTO LTDA", 2930.00],
  ["JOÃO BATISTA LISBOA MEI.", 760.00],
  ["LEANDRO SALVINI 52631591968", 12500.00],
  ["LITORAL CONCRETO ESTAMPADO LTDA", 14448.78],
  ["LORENZZO PISOS INDUSTRIAIS EIRELI", 38712.00],
  ["MANOEL JOAO FRANCISCO FILHO", 11115.00],
  ["MARCOTELHAS INDUSTRIA LTDA", 3360.00],
  ["MUNICIPIO DE BALNEARIO CAMBORIU", 6388.01],
  ["MUNICIPIO DE CAMBORIU", 128.72],
  ["MUNICIPIO DE ITAJAI", 225.00],
  ["NORDT SOLUÇÕES LTDA.", 1500.00],
  ["NXT ENGENHARIA ELETRICA LTDA", 4350.00],
  ["OCL COMERCIO E IMPORTACAO LTDA", 253.59],
  ["P. F. COMERCIO DE MADEIRAS LTDA", 450.00],
  ["REFLORESTADORA RS LTDA", 700.00],
  ["ROSSI MATERIAIS ELETRICOS LTDA", 110.00],
  ["RWP CONSTRUCOES LTDA", 8098.50],
  ["SOLO SONDAGEM E CONSTRUCOES LTDA", 5167.50],
  ["TAMOYO COMERCIO DE FERRAMENTAS FERRAGENS E ARTIGOS PARA MARCENARIA LTDA", 420.00],
  ["TECNOPEDRAS MINERACAO LTDA", 60684.23],
  ["TERRA BRASIL COMERCIO E TRANSPORTES DE MATERIAIS DE CONSTRUCAO LTDA", 14355.00],
  ["VILMAR BOFF 61981524991", 250.00],
];

const EXCLUDED_OP = ["substitui", "cancelamento", "abatimento", "devolu"];
const isExcludedOp = (n) => EXCLUDED_OP.some(x => (n || "").toLowerCase().includes(x));
const EXCLUDE_HISTORIC_PATTERNS = [
  "rendimento", "aplicação", "aplicacao", "resgate",
  "transferência", "transferencia", "saque", "depósito", "deposito",
  "estorno", "recebimento",
];

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = (r.rows[0].data?.data || []).filter(i => i.companyName === COMPANY);

  const bm = await pool.query(
    "SELECT data FROM cached_bank_movements WHERE start_date NOT LIKE 'all:%' ORDER BY cached_at DESC LIMIT 1"
  );
  const bms = (bm.rows[0]?.data?.data || []).filter(b => b.companyName === COMPANY);

  const byCreditor = new Map();
  function add(name, amt, source, info, date) {
    const key = norm(name);
    if (!byCreditor.has(key)) byCreditor.set(key, { name, total: 0, parts: [] });
    const r = byCreditor.get(key);
    r.total += amt;
    r.parts.push({ amt, source, info, date });
  }

  let futurosTotal = 0;
  const futuros = [];

  for (const item of items) {
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      add(item.creditorName, p.netAmount, "payment",
        `${p.paymentDate} bill=${item.billId} op=${p.operationTypeName}`, p.paymentDate);
      if (p.paymentDate > PDF_END) {
        futuros.push({ date: p.paymentDate, creditor: item.creditorName, bill: item.billId, amt: p.netAmount, op: p.operationTypeName });
        futurosTotal += p.netAmount;
      }
    }
  }

  for (const b of bms) {
    if (b.bankMovementAmount === 0) continue;
    if (!b.bankMovementDate) continue;
    const historic = (b.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    const amt = Math.abs(b.bankMovementAmount);
    add(b.creditorName || b.bankMovementHistoricName || "Tarifa Bancária",
      amt, "bm", `${b.bankMovementDate} historic=${b.bankMovementHistoricName}`, b.bankMovementDate);
    if (b.bankMovementDate > PDF_END) {
      futuros.push({ date: b.bankMovementDate, creditor: b.creditorName || "BM", bill: "BM", amt, op: "Movimento Bancário" });
      futurosTotal += amt;
    }
  }

  const pdfMap = new Map(PDF_GALPAO.map(([n, v]) => [norm(n), { name: n, expected: v }]));

  const onlyInCache = [];
  const onlyInPdf = [];
  const diffs = [];
  let cacheTotal = 0;

  for (const [key, c] of byCreditor) {
    cacheTotal += c.total;
    const pdf = pdfMap.get(key);
    if (!pdf) onlyInCache.push({ name: c.name, total: c.total, parts: c.parts });
    else {
      const d = c.total - pdf.expected;
      if (Math.abs(d) > 0.5) diffs.push({ name: c.name, cache: c.total, pdf: pdf.expected, diff: d, parts: c.parts });
    }
  }
  for (const [key, p] of pdfMap) {
    if (!byCreditor.has(key)) onlyInPdf.push({ name: p.name, expected: p.expected });
  }

  const pdfTotal = Array.from(pdfMap.values()).reduce((s, p) => s + p.expected, 0);
  console.log(`Cache total GALPÃO: ${fmt(cacheTotal)} (${byCreditor.size} credores)`);
  console.log(`PDF   total GALPÃO: ${fmt(pdfTotal)} (${pdfMap.size} credores)`);
  console.log(`Diff cache - PDF:   ${fmt(cacheTotal - pdfTotal)}\n`);

  if (futuros.length > 0) {
    console.log(`=== ${futuros.length} pagamentos com paymentDate FUTURO (> ${PDF_END}) total=${fmt(futurosTotal)} ===`);
    futuros.sort((a, b) => a.date.localeCompare(b.date));
    for (const f of futuros) console.log(`  ${f.date}  ${fmt(f.amt).padStart(15)}  bill=${f.bill}  ${f.creditor}  op=${f.op}`);
    console.log();
  }

  console.log(`=== ${onlyInCache.length} credores SÓ NO CACHE ===`);
  onlyInCache.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  for (const c of onlyInCache.slice(0, 20)) {
    console.log(`  ${fmt(c.total).padStart(20)}  ${c.name}`);
    for (const p of c.parts.slice(0, 5)) console.log(`    ${p.source} ${p.info} ${fmt(p.amt)}`);
  }

  console.log(`\n=== ${onlyInPdf.length} credores SÓ NO PDF ===`);
  for (const p of onlyInPdf) console.log(`  ${fmt(p.expected).padStart(20)}  ${p.name}`);

  console.log(`\n=== ${diffs.length} credores com VALOR DIFERENTE (>R$ 0,50) ===`);
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  for (const d of diffs) {
    console.log(`  cache ${fmt(d.cache).padStart(18)}  pdf ${fmt(d.pdf).padStart(18)}  diff ${fmt(d.diff).padStart(15)}  ${d.name}`);
    for (const p of d.parts) console.log(`    ${p.source} ${p.info} ${fmt(p.amt)}`);
  }

  await pool.end();
})();
