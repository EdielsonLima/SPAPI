import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedCub, cacheCub, getCubOverride, getIndicadoresCub } from "@/lib/db";
import { fetchCubRows, type CubRow } from "@/lib/indicadores/cub-scraper";
import { lerRotuloMes, linhaManual, manualMaisNovo, rotuloMes, type AnoMes } from "@/lib/indicadores/cub-manual";

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

// CUB lançado à mão: só vale para um mês mais novo que o último automático
// (o site ainda não publicou). Variações calculadas pela série (cub-manual.ts).
async function comCubManual(auto: CubResult | null): Promise<CubResult | null> {
  const override = await getCubOverride().catch(() => null);
  if (!override) return null;
  const serie = await getIndicadoresCub().catch(() => []);
  const linha = linhaManual(serie, override);
  if (!linha) return null;
  const doAuto = auto ? lerRotuloMes(auto.currentMonth) : null;
  const daSerie: AnoMes | null = serie.length ? serie[serie.length - 1] : null;
  const ultimoAuto = [doAuto, daSerie]
    .filter((x): x is AnoMes => !!x)
    .sort((a, b) => b.ano - a.ano || b.mes - a.mes)[0];
  if (!manualMaisNovo(linha, ultimoAuto)) return null;
  const rotulo = rotuloMes(linha.ano, linha.mes);
  const anoAtual = new Date().getFullYear();
  const meses = (auto?.monthlyData ?? []).filter((m) => m.month !== rotulo);
  return {
    currentValue: linha.valor_m2,
    currentMonth: rotulo,
    monthlyVariation: linha.variacao_pct ?? 0,
    yearlyAccumulated: linha.variacao_acumulada_ano_pct ?? 0,
    monthlyData: linha.ano === anoAtual ? [...meses, { month: rotulo, value: linha.valor_m2 }] : meses,
    source: "manual",
    cachedAt: new Date(override.updatedAt).toISOString(),
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

    // 1. Automático: cache (se ainda serve) ou busca (myside + Sinduscon-SC).
    let auto: CubResult | null = null;
    const cached = await getCachedCub();
    if (!forceRefresh && cached && cacheAindaServe(cached.data as Record<string, unknown>, cached.cachedAt)) {
      auto = cached.data as CubResult;
    } else {
      try {
        auto = montarResultado(await fetchCubRows());
        await cacheCub(auto);
      } catch (err) {
        // Fonte fora do ar: o CUB guardado é melhor que nada.
        console.error("CUB-SC automático indisponível:", err);
        auto = cached ? (cached.data as CubResult) : null;
      }
    }

    // 2. Manual só tapa o mês que o site ainda não publicou (Edielson, 09/11/2026).
    const manual = await comCubManual(auto);
    if (manual) return NextResponse.json(manual);
    if (auto) return NextResponse.json(auto);
    throw new Error("CUB-SC indisponível e sem valor manual");
  } catch (error) {
    console.error("Error fetching CUB data:", error);
    return NextResponse.json(
      { error: "Failed to fetch CUB data" },
      { status: 500 }
    );
  }
}
