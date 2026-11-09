import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedCub, cacheCub, getCubOverride } from "@/lib/db";
import { fetchCubRows, type CubRow } from "@/lib/indicadores/cub-scraper";

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
  /** 2 = série myside + Sinduscon (09/11/2026); cache sem ele é refeito. */
  leitura?: number;
}

const MESES_ROTULO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Mesma série da aba Indicadores (myside + mês novo do Sinduscon-SC), no
// formato que o Orçamento e o Comercial já usavam ("Nov/2026").
function montarResultado(rows: CubRow[]): CubResult {
  if (rows.length === 0) throw new Error("CUB-SC sem linhas");
  const ord = [...rows].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const ultimo = ord[ord.length - 1];
  const rotulo = (r: CubRow) => `${MESES_ROTULO[r.mes - 1]}/${r.ano}`;
  const anoAtual = new Date().getFullYear();
  return {
    currentValue: ultimo.valor_m2,
    currentMonth: rotulo(ultimo),
    monthlyVariation: Math.round(ultimo.variacao_pct * 100) / 100,
    yearlyAccumulated: Math.round(ultimo.variacao_acumulada_ano_pct * 100) / 100,
    monthlyData: ord.filter((r) => r.ano === anoAtual).map((r) => ({ month: rotulo(r), value: r.valor_m2 })),
    source: ultimo.fonte === "sinduscon" ? "sinduscon" : "myside",
    cachedAt: new Date().toISOString(),
    leitura: 2,
  };
}

// O cache vale 7 dias, mas só segura o mês corrente: enquanto o CUB guardado
// for de um mês anterior, busca de novo a cada 6 h (o CUB sai até o dia 5).
function cacheAindaServe(data: Record<string, unknown>, cachedAt: string): boolean {
  if (data.leitura !== 2) return false;
  const hoje = new Date();
  const mesAtual = `${MESES_ROTULO[hoje.getMonth()]}/${hoje.getFullYear()}`;
  if (data.currentMonth === mesAtual) return true;
  const idadeMs = Date.now() - new Date(cachedAt).getTime();
  return Number.isFinite(idadeMs) && idadeMs < 6 * 60 * 60 * 1000;
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
    const cached = await getCachedCub();
    if (!forceRefresh && cached && cacheAindaServe(cached.data as Record<string, unknown>, cached.cachedAt)) {
      return NextResponse.json(cached.data);
    }

    // 3. Busca: série do myside + mês novo do Sinduscon-SC
    let result: CubResult;
    try {
      result = montarResultado(await fetchCubRows());
    } catch (err) {
      // Fonte fora do ar: o CUB guardado (até 7 dias) é melhor que nada.
      if (cached) return NextResponse.json(cached.data);
      throw err;
    }
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
