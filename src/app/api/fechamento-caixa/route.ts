// Fechamento de Caixa do período (aba do Painel Executivo, Edielson 18/11/2026).
// GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD[&fresco=1]
//  - sem datas: o fechamento do dia anterior (do último dia útil até ontem);
//  - sem `fresco`: o último calculado, se houver (a tela mostra na hora e pede `fresco`);
//  - com `fresco`: busca de novo no Sienge. Se o Sienge falhar e houver um guardado, ele
//    volta com `erroAoAtualizar: true` em vez de a tela ficar vazia.
// As regras ficam em src/lib/fechamento-caixa.ts; a busca, em fechamento-caixa-servidor.ts.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fechamentoGuardado, obterFechamento } from "@/lib/fechamento-caixa-servidor";
import { dataValida, diasNoPeriodo, hojeEmBrasilia, janelaDoFechamento } from "@/lib/dias-uteis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_DIAS = 400;
const SEM_GUARDAR = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const hoje = hojeEmBrasilia();
  const padrao = janelaDoFechamento(hoje);
  const de = params.get("de") ?? padrao.de;
  const ate = params.get("ate") ?? padrao.ate;
  if (!dataValida(de) || !dataValida(ate)) {
    return NextResponse.json({ error: "Informe as datas no formato AAAA-MM-DD." }, { status: 400 });
  }
  if (de > ate) {
    return NextResponse.json({ error: "A data inicial é depois da final." }, { status: 400 });
  }
  if (ate > hoje) {
    return NextResponse.json({ error: "O período não pode passar de hoje." }, { status: 400 });
  }
  if (diasNoPeriodo(de, ate) > MAX_DIAS) {
    return NextResponse.json({ error: `O período é de no máximo ${MAX_DIAS} dias.` }, { status: 400 });
  }

  try {
    const dados = await obterFechamento(de, ate, { fresco: params.get("fresco") === "1" });
    return NextResponse.json(dados, { headers: SEM_GUARDAR });
  } catch (e) {
    console.error("[fechamento-caixa] falhou:", e instanceof Error ? e.message : e);
    const guardado = fechamentoGuardado(de, ate);
    if (guardado) return NextResponse.json({ ...guardado, erroAoAtualizar: true }, { headers: SEM_GUARDAR });
    return NextResponse.json({ error: "Não foi possível buscar o fechamento no Sienge agora." }, { status: 502, headers: SEM_GUARDAR });
  }
}
