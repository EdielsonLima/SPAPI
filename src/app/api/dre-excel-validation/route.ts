import { NextRequest, NextResponse } from "next/server";
import { saveDreExcelSupplementary } from "@/lib/db";
import fs from "fs";

export const maxDuration = 30; // allow up to 30s for large Excel parsing

const EXCEL_PATH = "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/SP/DEMOSTRATIVO RESULTADO COMPLETO.xlsx";

// Data columns in the Excel (columns that contain month headers/values)
const DATA_COLS = [6, 8, 9, 11, 12, 14, 15, 16, 17];

// Month name -> 0-based month index
const MONTH_MAP: Record<string, number> = {
  "Janeiro": 0, "Fevereiro": 1, "Março": 2, "Abril": 3,
  "Maio": 4, "Junho": 5, "Julho": 6, "Agosto": 7,
  "Setembro": 8, "Outubro": 9, "Novembro": 10, "Dezembro": 11,
};

// Map DRE group codes to our internal category keys
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

interface AccountData {
  accountId: string;
  accountName: string;
  dreCategory: string;
  dreCategoryLabel: string;
  monthly: number[];      // 12 months
  yearTotal: number;
  companies: string[];    // which companies contributed
}

// Describes which columns in a header section contain months of the target year
interface ColMonthMapping {
  colIndex: number;
  monthIndex: number; // 0-11
}

interface SectionBlock {
  headerRow: number;
  companyId: string;
  companyName: string;
  colMappings: ColMonthMapping[]; // which cols have months for our target year
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

  // Find ALL header rows and determine which columns contain months of the target year
  const blocks: SectionBlock[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() !== "Código") continue;

    // Parse month headers from data columns
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

    // Skip if no columns match our target year
    if (colMappings.length === 0) continue;

    // Find company info above this header
    let companyId = "";
    let companyName = "";
    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
      if (String(data[j][0]).startsWith("Empresa")) {
        const full = String(data[j][4]);
        const m = full.match(/^(\d+)\s*-\s*(.+)/);
        if (m) {
          companyId = m[1];
          companyName = m[2].trim();
        } else {
          companyName = full;
        }
        break;
      }
    }

    blocks.push({ headerRow: i, companyId, companyName, colMappings });
  }

  // Apply company filter if provided
  const filteredBlocks = companyFilter
    ? blocks.filter(b => b.companyId === companyFilter)
    : blocks;

  // Accumulate data per account across all matching companies
  const accounts: Record<string, AccountData> = {};
  let currentDreCategory = "";
  let currentDreCategoryLabel = "";

  function processSection(block: SectionBlock) {
    const startRow = block.headerRow + 1;
    for (let i = startRow; i < Math.min(startRow + 300, data.length); i++) {
      const row = data[i];
      if (!row) break;
      const code = String(row[0]).trim();
      if (code === "Código" || code === "Agrupado por") break;

      // Check for DRE group header (e.g., "01 ", "02 ")
      const groupMatch = code.match(/^(\d{2})\s*$/);
      if (groupMatch) {
        const groupCode = groupMatch[1];
        currentDreCategory = GROUP_TO_CATEGORY[groupCode] || groupCode;
        currentDreCategoryLabel = String(row[1]).trim();
        continue;
      }

      // Detailed account row (col D / index 3)
      const accountFullName = String(row[3]).trim();
      if (!accountFullName) continue;

      // Parse account ID from name (e.g., "1.01.01.02 - Receita Operacional - Vendas")
      const accMatch = accountFullName.match(/^([\d.]+)\s*-\s*(.+)/);
      if (!accMatch) continue;

      const accountId = accMatch[1].trim();
      const accountName = accMatch[2].trim();

      if (!accounts[accountId]) {
        accounts[accountId] = {
          accountId,
          accountName,
          dreCategory: currentDreCategory,
          dreCategoryLabel: currentDreCategoryLabel,
          monthly: Array(12).fill(0),
          yearTotal: 0,
          companies: [],
        };
      }

      // Sum values for each column that maps to our target year
      for (const cm of block.colMappings) {
        const val = parseFloat(String(row[cm.colIndex])) || 0;
        if (val !== 0) {
          accounts[accountId].monthly[cm.monthIndex] += val;
          accounts[accountId].yearTotal += val;
        }
      }

      if (!accounts[accountId].companies.includes(block.companyName)) {
        accounts[accountId].companies.push(block.companyName);
      }
    }
  }

  for (const block of filteredBlocks) {
    currentDreCategory = "";
    currentDreCategoryLabel = "";
    processSection(block);
  }

  // Get unique companies
  const companyMap = new Map<string, string>();
  for (const block of filteredBlocks) {
    companyMap.set(block.companyId, block.companyName);
  }

  return {
    year,
    companies: Array.from(companyMap.entries()).map(([id, name]) => ({ id, name })),
    totalCompanies: companyMap.size,
    accounts: Object.values(accounts).sort((a, b) => a.accountId.localeCompare(b.accountId)),
    // Summary grouped by DRE category
    categories: Object.values(
      Object.values(accounts).reduce((acc, item) => {
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

// POST: Parse Excel and save supplementary data to database (run locally to sync to DB)
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());

  try {
    const result = parseExcel(year);
    // Save all accounts to the database
    const accounts = result.accounts.map((acc: AccountData) => ({
      financialPlanId: acc.accountId.replace(/\./g, ""),
      financialPlanName: acc.accountName,
      amount: acc.yearTotal,
    }));
    await saveDreExcelSupplementary(year, accounts);
    return NextResponse.json({
      message: `Synced ${accounts.length} accounts for year ${year} to database`,
      accountCount: accounts.length,
    });
  } catch (error) {
    console.error("DRE Excel sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
