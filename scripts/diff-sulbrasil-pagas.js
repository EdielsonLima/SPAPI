// SUL BRASIL credor-por-credor completo: lista todos do PDF e cruza com cache.
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

const COMPANY = "SUL BRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA";
const PDF_END = "2026-05-09";
const PDF_TOTAL = 84036994.84;

// Todos os credores do PDF SUL BRASIL 09/05 11:14:06
const PDF_SULBRASIL = [
  ["", 29625.35],
  ["1 TABELIONATO DE NOTAS E PROTESTOS DE TITULOS DE BALNEARIO CAMBORIU", 5585.70],
  ["55.095.850 MAICON GODOY GONCALVES", 8900.00],
  ["ADÃO ALVES DE SALLES FILHO", 240000.00],
  ["Aluguel Sala 01 Veneza", 3060.17],
  ["Aluguel Sala 02 Veneza R$: 2.750,00", 2750.00],
  ["Aluguel Sala 03 Bella", 3870.28],
  ["AMBIENTAL LIMPEZA URBANA E SANEAMENTO LTDA", 6674.66],
  ["ANDERSON SCUSCIATO REUTER 05634090962", 1200.00],
  ["AST SERVICO AUXILIAR NA SEGURANCA DO TRABALHO EIRELI", 258.00],
  ["AUTÔNOMO", 13791.83],
  ["BACKES RASTREAMENTO", 2508.06],
  ["BANCO BRADESCO S.A.", 880346.12],
  ["BANCO DO BRASIL SA", 3530326.86],
  ["BIOMAX AMBIENTAL CONSULTORIA LTDA", 3185.58],
  ["CAIXA ECONOMICA FEDERAL", 565881.89],
  ["CARLOS HUMBERTO SILVA", 6284.25],
  ["CASAS DA AGUA MATERIAIS PARA CONSTRUCAO LTDA", 339.50],
  ["CELESC DISTRIBUICAO S.A", 3144.36],
  ["COELHO MARMORES E GRANITOS EIRELI", 4500.00],
  ["COFINS", 624.75],
  ["COMPRAS ONLINE", 7918.88],
  ["CONDOMINIO RESIDENCIAL GRAND ROYALE", 8000.00],
  ["CONDOMINIO RESIDENCIAL SOLAR DI VENEZA", 12024.04],
  ["CONDOMINIO ROYAL GARDEN RESIDENCE", 13396.30],
  ["CONDOMÍNIO EDIFICIO SOLAR DI SIENA", 4389.22],
  ["CONDOMÍNIO EDIFÍCIO ESQUINA BELLA", 30058.16],
  ["CONSELHO REGIONAL DE ENGENHARIA E AGRONOMIA DE SANTA CATARINA", 5158.39],
  ["CSLL", 208.25],
  ["CSM COMERCIO DE MOVEIS E DECORACOES LTDA", 32000.00],
  ["DB CEST PJ", 36.50],
  ["DECORTEC TINTAS LTDA", 259.40],
  ["EDIFICIO TESLA RESIDENCIAL", 4357.19],
  ["ENCARGOS C GARANTIDA IOF CONTR 4906218", 3045.69],
  ["ENKI MOVELEIRA INDUSTRIA E COMERCIO DE PRODUTOS EM MADEIRA LTDA", 1900.00],
  ["ETIPLASTI COMERCIO E SERVICOS EM PLASTICOS LTDA", 3928.09],
  ["EXCEL DIGITALIZAÇÃO DE DADOS", 500.00],
  ["EXCLUSIVI SERVICOS E REFORMAS EIRELI", 1440.00],
  ["FASTBUILT SOLUCOES INTELIGENTES LTDA", 12190.59],
  ["FEDERACAO DOS CONTABILISTAS DO ESTADO DE SANTA CATARINA", 727.00],
  ["FELIPE ROBERTO ROSA", 70000.00],
  ["FERREIRA E CAMARGO VIDROS E ALUMINIOS LTDA", 223500.00],
  ["FREITAS E CAMPAGNHOLO ADVOGADOS ASSOCIADOS", 53700.00],
  ["FUNCIONÁRIOS", 46814.03],
  ["G. LIMA IMOVEIS LTDA", 96470.00],
  ["GAMA LOCADORA DE EQUIPAMENTOS LTDA", 380.00],
  ["GIGANTEC COMERCIO ELETRONICO EIRELI", 0.00],
  ["GILBERTO BOING", 53183.32],
  ["GIZELLY ALVES MARTINS", 3300.00],
  ["GL LIMPEZA E ALPINISMO LTDA.", 300.30],
  ["GREEN LIGHT - ILUMINACAO E ELETRICIDADE EIRELI", 139434.07],
  ["HDI SEGUROS S.A.", 2837.59],
  ["HENRIQUE DOS SANTOS COSTA DIAGNOSTICOS", 40.00],
  ["HSC DIAGNOSTICOS LTDA", 12.00],
  ["ICOBIT IMPERMEABILIZANTES LTDA", 2800.00],
  ["IGLU ENERGIA E CLIMATIZACAO LTDA", 500.00],
  ["IMOBILLE NEGOCIOS IMOBILIARIOS LTDA", 34000.00],
  ["IMOVEIS ALCEU MARCOM LTDA", 45000.00],
  ["INSTITUTO NACIONAL DE SEGURIDADE SOCIAL", 38.50],
  ["JOÃO PAULO PACKER SILVA", 100000.00],
  ["JUCESC - Serviço de Registro do Comércio", 250.00],
  ["KABUM COMERCIO ELETRONICO S.A.", 0.00],
  ["KELLY BIANCA BULAT BELIZARIO 03523097924", 890.00],
  ["LANÇAMENTOS PASSADOS", 66713565.29],
  ["LC IMOVEIS EIRELI", 8000.00],
  ["LIBERTY SEGUROS S/A", 4166.97],
  ["LOCALIZA RENT A CAR SA", 126144.78],
  ["LOVELEE LTDA", 3512.23],
  ["LUIZ ALFREDO SAFFIER", 12000.00],
  ["M. M. MONTEIRO ARTIGOS DE FESTAS E VARIEDADES LTDA", 110.00],
  ["M.R. MAFRA E CIA. LTDA", 160051.31],
  ["M10 INVESTIMENTOS E SEGUROS LTDA", 225000.00],
  ["MADALENA DALVA MENGARDA", 1050000.00],
  ["MANUTENÇÃO", 95.00],
  ["MARCELO DONIZETE FERREIRA 03763268910", 2300.00],
  ["MARCO IMOVEIS EIRELI", 146250.00],
  ["MARIA GORETTI MENGARDA PAULO", 3550000.00],
  ["MARIANA VIEGAS CUNHA", 239.43],
  ["MARILENE B MORAES", 5500.00],
  ["MARLUCI REGINA DE OLIVEIRA 07249604902", 500.00],
  ["METROPOLITAN LIFE SEGUROS E PREVIDENCIA PRIVADA SA", 3894.48],
  ["MLU SCHNEIDER IMOVEIS LTDA", 40000.00],
  ["MUNICIPIO DE BALNEARIO CAMBORIU", 64590.85],
  ["MUNICIPIO DE CAMBORIU", 60.00],
  ["NeN BROKER S LTDA", 10000.00],
  ["NEXIMOB INTELIGENCIA EM NEGOCIOS IMOBILIARIOS LTDA", 73555.39],
  ["OPERADOR NACIONAL DO SISTEMA DE REGISTRO ELETRONICO DE IMOVEIS ( ONR )", 19555.00],
  ["PERSONAL NET TECNOLOGIA DE INFORMACAO LTDA", 42626.00],
  ["PIS", 135.36],
  ["R.M. SERVICOS DE ESCRITORIO LTDA", 28565.00],
  ["REFRIGERACAO GRACZCKI LTDA", 1350.00],
  ["ROHDEN PORTAS E PAINEIS LTDA", 496.24],
  ["RONI DOS SANTOS BENIN", 305000.00],
  ["ROSELI DA LUZ DOS SANTOS", 8357.64],
  ["SAFEWEB SEGURANCA DA INFORMACAO LTDA.", 175.00],
  ["SANTA CATARINA TRIBUNAL DE JUSTICA", 18634.76],
  ["SEBASTIÃO IBA / NEUSA AMORIM IBA", 2016047.93],
  ["SECRETARIA DE FAZENDA FEDERAL", 1330334.58],
  ["SHALLOW CONFECCOES DO VESTUARIO E ACESSORIOS LTDA", 2799.31],
  ["SILVA ADMINISTRADORA HOLDING", 1255000.00],
  ["SIND DOS TRAB NA IND DA CONST E DO MOBI DE BAL CAMBORIU", 779.79],
  ["SINDICATO DA INDUSTRIA DA CONSTRUCAO DE BALNEARIO CAMBORIU", 14477.00],
  ["SOUL COZINHA DE FESTA E EVENTOS LTDA", 4000.00],
  ["SW SOLUCOES EM TATICAS DIGITAIS LTDA", 28688.52],
  ["Tar Cta Garantida Manut", 380.00],
  ["Tar Cta Garantida Manut -", 95.00],
  ["Tar Cta Garantida Manut - R$: 95,00", 665.00],
  ["TAR PAG SAL?R CR?D CONTA - COBRAN?A REFERENTE 05/09/2023", 57.80],
  ["TAR PAG SAL?R CR?D CONTA - COBRAN?A REFERENTE 18/08/2023", 95.20],
  ["TAR PAG SAL?R CR?D CONTA - COBRAN?A REFERENTE 22/08/2023", 74.80],
  ["Tarifa Cta Garantida Manut", 95.00],
  ["Tarifa Renovação Cadastro", 39.00],
  ["TECLOGICA SERVICOS EM INFORMATICA LTDA", 1548.48],
  ["TECNISUL DISTRIBUIDORA DE PRODUTOS TECNICOS PARA CONSTRUCAO LTDA", 245.00],
  ["TERRAL - IMOVEIS LTDA", 335337.00],
  ["TIAGO PASCOTINI SACKIS NEGOCIOS IMOBILIARIOS", 58228.00],
  ["TINTAS DARKA LTDA", 892.00],
  ["VIANA (HELICÓPTERO)", 23800.00],
  ["WALTRICK E ESSER ADVOGADOS ASSOCIADOS", 8000.00],
  ["ZURICH MINAS BRASIL SEGUROS S.A.", 3039.83],
];

const EXCLUDED = ["substitui", "cancelamento", "abatimento", "devolu"];
const isExcl = (n) => EXCLUDED.some(x => (n || "").toLowerCase().includes(x));
const EXCL_HIST = ["rendimento", "aplicação", "aplicacao", "resgate",
  "transferência", "transferencia", "saque", "depósito", "deposito",
  "estorno", "recebimento"];

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = (r.rows[0].data?.data || []).filter(i => i.companyName === COMPANY);
  const bm = await pool.query("SELECT data FROM cached_bank_movements WHERE start_date NOT LIKE 'all:%' ORDER BY cached_at DESC LIMIT 1");
  const bms = (bm.rows[0]?.data?.data || []).filter(b => b.companyName === COMPANY);

  const byCreditor = new Map();
  function add(name, amt, source, info) {
    const k = norm(name);
    if (!byCreditor.has(k)) byCreditor.set(k, { name, total: 0, parts: [] });
    const r = byCreditor.get(k);
    r.total += amt;
    r.parts.push({ amt, source, info });
  }

  for (const item of items) {
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0 || !p.paymentDate || p.paymentDate > PDF_END) continue;
      if (isExcl(p.operationTypeName)) continue;
      add(item.creditorName, p.netAmount, "payment",
        `${p.paymentDate} bill=${item.billId} op=${p.operationTypeName}`);
    }
  }
  for (const b of bms) {
    if (b.bankMovementAmount === 0 || !b.bankMovementDate || b.bankMovementDate > PDF_END) continue;
    const h = (b.bankMovementHistoricName || "").toLowerCase();
    if (EXCL_HIST.some(p => h.includes(p))) continue;
    add(b.creditorName || b.bankMovementHistoricName || "Tarifa Bancária",
      Math.abs(b.bankMovementAmount), "bm",
      `${b.bankMovementDate} historic=${b.bankMovementHistoricName}`);
  }

  const pdfMap = new Map(PDF_SULBRASIL.map(([n, v]) => [norm(n), { name: n, expected: v }]));

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
  console.log(`Cache: ${fmt(cacheTotal)} (${byCreditor.size})`);
  console.log(`PDF:   ${fmt(pdfTotal)} (${pdfMap.size}) — declarado ${fmt(PDF_TOTAL)}`);
  console.log(`Diff:  ${fmt(cacheTotal - pdfTotal)}\n`);

  console.log(`=== ${onlyInCache.length} SÓ NO CACHE ===`);
  onlyInCache.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  for (const c of onlyInCache) {
    console.log(`  ${fmt(c.total).padStart(15)}  ${c.name}`);
    for (const p of c.parts.slice(0, 5)) console.log(`    ${p.source} ${p.info} ${fmt(p.amt)}`);
  }
  console.log(`Total only-in-cache: ${fmt(onlyInCache.reduce((s, c) => s + c.total, 0))}`);

  console.log(`\n=== ${onlyInPdf.length} SÓ NO PDF ===`);
  for (const p of onlyInPdf) console.log(`  ${fmt(p.expected).padStart(15)}  ${p.name}`);
  console.log(`Total only-in-pdf: ${fmt(onlyInPdf.reduce((s, p) => s + p.expected, 0))}`);

  console.log(`\n=== ${diffs.length} VALOR DIFERENTE ===`);
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  for (const d of diffs) {
    console.log(`  cache=${fmt(d.cache)} pdf=${fmt(d.pdf)} diff=${fmt(d.diff)}  ${d.name}`);
    for (const p of d.parts.slice(0, 8)) console.log(`    ${p.source} ${p.info} ${fmt(p.amt)}`);
  }

  await pool.end();
})();
