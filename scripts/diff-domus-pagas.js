// Compara DOMUS cache vs PDF "Contas Pagas (por Credor) Sintético" 09/05.
// Total PDF: R$ 7.599.762,96 (gerado 09/05/2026 09:33:26).

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

const COMPANY = "DOMUS";
const PDF_TOTAL = 7599762.96;

const PDF_DOMUS = [
  ["1 TABELIONATO DE NOTAS E PROTESTOS DE TITULOS DE BALNEARIO CAMBORIU", 99.39],
  ["51.022.476 JULIANE SABINO DOS SANTOS", 360.00],
  ["A E L COMERCIO DE MADEIRAS EIRELI", 4471.00],
  ["ACOMULTI COMERCIO DE METAIS EIRELI", 270.00],
  ["AG CONSTRUTORA LTDA", 232712.00],
  ["ARCELORMITTAL BRASIL S.A.", 261875.69],
  ["ARIANE FRANÇA RODRIGUES", 40000.00],
  ["AUTÔNOMO", 49970.00],
  ["BHR INDUSTRIA E COMERCIO DE PLASTICOS LTDA", 395.20],
  ["BIOMAX AMBIENTAL CONSULTORIA LTDA", 8900.00],
  ["BRASMUNCK MOVIMENTACAO DE CARGAS LTDA", 4275.00],
  ["CAIXINHA OBRA", 982.90],
  ["CANAVERAL PRODUTOS DE HIGIENE E LIMPEZA EIRELI", 271.19],
  ["CAROLINA SILVA FORTINHO 98840681949", 15500.00],
  ["CASA CONTAINER LTDA", 3000.00],
  ["CASA NOVA COMERCIO DE FERRAGENS E FERRAMENTAS LTDA", 798.20],
  ["CASAS DA AGUA MATERIAIS PARA CONSTRUCAO LTDA", 288.66],
  ["CASSOL MATERIAIS DE CONSTRUCAO LTDA", 1515.50],
  ["CELESC DISTRIBUICAO S.A", 566.00],
  ["CIA DE CIMENTO ITAMBE", 7944.30],
  ["CMIMOVEIS NEGOCIOS IMOBILIARIOS LTDA", 146250.00],
  ["COFINS", 4396.43],
  ["CONSELHO REGIONAL DE ENGENHARIA E AGRONOMIA DE SANTA CATARINA", 99.64],
  ["CORREA MATERIAIS ELETRICOS LTDA - EM RECUPERACAO JUDICIAL", 1934.88],
  ["CSLL", 1433.02],
  ["DANIEL KNABBEN", 10001.65],
  ["DESC IMOVEIS E REPRESENTACOES LTDA", 60000.00],
  ["DETALHE CONSTRUTORA LTDA", 12600.00],
  ["DIEGO GONCALVES ONESKO NEGOCIOS IMOBILIARIOS LTDA", 58794.00],
  ["DILSON BURGHAUSEN", 7700.00],
  ["DILSON BURGHAUSEN 96101946991", 4000.00],
  ["DJ COMPONENTES PARA CALCADOS EIRELI", 6754.92],
  ["DK INSTALACOES LTDA.", 37389.05],
  ["E. M NEGOCIOS IMOBILIARIOS LTDA", 121500.00],
  ["EDUARDO KNABBEN", 10001.65],
  ["EMPRESA MUNICIPAL DE AGUA E SANEAMENTO DE BALNEARIO CAMBORIU", 1119.19],
  ["FABIO POLLHEIM 03602911985", 350.00],
  ["FIX E COMPANY LTDA", 2650.00],
  ["FLY IMOVEIS LTDA", 148500.00],
  ["FN ENGENHARIA DE ESTRUTURAS LTDA.", 58806.96],
  ["GAIDZINSKI TELHAS EIRELI", 4574.22],
  ["GAMA LOCADORA DE EQUIPAMENTOS LTDA", 210.00],
  ["GEISA CRISTINA NAGANO SELEME", 200000.00],
  ["GILBERTO BOING", 397886.00],
  ["GKS DESIGN DE INTERIORES LTDA.", 1187.50],
  ["INSTITUTO DE ESTUDOS DE PROTESTO DE TITULOS DO BRASIL", 128.43],
  ["INSTITUTO NACIONAL DE SEGURIDADE SOCIAL", 8312.98],
  ["IRMAOS SCHMIDT INDUSTRIA E COMERCIO DE POSTES E ARTEFATOS DE CIMENTO LTDA", 800.00],
  ["JARDINS DEPODAS LTDA", 3500.00],
  ["JOÃO LUIZ FLAUZINO DOS SANTOS", 450.00],
  ["JUAN CARLOS AMAYA", 331185.64],
  ["JULIANO MELLO MORAES EIRELI", 150000.00],
  ["JULIANO PISKE", 384.00],
  ["LAUDE ENGENHARIA E ENSAIO DE MATERIAIS EIRELI", 980.00],
  ["LIBERTY SEGUROS S/A", 39931.66],
  ["MAC CONSULTORIA IMOBILIARIA EIRELI", 470000.00],
  ["MANOEL JOAO FRANCISCO FILHO", 6080.00],
  ["MARKUS HENRIQUE SASSE", 210.00],
  ["MAX MOHR FILHO CIA LTDA", 648757.55],
  ["MFTECH ANALISE TECNICA LTDA", 11068.00],
  ["MULTISEG COMERCIO DE EQUIPAMENTOS DE SEGURANCA EIRELI", 3630.00],
  ["MUNICIPIO DE BALNEARIO CAMBORIU", 1672350.07],
  ["MUNICIPIO DE CAMBORIU", 4077.00],
  ["MUNICIPIO DE ITAJAI", 4350.53],
  ["N. OPCAO SC COMERCIO DE EQUIPAMENTOS E EPIS EIRELI", 743.60],
  ["NEUMANN E SIMAO NEGOCIOS IMOBILIARIOS LTDA", 175000.00],
  ["NORDT SOLUÇÕES LTDA.", 6764.00],
  ["OPERADOR NACIONAL DO SISTEMA DE REGISTRO ELETRONICO DE IMOVEIS ( ONR )", 16286.00],
  ["ORION DISTRIBUIDORA", 247.43],
  ["OXFORD ENGENHARIA LTDA", 30614.87],
  ["P. F. COMERCIO DE MADEIRAS LTDA", 34050.00],
  ["PB MATERIAIS ELETRICOS,HIDRAULICOS E ILUMINACAO LTDA", 3230.00],
  ["PIS", 938.44],
  ["PROJETT SOLUCOES EM ENGENHARIA EIRELI", 70480.00],
  ["RC PAPEIS LTDA", 37.20],
  ["RCN COMERCIO VAREJISTA DE MATERIAIS DE CONSTRUCAO LTDA", 605.00],
  ["RENATA K IMOVEIS LTDA", 7500.00],
  ["RESERVA IMOB - CONSULTORIA IMOBILIARIA LTDA", 82500.00],
  ["RET - Secretaria da Fazenda - RET", 55964.00],
  ["RHARIE COMÉRCIO E TRANSPORTE DE MATERIAIS DE CONSTRUÇÃO LTDA.", 370936.80],
  ["RODRIGO MORAES", 93800.00],
  ["RODRIGO MORAES DE PAULA 04084200905", 25200.00],
  ["ROGÉRIO VARGAS ELISBÃO", 2500.00],
  ["RPLAST ESPAÇADORES LTDA", 5855.00],
  ["SCHIRMANN SOLUCOES EM ACO LTDA", 59850.42],
  ["SECRETARIA DE FAZENDA FEDERAL", 499953.84],
  ["SOLO SONDAGEM E CONSTRUCOES LTDA", 14197.95],
  ["SOLUGEOT SOLUÇÕES EM ANÁLISES TÉCNICAS LTDA.", 69261.30],
  ["SR. SOUZA - FRETEIRO CONTAINER", 350.00],
  ["SW SOLUCOES EM TATICAS DIGITAIS LTDA", 462.08],
  ["TAMOYO COMERCIO DE FERRAMENTAS FERRAGENS E ARTIGOS PARA MARCENARIA LTDA", 1298.28],
  ["TATICO SOLUCOES GESTAO DE EMPREENDIMENTOS LTDA", 28155.00],
  ["TERMOVALE INDUSTRIA E COMERCIO DE POLIESTIRENO E ACO LTDA", 157.00],
  ["TERRA BRASIL COMERCIO E TRANSPORTES DE MATERIAIS DE CONSTRUCAO LTDA", 212987.45],
  ["TERRAL - IMOVEIS LTDA", 190445.65],
  ["TERRANORTE EMPREENDIMENTOS IMOBILIARIOS LTDA", 150000.00],
  ["TIAGO KNABBEN", 10001.65],
  ["VIEIRACON EMPREITEIRA DE MAO DE OBRA EIRELI", 20000.00],
  ["VILMAR BOFF 61981524991", 860.00],
  ["WALTRICK E ESSER ADVOGADOS ASSOCIADOS", 70000.00],
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
  function add(name, amt, source, info) {
    const key = norm(name);
    if (!byCreditor.has(key)) byCreditor.set(key, { name, total: 0, parts: [] });
    const r = byCreditor.get(key);
    r.total += amt;
    r.parts.push({ amt, source, info });
  }

  for (const item of items) {
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    const payments = item.payments || [];
    for (const p of payments) {
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      add(item.creditorName, p.netAmount, "payment", `${p.paymentDate} bill=${item.billId} op=${p.operationTypeName}`);
    }
  }

  for (const b of bms) {
    if (b.bankMovementAmount === 0) continue;
    if (!b.bankMovementDate) continue;
    const historic = (b.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    add(b.creditorName || b.bankMovementHistoricName || "Tarifa Bancária",
      Math.abs(b.bankMovementAmount), "bm", `${b.bankMovementDate} historic=${b.bankMovementHistoricName}`);
  }

  const pdfMap = new Map(PDF_DOMUS.map(([n, v]) => [norm(n), { name: n, expected: v }]));

  const onlyInCache = [];
  const onlyInPdf = [];
  const diffs = [];
  let cacheTotal = 0;

  for (const [key, c] of byCreditor) {
    cacheTotal += c.total;
    const pdf = pdfMap.get(key);
    if (!pdf) {
      onlyInCache.push({ name: c.name, total: c.total, parts: c.parts });
    } else {
      const d = c.total - pdf.expected;
      if (Math.abs(d) > 0.5) diffs.push({ name: c.name, cache: c.total, pdf: pdf.expected, diff: d });
    }
  }
  for (const [key, p] of pdfMap) {
    if (!byCreditor.has(key)) onlyInPdf.push({ name: p.name, expected: p.expected });
  }

  const pdfTotal = Array.from(pdfMap.values()).reduce((s, p) => s + p.expected, 0);
  console.log(`Cache total DOMUS: ${fmt(cacheTotal)} (${byCreditor.size} credores)`);
  console.log(`PDF   total DOMUS: ${fmt(pdfTotal)} (${pdfMap.size} credores) — declarado ${fmt(PDF_TOTAL)}`);
  console.log(`Diff cache - PDF:  ${fmt(cacheTotal - pdfTotal)}\n`);

  console.log(`=== ${onlyInCache.length} credores SÓ NO CACHE ===`);
  onlyInCache.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  for (const c of onlyInCache.slice(0, 30)) {
    console.log(`  ${fmt(c.total).padStart(20)}  ${c.name}`);
    for (const p of c.parts.slice(0, 5)) console.log(`    ${p.source} ${p.info} ${fmt(p.amt)}`);
  }

  console.log(`\n=== ${onlyInPdf.length} credores SÓ NO PDF ===`);
  onlyInPdf.sort((a, b) => Math.abs(b.expected) - Math.abs(a.expected));
  for (const p of onlyInPdf.slice(0, 30)) console.log(`  ${fmt(p.expected).padStart(20)}  ${p.name}`);

  console.log(`\n=== ${diffs.length} credores com VALOR DIFERENTE (>R$ 0,50) ===`);
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  for (const d of diffs.slice(0, 30)) {
    console.log(`  cache ${fmt(d.cache).padStart(18)}  pdf ${fmt(d.pdf).padStart(18)}  diff ${fmt(d.diff).padStart(15)}  ${d.name}`);
  }

  await pool.end();
})();
