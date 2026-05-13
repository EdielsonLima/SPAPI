const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

const COMPANY = "SILVA ADMINISTRADORA HOLDING LTDA";
const PDF_END = "2026-05-09";
const PDF_TOTAL = 15184547.30;

// Apenas valores agregados — vou agregar tudo que não é credor específico
// numa categoria "OUTROS" pra simplificar (incluindo as várias linhas de RESGATE).
const PDF_HOLDING = [
  ["", 1476421.47],
  ["1 TABELIONATO DE NOTAS E PROTESTOS DE TITULOS DE BALNEARIO CAMBORIU", 443.26],
  ["2 TABELIONATO DE NOTAS E 1 DE PROTESTOS DE TITULOS DA COMARCA DA CAPITAL", 419.67],
  ["500 TARIFA RENOVAÇÃO CADASTRO COBRANÇA REFERENTE 06/10/2025", 66.20],
  ["51.022.476 JULIANE SABINO DOS SANTOS", 120.00],
  ["62.103.446 JOSE CARLOS NOTTE PRIMO", 2100.00],
  ["ALESSANDRA CRISTINA", 300.00],
  ["AMBIENTAL LIMPEZA URBANA E SANEAMENTO LTDA", 4899.95],
  ["ARLETE CATARINA NAU", 47.00],
  ["AUTÔNOMO", 50.00],
  ["B2 SOLUCOES EM MARKETING LTDA", 3261.86],
  ["BALNEARIO CAMBORIU 2 TABELIONATO DE NOTAS", 6222.91],
  ["BANCO BRADESCO S.A.", 52.40],
  ["BANCO DO BRASIL SA", 723.00],
  ["BARBARA CRISTINA BERNARDINI", 3000.00],
  ["BEAU BLANC HOME POR PAULA MARTENDAL LTDA", 7300.00],
  ["CAIXA ECONOMICA FEDERAL", 42038.83],
  ["CARLOS HUMBERTO METZNER SILVA", 1670156.13],
  ["CARLOS HUMBERTO SILVA", 90000.00],
  ["CARLOS NASCIMENTO IMOVEIS LTDA", 4500.00],
  ["CASA DI PASTEL COMERCIO DE ALIMENTOS LTDA", 150.00],
  ["CELESC DISTRIBUICAO S.A", 96.91],
  ["CHAVEIRO PAO DE ACUCAR - ALEXANDRE JOSE DA CUNHA", 295.00],
  ["CLEVERSON JOÃO TAVARES", 15300.00],
  ["COFINS", 9790.89],
  ["COMPRAS ONLINE", 5263.15],
  ["CONDOMINIO EDIFICIO ARNOLDO WERNER", 3691.16],
  ["CONDOMINIO EDIFICIO ESQUINA DI MODENA", 228.66],
  ["CONDOMINIO EDIFICIO ESQUINA DI MONACO", 7350.73],
  ["CONDOMINIO EDIFICIO RESIDENCIAL ESQUINA CENTRAL", 2760.96],
  ["CSLL", 172081.79],
  ["DALCICLEIA NUNES PAIVA", 180.00],
  ["EDIFICIO RESIDENCIAL ESQUINA DOS ACORES", 285.28],
  ["EMPRESA MUNICIPAL DE AGUA E SANEAMENTO DE BALNEARIO CAMBORIU", 4841.81],
  ["ESGATE BRUTO R$ 370.283,77, = RESGATE LÍQUIDO R$ 356.902,58, O VALOR DE R$ 13.381,19 É REFERENTE AO IMPOSTO (IR)", 13381.19],
  ["FABIANDRO MANSUR CARON", 5500.00],
  ["FEDERACAO DOS CONTABILISTAS DO ESTADO DE SANTA CATARINA", 184.00],
  ["FJC CONSTRUTORA E INCORPORADORA LTDA", 600000.00],
  ["G.BAGGIO", 6304.20],
  ["GELSON ANTONIO ANHAIA DE LIMA", 2250.00],
  ["HSC DIAGNOSTICOS LTDA", 40.00],
  ["IDIVALDO BIASEBETTI 03217115996", 12500.00],
  ["INSTITUTO NACIONAL DE SEGURIDADE SOCIAL", 24567.60],
  ["IR CDB FACIL - REF. RESGATE", 65222.28],
  ["IRPJ", 214478.59],
  ["JOSE CARLOS DE OLIVEIRA", 2080.00],
  ["JOÃO PAULO PACKER SILVA", 2183679.01],
  ["JUCESC - SERVIÇO DE REGISTRO DO COMÉRCIO", 175.00],
  ["KABUM COMERCIO ELETRONICO S.A.", 1604.20],
  ["LOJAS DE DEPARTAMENTOS MILIUM LTDA", 626.60],
  ["M.R. MAFRA E CIA. LTDA", 31130.00],
  ["MAGAZINE LUIZA S/A", 5263.15],
  ["MARCOS ROBERTO DA ROSA PEREIRA", 11000.00],
  ["MARIANA VIEGAS CUNHA", 11314.06],
  ["MARIANGELA SCALISE DE SOUZA FARIA 16191295820", 750.00],
  ["METAL ART BC LTDA", 2500.00],
  ["MOACIR FERNANDES ZEFERINO", 350.00],
  ["MUNICIPIO DE BALNEARIO CAMBORIU", 311126.62],
  ["MUNICIPIO DE BALNEARIO DE PICARRAS", 46472.29],
  ["MUNICIPIO DE CAMBORIU", 68507.27],
  ["NEUSELI DE QUADROS PACKER", 85133.74],
  ["OPERADOR NACIONAL DO SISTEMA DE REGISTRO ELETRONICO DE IMOVEIS ( ONR )", 5689.00],
  ["PAPELARIA COR DE ROSA LTDA", 102.60],
  ["PIS", 2121.36],
  ["POLÍTICA", 10000.00],
  ["PRIMEIRO OFICIO DE REGISTRO DE IMOVEIS DE BALNEARIO CAMBORIU", 306.50],
  ["RESGATE BRUTO R$ 1.189.177,56, = RESGATE LÍQUIDO R$ 1.165.081, 93, O VALOR DE R$ 24.095,63 É REFERENTE AO IMPOSTO (IR)", 24095.63],
  ["RESGATE BRUTO R$ 107,34, = RESGATE LÍQUIDO R$ 102,58, O VALOR DE R$ 4,76 É REFERENTE AO IMPOSTO (I", 4.76],
  ["RESGATE BRUTO R$ 107,83, = RESGATE LÍQUIDO R$ 103,07, O VALOR DE R$ 4,76 É REFERENTE AO IMPOSTO (IR)", 4.76],
  ["RESGATE BRUTO R$ 159.053,20, = RESGATE LÍQUIDO R$ 152.070,12, O VALOR DE R$ 6.983,08 É REFERENTE AO IMPOSTO (IR)", 6983.08],
  ["RESGATE BRUTO R$ 62.754,93, = RESGATE LÍQUIDO R$ 60.068,95, O VALOR DE R$ 2.685,98 É REFERENTE AO IMPOSTO (IR)", 2685.98],
  ["RESGATE BRUTO R$ 7.682,14, = RESGATE LÍQUIDO R$ 7.345,32, O VALOR DE R$ 336,82 É REFERENTE AO IMPOSTO (IR)", 336.82],
  ["RESGATE LÍQUIDO R$ 100.000,00 RESGATE BRUTO R$ 104.373,95 O VALOR DE R$ 4.373,95 É REFERENTE AO IMPOSTO (IR)", 4373.95],
  ["RESGATE LÍQUIDO R$ 100.013,60 RESGATE BRUTO R$ 100.069,02 O VALOR DE R$ 55,42 É REFERENTE AO IMPOSTO (IR)", 55.42],
  ["RESGATE LÍQUIDO R$ 112.647,10 RESGATE BRUTO R$ 112.668,68 O VALOR DE R$ 21,58 É REFERENTE AO IMPOSTO (IR)", 21.58],
  ["RESGATE LÍQUIDO R$ 376.031,63 RESGATE BRUTO R$ 376.125,33 O VALOR DE R$ 93,04 É REFERENTE AO IMPOSTO (IR) + O VALOR DE R$ 0,66 É REFERENTE AO IMPOSTO (IOF)", 93.70],
  ["RESGATE LÍQUIDO R$ 42.952,16 RESGATE BRUTO R$ 42.960,46 O VALOR DE R$ 8,30 É REFERENTE AO IMPOSTO (IR)", 8.30],
  ["RESGATE LÍQUIDO R$ 50.000,00 RESGATE BRUTO R$ 50.014,71 O VALOR DE R$ 14,71 É REFERENTE AO IMPOSTO (IR)", 14.71],
  ["RESGATE LÍQUIDO R$ 69.812,00 RESGATE BRUTO R$ 69.829,49 O VALOR DE R$ 17,49 É REFERENTE AO IMPOSTO (IR)", 17.49],
  ["RESGATE LÍQUIDO R$ 70102,04 RESGATE BRUTO R$ 70130,07 O VALOR DE R$ 28,03 É REFERENTE AO IMPOSTO (IR)", 28.03],
  ["RESGATE LÍQUIDO R$ 75.595,86 RESGATE BRUTO R$ 75.617,03 O VALOR DE R$ 21,17 É REFERENTE AO IMPOSTO (IR)", 21.17],
  ["RESGATE LÍQUIDO R$ 80.828,30 RESGATE BRUTO R$ 80.877,06 O VALOR DE R$ 48,76 É REFERENTE AO IMPOSTO (IR)", 48.76],
  ["RESGATE LÍQUIDO R$ 98.084,00 RESGATE BRUTO R$ 98.125,66 O VALOR DE R$ 41,66 É REFERENTE AO IMPOSTO (IR)", 41.66],
  ["RODRIGO DE FARIA", 1570000.00],
  ["SANTA CATARINA TRIBUNAL DE JUSTICA", 53.06],
  ["SECRETARIA DE FAZENDA FEDERAL", 86378.28],
  ["SEGUNDO OFICIO DO REGISTRO DE IMOVEIS DE BALNEARIO CAMBORIU", 226.12],
  ["SILVA ADM FUNCIONÁRIOS", 77388.81],
  ["SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA", 1330377.40],
  ["SIND DOS EMPREGADOS EM EMDE C V L A DE IMOVEIS R C DEBC", 359.84],
  ["SUL BRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA", 1700000.00],
  ["SUPERMERCADO", 76.94],
  ["TAMOYO COMERCIO DE FERRAMENTAS FERRAGENS E ARTIGOS PARA MARCENARIA LTDA", 241.70],
  ["TANIA REGINA DE GIULI CASARI", 400000.00],
  ["TARIFA RENOVAÇÃO DE CADASTRO", 132.40],
  ["TECNOLINE SUL PRODUCOES E PROJETOS LTDA", 717.86],
  ["TED TRANSF.ELETR.DISPONIV - 033 3872 88899381968 NEUSELI DE QUADRO", 4584.41],
  ["TINTAS DARKA LTDA", 1302.40],
  ["UAPES VILARA - CONSTRUCOES E EMPREENDIMENTOS - EIRELI", 2700000.00],
  ["VERA LUCIA DA SILVA 05332025904", 24.00],
  ["VIANA (HELICÓPTERO)", 13500.00],
  ["VILSON D. (M.V. VIDRAÇARIA E SERRALHERIA)", 800.00],
  ["WILLIAN BRESOLIM", 750.00],
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

  const pdfMap = new Map(PDF_HOLDING.map(([n, v]) => [norm(n), { name: n, expected: v }]));

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
  console.log(`Cache total HOLDING: ${fmt(cacheTotal)} (${byCreditor.size} credores)`);
  console.log(`PDF   total HOLDING: ${fmt(pdfTotal)} (${pdfMap.size} credores) — declarado ${fmt(PDF_TOTAL)}`);
  console.log(`Diff cache - PDF:    ${fmt(cacheTotal - pdfTotal)}\n`);

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
  for (const p of onlyInPdf.slice(0, 20)) console.log(`  ${fmt(p.expected).padStart(20)}  ${p.name}`);

  console.log(`\n=== ${diffs.length} credores com VALOR DIFERENTE (>R$ 0,50) ===`);
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  for (const d of diffs.slice(0, 30)) {
    console.log(`  cache ${fmt(d.cache).padStart(18)}  pdf ${fmt(d.pdf).padStart(18)}  diff ${fmt(d.diff).padStart(15)}  ${d.name}`);
    for (const p of d.parts.slice(0, 8)) console.log(`    ${p.source} ${p.info} ${fmt(p.amt)}`);
  }

  await pool.end();
})();
