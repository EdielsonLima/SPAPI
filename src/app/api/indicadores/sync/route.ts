import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchCubRows } from "@/lib/indicadores/cub-scraper";
import { fetchDebitRows, type IndicadorDebitSlug } from "@/lib/indicadores/debit-scraper";
import { fetchValorM2Rows } from "@/lib/indicadores/valor-m2-scraper";
import {
  upsertIndicadoresCub,
  upsertIndicadoresDebit,
  upsertIndicadoresValorM2,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function labelMesAno(ano: number, mes: number) {
  return `${MESES[mes - 1]}/${String(ano).slice(-2)}`;
}

async function syncCub() {
  const rows = await fetchCubRows();
  if (rows.length === 0) throw new Error("Scraper CUB retornou 0 linhas");
  const inseridos = await upsertIndicadoresCub(rows);
  const ultimo = rows.reduce((a, b) =>
    a.ano > b.ano || (a.ano === b.ano && a.mes > b.mes) ? a : b
  );
  return { inseridos, ultimo: labelMesAno(ultimo.ano, ultimo.mes) };
}

async function syncDebit(slug: IndicadorDebitSlug) {
  const rows = await fetchDebitRows(slug);
  if (rows.length === 0) throw new Error(`Scraper ${slug} retornou 0 linhas`);
  // ordena por (ano, mes) crescente e pega últimos 24
  const sorted = [...rows].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const last24 = sorted.slice(-24);
  const inseridos = await upsertIndicadoresDebit(slug, last24);
  const ultimo = last24[last24.length - 1];
  return { inseridos, ultimo: labelMesAno(ultimo.ano, ultimo.mes) };
}

async function syncValorM2() {
  const { rows, referencia } = await fetchValorM2Rows();
  if (rows.length === 0) throw new Error("Scraper Valor m² retornou 0 linhas");
  const inseridos = await upsertIndicadoresValorM2(rows);
  return { inseridos, ultimo: referencia ?? "—" };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { indicador?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const indicador = (body.indicador ?? "").toLowerCase();

  try {
    if (indicador === "cub") {
      const r = await syncCub();
      return NextResponse.json({ ok: true, ...r });
    }
    if (indicador === "cdi" || indicador === "ipca" || indicador === "igpm") {
      const r = await syncDebit(indicador);
      return NextResponse.json({ ok: true, ...r });
    }
    if (indicador === "valorm2") {
      const r = await syncValorM2();
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json(
      { ok: false, error: `Indicador desconhecido: ${indicador}` },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha ao sincronizar";
    console.error(`[/api/indicadores/sync] ${indicador}:`, err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
