import { NextRequest, NextResponse } from "next/server";
import { saveDreExcelData } from "@/lib/db";
import fs from "fs";

export const maxDuration = 30;

const EXCEL_PATH = "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/SP/DEMOSTRATIVO RESULTADO COMPLETO.xlsx";

const DATA_COLS = [6, 8, 9, 11, 12, 14, 15, 16, 17];

const MONTH_MAP: Record<string, number> = {
  "Janeiro": 0, "Fevereiro": 1, "Março": 2, "Abril": 3,
  "Maio": 4, "Junho": 5, "Julho": 6, "Agosto": 7,
  "Setembro": 8, "Outubro": 9, "Novembro": 10, "Dezembro": 11,
};

const GROUP_TO_CATEGORY: Record<string, string> = {
  "01": "receita_operacional",
  "02": "custo_variavel",
  "03": "lucro_bruto",
  "04": "custo_fixo",
  "05": "lucro_operacional",
  "06": "despesas_financeiras",
  "07": "despesas_tributarias",
  "08": "lucro_liquido",
  "09": "imobilizacoes",
  "10": "retiradas",
  "11": "saldo",
  "12": "entradas_nao_operacionais",
  "13": "saidas_nao_operacionais",
  "14": "variacao_caixa",
};

interface ColMonthMapping {
  colIndex: number;
  monthIndex: number;
}

interface AccountData {
  accountId: string;
  accountName: string;
  dreCategory: string;
  dreCategoryLabel: string;
  yearTotal: number;
}

// Per-company account data for DB storage
interface CompanyAccountData {
  companyId: string;
  companyName: string;
  accountId: string;
  accountName: string;
  dreCategory: string;
  amount: number;
}

function parseExcel(year: string, companyFilter?: string) {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const fileBuffer = fs.readFileSync(EXCEL_PATH);
  const wb = XLSX.read(fileBuffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Track per-company account data
  const companyAccounts: CompanyAccountData[] = [];
  // Also track aggregated totals for the response
  const aggregated: Record<string, AccountData> = {};

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() !== "Código") continue;

    // Parse month headers
    const colMappings: ColMonthMapping[] = [];
    for (const col of DATA_COLS) {
      const header = String(row[col]).trim();
      const match = header.match(/^(\w+)\/(\d{4})$/);
      if (match && match[2] === year) {
        const monthIdx = MONTH_MAP[match[1]];
        if (monthIdx !== undefined) {
          colMappings.push({ colIndex: col, monthIndex: monthIdx });
        }
      }
    }
    if (colMappings.length === 0) continue;

    // Find company info
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

    if (companyFilter && companyId !== companyFilter) continue;

    // Process rows
    let currentDreCategory = "";
    let currentDreCategoryLabel = "";

    for (let r = i + 1; r < Math.min(i + 300, data.length); r++) {
      const rowData = data[r];
      if (!rowData) break;
      const code = String(rowData[0]).trim();
      if (code === "Código" || code === "Agrupado por") break;

      const groupMatch = code.match(/^(\d{2})\s*$/);
      if (groupMatch) {
        currentDreCategory = GROUP_TO_CATEGORY[groupMatch[1]] || groupMatch[1];
        currentDreCategoryLabel = String(rowData[1]).trim();
        continue;
      }

      const accountFullName = String(rowData[3]).trim();
      if (!accountFullName) continue;
      const accMatch = accountFullName.match(/^([\d.]+)\s*-\s*(.+)/);
      if (!accMatch) continue;

      const accountId = accMatch[1].trim();
      const accountName = accMatch[2].trim();

      let rowTotal = 0;
      for (const cm of colMappings) {
        const val = parseFloat(String(rowData[cm.colIndex])) || 0;
        rowTotal += val;
      }

      if (rowTotal !== 0) {
        companyAccounts.push({
          companyId,
          companyName,
          accountId,
          accountName,
          dreCategory: currentDreCategory,
          amount: rowTotal,
        });

        if (!aggregated[accountId]) {
          aggregated[accountId] = {
            accountId, accountName,
            dreCategory: currentDreCategory,
            dreCategoryLabel: currentDreCategoryLabel,
            yearTotal: 0,
          };
        }
        aggregated[accountId].yearTotal += rowTotal;
      }
    }
  }

  return {
    year,
    accounts: Object.values(aggregated).sort((a, b) => a.accountId.localeCompare(b.accountId)),
    companyAccounts,
    categories: Object.values(
      Object.values(aggregated).reduce((acc, item) => {
        const cat = item.dreCategory;
        if (!acc[cat]) {
          acc[cat] = { category: cat, label: item.dreCategoryLabel, total: 0, accountCount: 0 };
        }
        acc[cat].total += item.yearTotal;
        acc[cat].accountCount++;
        return acc;
      }, {} as Record<string, { category: string; label: string; total: number; accountCount: number }>)
    ),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());
  const company = searchParams.get("company") || undefined;

  try {
    const result = parseExcel(year, company);
    return NextResponse.json(result);
  } catch (error) {
    console.error("DRE Excel validation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: Parse Excel and save per-company data to database
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());

  try {
    const result = parseExcel(year);
    const dbAccounts = result.companyAccounts.map(ca => ({
      companyId: ca.companyId,
      companyName: ca.companyName,
      financialPlanId: ca.accountId.replace(/\./g, ""),
      financialPlanName: ca.accountName,
      dreCategory: ca.dreCategory,
      amount: ca.amount,
    }));
    await saveDreExcelData(year, dbAccounts);
    return NextResponse.json({
      message: `Synced ${dbAccounts.length} company-account records for year ${year}`,
      recordCount: dbAccounts.length,
    });
  } catch (error) {
    console.error("DRE Excel sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
