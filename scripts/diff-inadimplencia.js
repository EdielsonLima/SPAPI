// Compara Total Inadimplência por empresa (Sistema vs Sienge "Contas a
// Receber por Cliente" período passado).
// Mesma fórmula do Painel: effectiveAmount + calcEncargos para items com
// correctedBalanceAmount > 0 e dueDate < hoje.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = "2026-05-08";
const todayDate = new Date(todayStr + "T00:00:00");

function calcEncargos(item) {
  if (!item.dueDate) return 0;
  let ptId = "";
  try {
    const pt = typeof item.paymentTerm === "string" ? JSON.parse(item.paymentTerm) : item.paymentTerm;
    ptId = pt?.id || "";
  } catch { /* ignore */ }
  if (ptId === "PE") return 0;
  if (ptId === "PM" && (!item.indexerName || item.indexerName === "REAL")) return 0;
  const due = new Date(item.dueDate + "T00:00:00");
  let dias = Math.max(0, Math.floor((todayDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
  if (dias <= 0) return 0;
  if (dias > 365) dias = dias - 1;
  const saldo = item.correctedBalanceAmount || 0;
  const multa = saldo * 0.02;
  const juros = (saldo + multa) * 0.01 * (dias / 30);
  return multa + juros;
}

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_income ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache: ${r.rows[0].cached_at}`);

  const isExclCo = n => { const u = (n||"").toUpperCase(); return u.includes("HOLDING") || u.includes("ADMINISTRADORA"); };
  const isExclDoc = t => { const u = (t||"").toUpperCase(); return u.startsWith("PREVISÃO") || u.startsWith("PREVISAO") || u.startsWith("CONTRATO DE LOCA"); };

  const perCompany = new Map();
  let totalSaldo = 0, totalEnc = 0;
  for (const i of items) {
    if (isExclCo(i.companyName)) continue;
    if (isExclDoc(i.documentIdentificationName)) continue;
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate >= todayStr) continue;
    const eff = (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
    if (eff <= 0) continue;
    const enc = calcEncargos(i);
    const co = i.companyName;
    if (!perCompany.has(co)) perCompany.set(co, { saldo: 0, encargos: 0, count: 0 });
    const e = perCompany.get(co);
    e.saldo += eff;
    e.encargos += enc;
    e.count++;
    totalSaldo += eff;
    totalEnc += enc;
  }

  const PDF = {
    "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA": { saldo: 23959.00, encargos: 0, total: 23959.00 },
    "SUL BRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA": { saldo: 220167.32, encargos: 10757.65, total: 230924.97 },
    "SOLAR DI CAPRI": { saldo: 7250.93, encargos: 152.41, total: 7403.34 },
    "PALACIO ELIZABETH": { saldo: 74309.01, encargos: 2193.61, total: 76502.62 },
    "RESIDENCIAL HANNOVER": { saldo: 638092.27, encargos: 118923.57, total: 757015.84 },
    "TESLA RESIDENCIAL": { saldo: 250000.00, encargos: 0, total: 250000.00 },
    "SERENITY": { saldo: 11122.89, encargos: 233.80, total: 11356.69 },
    "ROZZA": { saldo: 574785.22, encargos: 28683.04, total: 603468.26 },
    "DOMUS": { saldo: 52873.83, encargos: 1325.86, total: 54199.69 },
  };
  const PDF_TOTAL = 2014830.41;

  console.log("\nEmpresa".padEnd(50), "Sys Saldo".padStart(15), "Sys Enc".padStart(15), "Sys Total".padStart(18), "PDF Total".padStart(18), "Diff".padStart(15));
  console.log("-".repeat(135));
  let totalSys = 0, totalPdf = 0;
  for (const [co, pdf] of Object.entries(PDF)) {
    const sys = perCompany.get(co) || { saldo: 0, encargos: 0, count: 0 };
    const sysTotal = sys.saldo + sys.encargos;
    const diff = sysTotal - pdf.total;
    totalSys += sysTotal; totalPdf += pdf.total;
    console.log(co.padEnd(50).slice(0, 50),
      fmt(sys.saldo).padStart(15),
      fmt(sys.encargos).padStart(15),
      fmt(sysTotal).padStart(18),
      fmt(pdf.total).padStart(18),
      fmt(diff).padStart(15));
  }
  console.log("-".repeat(135));
  console.log("TOTAL".padEnd(50), "".padStart(15), "".padStart(15),
    fmt(totalSys).padStart(18), fmt(totalPdf).padStart(18), fmt(totalSys - totalPdf).padStart(15));

  // Empresas no sistema mas não no PDF (devem ser zero)
  const pdfCompanies = new Set(Object.keys(PDF));
  console.log("\nEmpresas com saldo no sistema mas SEM no PDF:");
  for (const [co, e] of perCompany.entries()) {
    if (!pdfCompanies.has(co)) {
      console.log(`  ${co}: ${fmt(e.saldo + e.encargos)} (${e.count})`);
    }
  }

  await pool.end();
})();
