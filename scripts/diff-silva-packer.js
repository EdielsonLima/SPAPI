// Compara totais per-credor para SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA
// entre o relatório Sienge "Contas Pagas (por Credor) Sintético" (período
// 01/01/2021 a 02/05/2026, R$ 111.823.042,46) e o cache local /outcome.
//
// Reporta diffs ordenadas por magnitude para identificar quais credores
// causam desvio do total.
//
// Uso: node scripts/diff-silva-packer.js

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// PDF Sienge — lista de credores com Líquido > 1000 (filtrado para focar no que importa)
// Extraído manualmente do PDF Contas Pagas (por Credor) Sintético
// Empresa SILVA PACKER, período 01/01/2021 a 02/05/2026, total R$ 111.823.042,46
const PDF = [
  ["LANÇAMENTOS PASSADOS", 71629099.43],
  ["SECRETARIA DE FAZENDA FEDERAL", 4869223.89],
  ["SILVA ADMINISTRADORA HOLDING", 2920474.10],
  ["LANÇAMENTO DE COMPENSAÇÃO", 2500000.00],
  ["JORGE CASECA DOS SANTOS", 2500000.00],
  ["FUNCIONÁRIOS", 2210271.84],
  ["CARLOS HUMBERTO SILVA", 2189528.70],
  ["BANCO BRADESCO S.A.", 1989651.58],
  ["BANCO DO BRASIL SA", 1202267.47],
  ["EMANUEL MARTINS", 850000.00],
  ["DOUGLAS MOREIRA FERREIRA BORGES", 672552.26],
  ["BERTOL ADVOGADOS - DR. MARLON", 659975.00],
  ["POLÍTICA", 612895.71],
  ["JOÃO PAULO PACKER SILVA", 535285.18],
  ["MUNICIPIO DE BALNEARIO CAMBORIU", 502730.04],
  ["UNIMED LITORAL COOPERATIVA DE TRABALHO MEDICO LTDA", 480028.54],
  ["GILBERTO BOING", 356203.28],
  ["FCA FIAT CHRYSLER AUTOMOVEIS BRASIL LTDA", 349990.00],
  ["WALTRICK E ESSER ADVOGADOS ASSOCIADOS", 345186.39],
  ["DT CONSULTORIAS LTDA", 293711.98],
  ["GUSTAVO BARNABE SERVICOS TECNICOS EM ARQUITETURA S/S LTDA", 279097.11],
  ["C3 EQUIPAMENTOS PARA CONSTRUCAO CIVIL LTDA", 268059.28],
  ["CAIXA CARTOES PRE-PAGOS S.A.", 290027.40],
  ["CAIXA ECONOMICA FEDERAL", 263146.75],
  ["M.R. MAFRA E CIA. LTDA", 257961.01],
  ["TERRA BRASIL COMERCIO E TRANSPORTES DE MATERIAIS DE CONSTRUCAO LTDA", 218511.72],
  ["CARLOS HUMBERTO METZNER SILVA", 244773.25],
  ["EXCLUSIVI SERVICOS E REFORMAS EIRELI", 212105.61],
  ["E2 EMPREITEIRA DE MÃO DE OBRA E ENGENHARIA LTDA.", 203663.25],
  ["PERSONAL NET TECNOLOGIA DE INFORMACAO LTDA", 198329.00],
  ["AUTÔNOMO", 176069.48],
  ["FN ENGENHARIA DE ESTRUTURAS LTDA.", 175500.47],
  ["SEGURANÇA", 182122.00],
  ["GREEN LIGHT - ILUMINACAO E ELETRICIDADE EIRELI", 154074.66],
  ["GELSON ANTONIO ANHAIA DE LIMA", 151600.00],
  ["AURA COMPENSADOS LTDA", 150000.00],
  ["VOLKSWAGEN DO BRASIL INDUSTRIA DE VEICULOS AUTOMOTORES LTDA", 109638.30],
  ["AJUSTE DE SALDOS PASSADOS", 147800.00],
  ["MEPE'S INFORMATICA LTDA", 53840.00],
  ["MENON E ELEUTERIO IMOBILIARIA LTDA", 98000.00],
  ["TIM S A", 99899.35],
  ["MAIS MARKETING LTDA", 89608.24],
  ["WALICOSKI CARVALHO ADVOGADOS ASSOCIADOS", 88224.00],
  ["NEWDOC MARKETING DIGITAL EIRELI", 84480.00],
  ["PACOPEDRA PAVIMENTADORA E COMERCIO DE PEDRAS LTDA", 41575.25],
  ["MOVEIS SOB MEDIDA KLEIN LTDA", 112930.00],
  ["VILSON MOTTA", 135000.00],
  ["PROMENAC SERVICOS TURISTICOS LTDA", 102538.80],
  ["DENTECK AR CONDICIONADO LTDA", 102820.91],
  ["ANDRADE MOVEIS E DECORACOES LTDA", 117500.00],
  ["MAC CONSULTORIA IMOBILIARIA EIRELI", 140000.00],
  ["MESTRE DE OBRAS - CHÁCARA", 140630.00],
  ["LOCAÇÃO DE EQUIPAMENTOS CONT. LTDA.", 134606.66],
  ["LANCI INDUSTRIA E COMERCIO DE MOVEIS PLASTICOS EIRELI", 64206.00],
  ["BUZAGLO DANTAS ADVOGADOS", 58323.27],
  ["FREITAS E CAMPAGNHOLO ADVOGADOS ASSOCIADOS", 114139.00],
  ["FEY PROBST E BRUSTOLIN ADVOCACIA", 407220.83],
  ["CONDOMINIO EDIFICIO MARIA EDUARDA", 402343.78],
  ["VILMAR FERREIRA PORTELA", 59219.30],
  ["CASSIANO CESAR DE OLIVEIRA SILVA", 485710.00],
  ["S-EPOXI REVESTIMENTOS LTDA", 124163.74],
  ["VERANI GONÇALVES DA COSTA", 52342.30],
  ["VOLKSWAGEN DO BRASIL INDUSTRIA DE VEICULOS AUTOMOTORES LTDA", 109638.30],
  ["VIANA (HELICÓPTERO)", 60000.00],
  ["CONSTRUTOR DE VENDAS S.A.", 60970.32],
  ["VICELL COMERCIO DE PRODUTOS DE LIMPEZA LTDA", 29724.65],
  ["CONDOMINIO EDIFICIO DON ALVAREZ", 108597.71],
  ["CONDOMINIO EDIFICIO BRASIL CENTRAL", 63979.20],
  ["NELSON PEREIRA SATURNINO LTDA", 41451.16],
  ["FRANCIELI APARECIDA DE QUADROS", 40823.45],
  ["KATIA DENISE MATOS DE LIMA", 36970.16],
  ["CHAIANE KAROLINE CORDEIRO", 38000.00],
  ["CONDOMINIO EDIFICIO DANTE TOMIO", 36733.05],
  ["GAMA LOCADORA DE EQUIPAMENTOS LTDA", 40130.90],
  ["ENKI MOVELEIRA INDUSTRIA E COMERCIO DE PRODUTOS EM MADEIRA LTDA", 136400.00],
  ["WTB PORCELANATOS LTDA", 17577.00],
  ["RICA SERVICOS LTDA", 19071.70],
  ["VENERANDA BENTO XO INSETO", 1138.72],
  ["TAMOYO COMERCIO DE FERRAMENTAS FERRAGENS E ARTIGOS PARA MARCENARIA LTDA", 32137.21],
  ["CESAR PROPAGANDA LTDA", 28820.00],
  ["JESIELI DA SILVA DE SOUZA 08518644909", 160188.72],
  ["FAST SHOP S.A", 6553.18],
  ["MAGAZINE LUIZA S/A", 12102.19],
  ["KOERICH SA COMERCIO E INDUSTRIA", 1847.00],
  ["MERCADOPAGO.COM REPRESENTACOES LTDA.", 10221.09],
  // Subtotal só dos top credores. Outros menores agrupados como "outros"
];
const PDF_TOTAL = 111823042.46;

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache: ${items.length} itens\n`);

  const bm = await pool.query("SELECT data FROM cached_bank_movements ORDER BY cached_at DESC LIMIT 1");
  const bms = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  const EXCLUDED_OP = ["substitui", "cancelamento", "estorno", "abatimento"];
  const COMPANY = "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA";

  // Aggregate cache per-credor (outcome payments)
  const cacheByCredor = new Map();
  for (const item of items) {
    if (item.companyName !== COMPANY) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0) continue;
      if (EXCLUDED_OP.some(x => (p.operationTypeName || "").toLowerCase().includes(x))) continue;
      const credor = (item.creditorName || "(sem credor)").trim();
      cacheByCredor.set(credor, (cacheByCredor.get(credor) || 0) + p.netAmount);
    }
  }
  // Add bank movements as "Movimento Bancário" entries grouped by historic.
  // Same exclusion as the Painel: only checks historic name (no category check).
  const EXCLUDE_HISTORIC_PATTERNS = [
    "rendimento", "aplicação", "aplicacao", "resgate",
    "transferência", "transferencia", "saque", "depósito", "deposito",
    "estorno",
    "recebimento",
  ];
  for (const m of bms) {
    if (m.companyName !== COMPANY) continue;
    if (m.bankMovementAmount === 0) continue;
    const historic = (m.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    const credor = (m.bankMovementHistoricName || "Tarifa Bancária").trim();
    cacheByCredor.set(credor, (cacheByCredor.get(credor) || 0) + Math.abs(m.bankMovementAmount));
  }

  let cacheTotal = 0;
  for (const v of cacheByCredor.values()) cacheTotal += v;
  console.log(`Cache total SILVA PACKER: ${fmt(cacheTotal)}`);
  console.log(`PDF total:               ${fmt(PDF_TOTAL)}`);
  console.log(`Diff (cache - PDF):      ${fmt(cacheTotal - PDF_TOTAL)}\n`);

  // Compare PDF entries to cache
  console.log("Top 30 diffs (|cache - PDF| > 100):");
  console.log("Credor".padEnd(70), "PDF".padStart(18), "Cache".padStart(18), "Diff".padStart(18));
  const diffs = [];
  for (const [credor, pdfVal] of PDF) {
    // Try exact match first, then loose
    let cacheVal = cacheByCredor.get(credor);
    if (cacheVal === undefined) {
      // Try fuzzy: search cache keys containing the first 3 words
      const key = credor.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
      for (const [k, v] of cacheByCredor) {
        if (k.toUpperCase().startsWith(key)) { cacheVal = v; break; }
      }
    }
    if (cacheVal === undefined) cacheVal = 0;
    diffs.push({ credor, pdf: pdfVal, cache: cacheVal, diff: cacheVal - pdfVal });
  }
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  diffs.slice(0, 30).forEach(d => {
    if (Math.abs(d.diff) < 100) return;
    console.log(d.credor.padEnd(70).slice(0, 70), fmt(d.pdf).padStart(18), fmt(d.cache).padStart(18), fmt(d.diff).padStart(18));
  });

  // Show cache-only credors (in cache but not in PDF top list — could be small or missed by my fuzzy match)
  console.log("\nTop 20 credores no cache que NÃO aparecem no PDF top:");
  const pdfNames = new Set(PDF.map(([n]) => n.toUpperCase()));
  const cacheOnly = [];
  for (const [k, v] of cacheByCredor) {
    if (!pdfNames.has(k.toUpperCase()) && v > 5000) {
      cacheOnly.push({ credor: k, val: v });
    }
  }
  cacheOnly.sort((a, b) => b.val - a.val).slice(0, 20).forEach(c => {
    console.log(`  ${c.credor.padEnd(60).slice(0, 60)} ${fmt(c.val).padStart(18)}`);
  });

  await pool.end();
})();
