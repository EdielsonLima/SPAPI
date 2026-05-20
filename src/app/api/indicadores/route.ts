import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getIndicadoresCub,
  getIndicadoresDebit,
  getIndicadoresValorM2,
  type CubIndicadorRow,
  type PctIndicadorRow,
  type ValorM2Row,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_DAYS = 7;

function isStale(iso: string | undefined): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return true;
  const ageMs = Date.now() - t;
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function computeAcumuladoAno(rows: PctIndicadorRow[]): number | null {
  if (rows.length === 0) return null;
  const ultimo = rows[rows.length - 1];
  const ano = ultimo.ano;
  const doAno = rows.filter((r) => r.ano === ano);
  if (doAno.length === 0) return null;
  const produto = doAno.reduce((acc, r) => acc * (1 + r.variacao_pct / 100), 1);
  return (produto - 1) * 100;
}

function buildCubKpis(rows: CubIndicadorRow[]) {
  if (rows.length === 0) {
    return {
      valorAtual: null,
      variacaoMensal: null,
      variacaoAcumuladaAno: null,
      variacaoAnual: null,
      ultimoMesLabel: null,
    };
  }
  const last = rows[rows.length - 1];
  return {
    valorAtual: last.valor_m2,
    variacaoMensal: last.variacao_pct,
    variacaoAcumuladaAno: last.variacao_acumulada_ano_pct,
    variacaoAnual: last.variacao_anual_pct,
    ultimoMesLabel: { ano: last.ano, mes: last.mes },
  };
}

function buildPctKpis(rows: PctIndicadorRow[]) {
  if (rows.length === 0) {
    return {
      mensal: null,
      acumuladoAno: null,
      acumulado12m: null,
      ultimoMesLabel: null,
    };
  }
  const last = rows[rows.length - 1];
  return {
    mensal: last.variacao_pct,
    acumuladoAno: computeAcumuladoAno(rows),
    acumulado12m: last.acumulado_12m_pct,
    ultimoMesLabel: { ano: last.ano, mes: last.mes },
  };
}

function maxAtualizadoEm(rows: { atualizado_em: string }[]): string | null {
  if (rows.length === 0) return null;
  let max = rows[0].atualizado_em;
  for (const r of rows) if (r.atualizado_em > max) max = r.atualizado_em;
  return max;
}

function buildValorM2Kpis(rows: ValorM2Row[]) {
  if (rows.length === 0) {
    return {
      maisCaro: null,
      maiorValorizacao: null,
      totalCidades: 0,
      referencia: null,
    };
  }
  const ordPorValor = [...rows].sort((a, b) => b.valor_m2 - a.valor_m2);
  const maisCaro = ordPorValor[0];
  const comVar = rows.filter((r) => r.variacao_12m_pct !== null);
  const ordPorVar = [...comVar].sort(
    (a, b) => (b.variacao_12m_pct ?? 0) - (a.variacao_12m_pct ?? 0)
  );
  const maiorValorizacao = ordPorVar[0] ?? null;
  return {
    maisCaro: { cidade: maisCaro.cidade, uf: maisCaro.uf, valor: maisCaro.valor_m2 },
    maiorValorizacao: maiorValorizacao
      ? {
          cidade: maiorValorizacao.cidade,
          uf: maiorValorizacao.uf,
          variacao: maiorValorizacao.variacao_12m_pct ?? 0,
        }
      : null,
    totalCidades: rows.length,
    referencia: rows[0].referencia,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [cubRows, cdiRows, ipcaRows, igpmRows, inccRows, valorM2Rows] = await Promise.all([
      getIndicadoresCub(),
      getIndicadoresDebit("cdi"),
      getIndicadoresDebit("ipca"),
      getIndicadoresDebit("igpm"),
      getIndicadoresDebit("incc"),
      getIndicadoresValorM2(),
    ]);

    const cubAtu = maxAtualizadoEm(cubRows);
    const cdiAtu = maxAtualizadoEm(cdiRows);
    const ipcaAtu = maxAtualizadoEm(ipcaRows);
    const igpmAtu = maxAtualizadoEm(igpmRows);
    const inccAtu = maxAtualizadoEm(inccRows);
    const valorM2Atu = maxAtualizadoEm(valorM2Rows);

    return NextResponse.json({
      cub: {
        rows: cubRows,
        kpis: buildCubKpis(cubRows),
        atualizadoEm: cubAtu,
        stale: isStale(cubAtu ?? undefined),
      },
      cdi: {
        rows: cdiRows,
        kpis: buildPctKpis(cdiRows),
        atualizadoEm: cdiAtu,
        stale: isStale(cdiAtu ?? undefined),
      },
      ipca: {
        rows: ipcaRows,
        kpis: buildPctKpis(ipcaRows),
        atualizadoEm: ipcaAtu,
        stale: isStale(ipcaAtu ?? undefined),
      },
      igpm: {
        rows: igpmRows,
        kpis: buildPctKpis(igpmRows),
        atualizadoEm: igpmAtu,
        stale: isStale(igpmAtu ?? undefined),
      },
      incc: {
        rows: inccRows,
        kpis: buildPctKpis(inccRows),
        atualizadoEm: inccAtu,
        stale: isStale(inccAtu ?? undefined),
      },
      valorM2: {
        rows: valorM2Rows,
        kpis: buildValorM2Kpis(valorM2Rows),
        atualizadoEm: valorM2Atu,
        stale: isStale(valorM2Atu ?? undefined),
      },
    });
  } catch (err) {
    console.error("[/api/indicadores] erro:", err);
    return NextResponse.json(
      { error: "Falha ao carregar indicadores" },
      { status: 500 }
    );
  }
}
