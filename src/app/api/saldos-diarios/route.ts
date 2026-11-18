// Saldo de cada conta em cada dia do mês, recalculado (gráfico Evolução do Saldo da aba
// Saldos, Edielson 18/11/2026). GET ?month=AAAA-MM | last7 → { dailyBalances, geradoEm },
// no mesmo formato de /api/sienge/bank-accounts?daily=true, que era a foto gravada e
// continua existindo (a aba cai nela se esta rota falhar).
// Regras em src/lib/saldos-diarios.ts; busca e memória em saldos-diarios-servidor.ts.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obterSaldosDiarios } from "@/lib/saldos-diarios-servidor";
import { hojeEmBrasilia } from "@/lib/dias-uteis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const SEM_GUARDAR = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mes = request.nextUrl.searchParams.get("month") || hojeEmBrasilia().slice(0, 7);
  try {
    const dados = await obterSaldosDiarios(mes);
    if (!dados) return NextResponse.json({ error: "Informe o mês como AAAA-MM (até o mês atual) ou last7." }, { status: 400 });
    return NextResponse.json(dados, { headers: SEM_GUARDAR });
  } catch (e) {
    console.error("[saldos-diarios] falhou:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não foi possível recalcular os saldos no Sienge agora." }, { status: 502, headers: SEM_GUARDAR });
  }
}
