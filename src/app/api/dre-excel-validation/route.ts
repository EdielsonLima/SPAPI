import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

export const maxDuration = 30; // allow up to 30s for large Excel parsing

const EXCEL_PATH = "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/SP/DEMOSTRATIVO RESULTADO COMPLETO.xlsx";

// Months in the Jan-Sep section: col indices in the row array
const JAN_SEP_COLS = [6, 8, 9, 11, 12, 14, 15, 16, 17];
const OCT_DEC_COLS = [6, 8, 9];

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

interface CompanyBlock {
  headerRow: number;
  octHeaderRow: number;
  companyId: string;
  companyName: string;
}

function parseExcel(year: string, companyFilter?: string) {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find all company blocks for the requested year
  const blocks: CompanyBlock[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[6]) === `Janeiro/${year}` && String(row[0]) === "Código") {
      // Find company info above this header
      let companyId = "";
      let companyName = "";
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        if (String(data[j][0]).startsWith("Empresa")) {
          const full = String(data[j][4]);
          const match = full.match(/^(\d+)\s*-\s*(.+)/);
          if (match) {
            companyId = match[1];
            companyName = match[2].trim();
          } else {
            companyName = full;
          }
          break;
        }
      }

      // Find the Oct-Dec header for this block
      let octHeaderRow = -1;
      for (let j = i + 200; j < Math.min(i + 350, data.length); j++) {
        if (String(data[j][6]) === `Outubro/${year}` && String(data[j][0]) === "Código") {
          octHeaderRow = j;
          break;
        }
      }

      blocks.push({ headerRow: i, octHeaderRow, companyId, companyName });
    }
  }

  // Apply company filter if provided
  const filteredBlocks = companyFilter
    ? blocks.filter(b => b.companyId === companyFilter)
    : blocks;

  // Accumulate data per account across all matching companies
  const accounts: Record<string, AccountData> = {};
  let currentDreCategory = "";
  let currentDreCategoryLabel = "";

  function processRows(
    startRow: number,
    endRow: number,
    colIndices: number[],
    monthOffset: number,
    companyName: string
  ) {
    for (let i = startRow; i < endRow; i++) {
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

      // Sum values for the relevant months
      for (let ci = 0; ci < colIndices.length; ci++) {
        const val = parseFloat(String(row[colIndices[ci]])) || 0;
        if (val !== 0) {
          accounts[accountId].monthly[monthOffset + ci] += val;
          accounts[accountId].yearTotal += val;
        }
      }

      if (!accounts[accountId].companies.includes(companyName)) {
        accounts[accountId].companies.push(companyName);
      }
    }
  }

  for (const block of filteredBlocks) {
    currentDreCategory = "";
    currentDreCategoryLabel = "";

    // Process Jan-Sep
    processRows(block.headerRow + 1, block.headerRow + 300, JAN_SEP_COLS, 0, block.companyName);

    // Process Oct-Dec
    if (block.octHeaderRow > 0) {
      currentDreCategory = "";
      currentDreCategoryLabel = "";
      processRows(block.octHeaderRow + 1, block.octHeaderRow + 300, OCT_DEC_COLS, 9, block.companyName);
    }
  }

  return {
    year,
    companies: filteredBlocks.map(b => ({ id: b.companyId, name: b.companyName })),
    totalCompanies: filteredBlocks.length,
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
