import { NextResponse } from "next/server";
import { saveDreExcelData } from "@/lib/db";
import fs from "fs";

export const maxDuration = 300;

// Equivalente ao scripts/sync-excel-to-production.js mas exposto como endpoint
// pra ser chamado pelo botão "Sync DRE" do Painel. Só funciona quando o
// servidor tem acesso ao Excel local — em production (Railway), o arquivo
// não existe e o endpoint retorna 404 com instrução pra rodar o script no
// terminal local.

// Cada Excel é autoritativo só para o seu escopo. Ambos contêm todas as empresas,
// mas com valores diferentes — sem o filtro, o segundo a sincronizar sobrescreve o
// primeiro (bug 2026-07-07: Holding zerava o SP).
const isHoldingCompany = (name: string) => /HOLDING|ADMINISTRADORA/i.test(name || "");
const EXCEL_PATHS = [
  {
    label: "Silva Packer",
    path: "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/SP/DEMOSTRATIVO RESULTADO COMPLETO.xlsx",
    keep: (name: string) => !isHoldingCompany(name),
  },
  {
    label: "Holding",
    path: "C:/Users/Usuario/OneDrive - DTCONSULTORIAS/SILVA PACKER/DRE/HOLDING/DEMOSTRATIVO RESULTADO HOLDING.xlsx",
    keep: (name: string) => isHoldingCompany(name),
  },
];

const DATA_COLS = [6, 8, 9, 11, 12, 14, 15, 16, 17];

const MONTH_MAP: Record<string, number> = {
  Janeiro: 0, Fevereiro: 1, "Março": 2, Abril: 3,
  Maio: 4, Junho: 5, Julho: 6, Agosto: 7,
  Setembro: 8, Outubro: 9, Novembro: 10, Dezembro: 11,
};

const GROUP_TO_CATEGORY: Record<string, string> = {
  "01": "receita_operacional", "02": "custo_variavel", "03": "lucro_bruto",
  "04": "custo_fixo", "05": "lucro_operacional", "06": "despesas_financeiras",
  "07": "despesas_tributarias", "08": "lucro_liquido", "09": "imobilizacoes",
  "10": "retiradas", "11": "saldo", "12": "entradas_nao_operacionais",
  "13": "saidas_nao_operacionais", "14": "variacao_caixa",
};

interface CompanyAccount {
  companyId: string;
  companyName: string;
  financialPlanId: string;
  financialPlanName: string;
  dreCategory: string;
  amount: number;
  month: string;
}

function parseExcelForYear(data: unknown[][], year: string): CompanyAccount[] {
  const companyAccounts: CompanyAccount[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() !== "Código") continue;

    const colMappings: { colIndex: number; monthIndex: number }[] = [];
    for (const col of DATA_COLS) {
      const header = String(row[col]).trim();
      const match = header.match(/^([^/]+)\/(\d{4})$/);
      if (match && match[2] === year) {
        const monthIdx = MONTH_MAP[match[1]];
        if (monthIdx !== undefined) colMappings.push({ colIndex: col, monthIndex: monthIdx });
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

export async function POST() {
  try {
    const activePaths = EXCEL_PATHS.filter(ep => fs.existsSync(ep.path));
    if (activePaths.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhum arquivo Excel encontrado no servidor",
          detail: `Procurado em:\n- Silva Packer: ${EXCEL_PATHS[0].path}\n- Holding: ${EXCEL_PATHS[1].path}\n\nO servidor de produção não tem acesso ao arquivo local — rode 'node scripts/sync-excel-to-production.js' no terminal da máquina onde o Excel está.`,
        },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const currentYear = new Date().getFullYear();
    const years: string[] = [];
    for (let y = 2020; y <= currentYear; y++) years.push(String(y));

    const perYear: Record<string, number> = {};
    let totalRecords = 0;
    let latestModifiedTime = new Date(0);

    for (const { path: excelPath, keep } of activePaths) {
      const stat = fs.statSync(excelPath);
      if (stat.mtime > latestModifiedTime) {
        latestModifiedTime = stat.mtime;
      }

      const fileBuffer = fs.readFileSync(excelPath);
      const wb = XLSX.read(fileBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      for (const year of years) {
        let accounts = parseExcelForYear(data, year);
        if (keep) accounts = accounts.filter(a => keep(a.companyName));
        if (accounts.length === 0) continue;

        await saveDreExcelData(year, accounts);
        perYear[year] = (perYear[year] || 0) + accounts.length;
        totalRecords += accounts.length;
      }
    }

    return NextResponse.json({
      success: true,
      excelModified: latestModifiedTime.toISOString(),
      syncedAt: new Date().toISOString(),
      totalRecords,
      perYear,
      years,
      syncedSources: activePaths.map(ap => ap.label),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-excel-dre error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
