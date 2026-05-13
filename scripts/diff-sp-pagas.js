// Análise SP focada em pagamentos futuros + diff via paymentDateMax.
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COMPANY = "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA";
const PDF_END = "2026-05-09";
const PDF_TOTAL = 112729270.93;

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

  let totalAll = 0, totalUntilPdf = 0, countAll = 0, countUntilPdf = 0;
  const futuros = [];

  for (const item of items) {
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    for (const p of (item.payments || [])) {
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      totalAll += p.netAmount;
      countAll++;
      if (p.paymentDate <= PDF_END) {
        totalUntilPdf += p.netAmount;
        countUntilPdf++;
      } else {
        futuros.push({ date: p.paymentDate, creditor: item.creditorName, bill: item.billId, amt: p.netAmount, op: p.operationTypeName });
      }
    }
  }

  for (const b of bms) {
    if (b.bankMovementAmount === 0) continue;
    if (!b.bankMovementDate) continue;
    const historic = (b.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    const amt = Math.abs(b.bankMovementAmount);
    totalAll += amt;
    countAll++;
    if (b.bankMovementDate <= PDF_END) {
      totalUntilPdf += amt;
      countUntilPdf++;
    } else {
      futuros.push({ date: b.bankMovementDate, creditor: b.creditorName || b.bankMovementHistoricName, bill: "BM", amt, op: "Movimento Bancário" });
    }
  }

  console.log(`PDF SP — período até ${PDF_END} = ${fmt(PDF_TOTAL)}`);
  console.log(`Cache TODOS:                ${fmt(totalAll)} (${countAll} parcelas)`);
  console.log(`Cache filtrado <= ${PDF_END}: ${fmt(totalUntilPdf)} (${countUntilPdf} parcelas)`);
  console.log(`Diff filtrado vs PDF: ${fmt(totalUntilPdf - PDF_TOTAL)}\n`);

  console.log(`=== ${futuros.length} pagamentos com paymentDate FUTURO ===`);
  futuros.sort((a, b) => a.date.localeCompare(b.date));
  let totFut = 0;
  for (const f of futuros) {
    console.log(`  ${f.date}  ${fmt(f.amt).padStart(15)}  bill=${f.bill}  ${f.creditor}  op=${f.op}`);
    totFut += f.amt;
  }
  console.log(`Total futuros: ${fmt(totFut)}`);

  await pool.end();
})();
