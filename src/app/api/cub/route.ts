import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedCub, cacheCub, getCubOverride } from "@/lib/db";

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
  source: string;
  cachedAt: string;
}

function parseMysidePage(html: string): CubResult {
  // myside.com.br table has columns: Mês/Ano | Valor CUB SC (R$/m²) | Mês (%) | Ano (%) | 12 meses (%)
  // Rows like: Mar/26 | 3.028,45 | 0,30% | 0,65% | 4,15%

  const rows: { month: string; value: number; monthPct: number; yearPct: number }[] = [];

  // Strip HTML tags to get clean text, then parse the table data
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

  // Match rows: Mes/YY  3.028,45  0,30%  0,65%  4,15%
  const rowPattern = /([A-Za-zçÇ]{3})\/(\d{2})\s+(\d[\d.]*,\d{2})\s+(-?\d+,\d{2})%\s+(-?\d+,\d{2})%\s+(-?\d+,\d{2})%/g;

  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    const monthStr = match[1];
    const yearStr = match[2];
    const valueStr = match[3].replace(/\./g, "").replace(",", ".");
    const monthPctStr = match[4].replace(",", ".");
    const yearPctStr = match[5].replace(",", ".");

    const value = parseFloat(valueStr);
    const monthPct = parseFloat(monthPctStr);
    const yearPct = parseFloat(yearPctStr);

    if (!isNaN(value) && value > 100) {
      rows.push({
        month: `${monthStr}/20${yearStr}`,
        value,
        monthPct,
        yearPct,
      });
    }
  }

  if (rows.length === 0) {
    throw new Error("Could not parse CUB data from myside.com.br");
  }

  // First row is the most recent month
  const latest = rows[0];
  const currentYear = new Date().getFullYear();

  // Build monthlyData for current year only
  const monthlyData: CubMonthData[] = rows
    .filter((r) => r.month.endsWith(`/${currentYear}`))
    .reverse()
    .map((r) => ({ month: r.month, value: r.value }));

  return {
    currentValue: latest.value,
    currentMonth: latest.month,
    monthlyVariation: Math.round(latest.monthPct * 100) / 100,
    yearlyAccumulated: Math.round(latest.yearPct * 100) / 100,
    monthlyData,
    source: "myside",
    cachedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("forceRefresh") === "true";

    // 1. Check manual override first (always takes priority)
    const override = await getCubOverride();
    if (override) {
      return NextResponse.json({
        currentValue: override.value,
        currentMonth: override.monthLabel,
        monthlyVariation: override.monthlyVariation,
        yearlyAccumulated: override.yearlyAccumulated,
        monthlyData: [],
        source: "manual",
        cachedAt: override.updatedAt,
      });
    }

    // 2. Check cache (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = await getCachedCub();
      if (cached) {
        const d = cached.data as Record<string, unknown>;
        if (d.source === "myside") {
          return NextResponse.json(cached.data);
        }
      }
    }

    // 3. Fetch from myside.com.br
    const response = await fetch("https://myside.com.br/guia-balneario-camboriu/cub-sc", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`myside.com.br fetch error: ${response.status}`);
    }

    const html = await response.text();
    const result = parseMysidePage(html);
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
