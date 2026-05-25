/**
 * Sync DRE Excel data to production database.
 * Reads the local Excel file (updated daily by automation),
 * parses all years, and sends per-company data to the production API.
 *
 * Usage:  node scripts/sync-excel-to-production.js
 * Scheduled via Windows Task Scheduler to run daily.
 */

const fs = require("fs");
const path = require("path");

const EXCEL_PATHS = [
  {
    label: "Silva Packer",
    path: "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/SP/DEMOSTRATIVO RESULTADO COMPLETO.xlsx",
  },
  {
    label: "Holding",
    path: "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/HOLDING/DEMOSTRATIVO RESULTADO COMPLETO.xlsx",
  },
];

const PROD_URL = "https://spapi-production.up.railway.app";
const LOCAL_URL = "http://localhost:3000";

const DATA_COLS = [6, 8, 9, 11, 12, 14, 15, 16, 17];

const MONTH_MAP = {
  Janeiro: 0, Fevereiro: 1, "Março": 2, Abril: 3,
  Maio: 4, Junho: 5, Julho: 6, Agosto: 7,
  Setembro: 8, Outubro: 9, Novembro: 10, Dezembro: 11,
};

const GROUP_TO_CATEGORY = {
  "01": "receita_operacional", "02": "custo_variavel", "03": "lucro_bruto",
  "04": "custo_fixo", "05": "lucro_operacional", "06": "despesas_financeiras",
  "07": "despesas_tributarias", "08": "lucro_liquido", "09": "imobilizacoes",
  "10": "retiradas", "11": "saldo", "12": "entradas_nao_operacionais",
  "13": "saidas_nao_operacionais", "14": "variacao_caixa",
};

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function parseExcel(year, excelPath) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const fileBuffer = fs.readFileSync(excelPath);
  const wb = XLSX.read(fileBuffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const companyAccounts = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() !== "Código") continue;

    const colMappings = [];
    for (const col of DATA_COLS) {
      const header = String(row[col]).trim();
      const match = header.match(/^([^/]+)\/(\d{4})$/);
      if (match && match[2] === year) {
        const monthIdx = MONTH_MAP[match[1]];
        if (monthIdx !== undefined) {
          colMappings.push({ colIndex: col, monthIndex: monthIdx });
        }
      }
    }
    if (colMappings.length === 0) continue;

    let companyId = "";
    let companyName = "";
    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
      if (String(data[j][0]).startsWith("Empresa")) {
        const full = String(data[j][4]);
        const m = full.match(/^(\d+)\s*-\s*(.+)/);
        if (m) { companyId = m[1]; companyName = m[2].trim(); }
        else { companyName = full; }
        break;
      }
    }

    let currentDreCategory = "";
    for (let r = i + 1; r < Math.min(i + 300, data.length); r++) {
      const rowData = data[r];
      if (!rowData) break;
      const code = String(rowData[0]).trim();
      if (code === "Código" || code === "Agrupado por") break;

      const groupMatch = code.match(/^(\d{2})\s*$/);
      if (groupMatch) {
        currentDreCategory = GROUP_TO_CATEGORY[groupMatch[1]] || groupMatch[1];
        continue;
      }

      const accountFullName = String(rowData[3]).trim();
      if (!accountFullName) continue;
      const accMatch = accountFullName.match(/^([\d.]+)\s*-\s*(.+)/);
      if (!accMatch) continue;

      const accountId = accMatch[1].trim();
      const accountName = accMatch[2].trim();

      for (const cm of colMappings) {
        const val = parseFloat(String(rowData[cm.colIndex])) || 0;
        if (val !== 0) {
          companyAccounts.push({
            companyId,
            companyName,
            financialPlanId: accountId.replace(/\./g, ""),
            financialPlanName: accountName,
            dreCategory: currentDreCategory,
            amount: val,
            month: String(cm.monthIndex + 1).padStart(2, "0"),
          });
        }
      }
    }
  }

  return companyAccounts;
}

async function syncYear(year, targetUrl, excelPath) {
  const accounts = parseExcel(year, excelPath);
  if (accounts.length === 0) {
    log(`  ${year}: no data`);
    return 0;
  }

  const resp = await fetch(`${targetUrl}/api/dre-supplementary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year, accounts }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    log(`  ${year}: ERROR ${resp.status} - ${text}`);
    return 0;
  }

  const result = await resp.json();
  log(`  ${year}: ${result.message}`);
  return accounts.length;
}

async function main() {
  log("=== DRE Excel Sync Started ===");

  // Determine target URL (production by default, local with --local flag)
  const isLocal = process.argv.includes("--local");
  const targetUrl = isLocal ? LOCAL_URL : PROD_URL;
  log(`Target: ${targetUrl}`);

  // Check target is reachable
  try {
    const check = await fetch(`${targetUrl}/api/dre-supplementary?year=2025`);
    if (!check.ok) throw new Error(`HTTP ${check.status}`);
    log("Target is reachable");
  } catch (e) {
    log(`ERROR: Cannot reach ${targetUrl} - ${e.message}`);
    process.exit(1);
  }

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = 2020; y <= currentYear; y++) years.push(String(y));

  let grandTotal = 0;
  const excelStats = [];

  for (const { label, path: excelPath } of EXCEL_PATHS) {
    if (!fs.existsSync(excelPath)) {
      log(`WARN: Excel "${label}" not found: ${excelPath} — skipping`);
      continue;
    }

    const stat = fs.statSync(excelPath);
    log(`--- ${label} (modified: ${stat.mtime.toISOString()}) ---`);

    let subtotal = 0;
    for (const year of years) {
      subtotal += await syncYear(year, targetUrl, excelPath);
    }
    log(`  ${label}: ${subtotal} records`);
    grandTotal += subtotal;
    excelStats.push({ label, modified: stat.mtime.toISOString(), records: subtotal });
  }

  log(`=== Sync Complete: ${grandTotal} total records across ${years.length} years ===`);

  // Write last sync timestamp for monitoring
  const logDir = path.join(__dirname, "..");
  const logFile = path.join(logDir, "last-excel-sync.json");
  fs.writeFileSync(logFile, JSON.stringify({
    lastSync: new Date().toISOString(),
    target: targetUrl,
    totalRecords: grandTotal,
    years,
    sources: excelStats,
  }, null, 2));
}

main().catch((e) => {
  log(`FATAL ERROR: ${e.message}`);
  process.exit(1);
});
