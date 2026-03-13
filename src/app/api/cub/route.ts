import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedCub, cacheCub } from "@/lib/db";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface CubMonthData {
  month: string;
  value: number;
}

interface CubResult {
  currentValue: number;
  currentMonth: string;
  monthlyVariation: number;
  yearlyAccumulated: number;
  monthlyData: CubMonthData[];
  cachedAt: string;
}

function parseHtmlTable(html: string): Map<number, Map<number, number>> {
  // Parse CUB values from SENGE-SC HTML
  // Structure: year sections with monthly values like "Janeiro R$ 3.019,26"
  const yearData = new Map<number, Map<number, number>>();

  // Match year headers and their content
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 1; year <= currentYear; year++) {
    const months = new Map<number, number>();

    for (let m = 0; m < 12; m++) {
      // Match patterns like "Janeiro R$ 3.019,26" or "Janeiro</td><td>R$ 3.019,26"
      const monthName = MONTH_NAMES[m];
      // Try multiple patterns
      const patterns = [
        new RegExp(`${monthName}[^R]*R\\$\\s*([\\d.,]+)`, "i"),
        new RegExp(`${monthName}[\\s\\S]{0,100}?R\\$\\s*([\\d.,]+)`, "i"),
      ];

      // Search in the section for this year
      const yearPattern = new RegExp(`(?:>|^)\\s*${year}[\\s\\S]*?(?=${year + 1}|$)`, "i");
      const yearMatch = html.match(yearPattern);
      const searchText = yearMatch ? yearMatch[0] : "";

      for (const pattern of patterns) {
        const match = searchText.match(pattern);
        if (match) {
          // Parse "3.019,26" → 3019.26
          const valueStr = match[1].replace(/\./g, "").replace(",", ".");
          const value = parseFloat(valueStr);
          if (!isNaN(value) && value > 100) { // CUB is always > 100
            months.set(m, value);
            break;
          }
        }
      }
    }

    if (months.size > 0) {
      yearData.set(year, months);
    }
  }

  return yearData;
}

function calculateCubData(yearData: Map<number, Map<number, number>>): CubResult {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const currentYearData = yearData.get(currentYear);
  const prevYearData = yearData.get(prevYear);

  // Find the latest month with data
  let latestMonth = -1;
  let latestValue = 0;

  if (currentYearData) {
    for (let m = 11; m >= 0; m--) {
      if (currentYearData.has(m)) {
        latestMonth = m;
        latestValue = currentYearData.get(m)!;
        break;
      }
    }
  }

  // Previous month value (for monthly variation)
  let prevMonthValue = 0;
  if (latestMonth > 0 && currentYearData?.has(latestMonth - 1)) {
    prevMonthValue = currentYearData.get(latestMonth - 1)!;
  } else if (latestMonth === 0 && prevYearData?.has(11)) {
    prevMonthValue = prevYearData.get(11)!;
  }

  // December of previous year (for yearly accumulated)
  const decPrevYear = prevYearData?.get(11) || 0;

  // Calculate variations
  const monthlyVariation = prevMonthValue > 0
    ? ((latestValue - prevMonthValue) / prevMonthValue) * 100
    : 0;

  const yearlyAccumulated = decPrevYear > 0
    ? ((latestValue - decPrevYear) / decPrevYear) * 100
    : 0;

  // Build monthly data array
  const monthlyData: CubMonthData[] = [];
  if (currentYearData) {
    for (let m = 0; m <= 11; m++) {
      if (currentYearData.has(m)) {
        monthlyData.push({
          month: `${MONTH_SHORT[m]}/${currentYear}`,
          value: currentYearData.get(m)!,
        });
      }
    }
  }

  return {
    currentValue: latestValue,
    currentMonth: latestMonth >= 0 ? `${MONTH_SHORT[latestMonth]}/${currentYear}` : "-",
    monthlyVariation: Math.round(monthlyVariation * 100) / 100,
    yearlyAccumulated: Math.round(yearlyAccumulated * 100) / 100,
    monthlyData,
    cachedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check cache first
    const cached = await getCachedCub();
    if (cached) {
      return NextResponse.json(cached.data);
    }

    // Fetch from SENGE-SC
    const response = await fetch("https://www.senge-sc.org.br/tabela-do-cub/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`SENGE-SC fetch error: ${response.status}`);
    }

    const html = await response.text();
    const yearData = parseHtmlTable(html);

    if (yearData.size === 0) {
      throw new Error("Could not parse CUB data from SENGE-SC");
    }

    const result = calculateCubData(yearData);
    await cacheCub(result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching CUB data:", error);
    return NextResponse.json(
      { error: "Failed to fetch CUB data" },
      { status: 500 }
    );
  }
}
