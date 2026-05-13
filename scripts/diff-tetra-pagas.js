const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

const COMPANY = "TETRA";
const PDF_END = "2026-05-09";
const PDF_TOTAL = 6517902.90;

const PDF_TETRA = [
  ["23.340.819 GUILHERME CAMARGO DA SILVA VIEIRA", 3750.00],
  ["AMBIENTAL LIMPEZA URBANA E SANEAMENTO LTDA", 1509.19],
  ["AQUARELLA TINTAS LTDA", 163.99],
  ["BENEFICIAMENTO DE MADEIRAS TRATADAS DELLAGNOLO LTDA", 3256.08],
  ["BIOMAX AMBIENTAL CONSULTORIA LTDA", 5300.00],
  ["BRUNO A N WOLF CORRETAGEM DE IMOVEIS LTDA", 85000.00],
  ["CELESC DISTRIBUICAO S.A", 2812.12],
  ["COMPENSADOS BRASIL LTDA", 5040.00],
  ["CONSELHO REGIONAL DE ENGENHARIA E AGRONOMIA DE SANTA CATARINA", 568.25],
  ["DALCICLEIA NUNES PAIVA", 5000.00],
  ["DETALHE CONSTRUTORA LTDA", 22500.00],
  ["EMPRESA MUNICIPAL DE AGUA E SANEAMENTO DE BALNEARIO CAMBORIU", 20728.42],
  ["FIX E COMPANY LTDA", 8010.00],
  ["GAIDZINSKI TELHAS EIRELI", 2519.75],
  ["GAMA LOCADORA DE EQUIPAMENTOS LTDA", 130.00],
  ["GILBERTO BOING", 25200.00],
  ["HANGAR DE USADOS LTDA", 350.00],
  ["LIBERTY SEGUROS S/A", 8524.65],
  ["MAIS PROPAGANDA LTDA", 11080.52],
  ["MARCIO ROBERTO DOS SANTOS", 3965097.96],
  ["MARIANA VIEGAS CUNHA", 39393.13],
  ["MK DEDETIZADORA LTDA", 1350.00],
  ["MUNICIPIO DE BALNEARIO CAMBORIU", 1703553.17],
  ["OSMAR MACHADO MEIRELES", 400.00],
  ["P. F. COMERCIO DE MADEIRAS LTDA", 13518.75],
  ["PABLO R B MARTINS", 1179.30],
  ["PONTUAL DISK ENTULHO LTDA", 270.00],
  ["RAMON FELIX MACEDO", 340000.00],
  ["RET - Secretaria da Fazenda - RET", 68000.00],
  ["SECRETARIA DE FAZENDA FEDERAL", 3737.14],
  ["SEGURANÇA", 19600.00],
  ["TAMOYO COMERCIO DE FERRAMENTAS FERRAGENS E ARTIGOS PARA MARCENARIA LTDA", 600.48],
  ["TERRA BRASIL COMERCIO E TRANSPORTES DE MATERIAIS DE CONSTRUCAO LTDA", 2640.00],
  ["TERRAL - IMOVEIS LTDA", 85000.00],
  ["VIEIRACON EMPREITEIRA DE MAO DE OBRA EIRELI", 1800.00],
  ["WALTRICK E ESSER ADVOGADOS ASSOCIADOS", 60320.00],
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

  const pdfMap = new Map(PDF_TETRA.map(([n, v]) => [norm(n), { name: n, expected: v }]));

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
  console.log(`Cache total TETRA: ${fmt(cacheTotal)} (${byCreditor.size} credores)`);
  console.log(`PDF   total TETRA: ${fmt(pdfTotal)} (${pdfMap.size} credores)`);
  console.log(`Diff cache - PDF:  ${fmt(cacheTotal - pdfTotal)}\n`);

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
