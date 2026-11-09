import { NextRequest, NextResponse } from "next/server";
import { sessaoOu401, editorOu403 } from "@/app/api/tabela-precos/acesso";
import { listarSituacoesManuais, gravarSituacoesManuais, type AlteracaoSituacao } from "@/lib/db";
import { ehSituacaoManual } from "@/lib/estoque-resumo";

// Situação manual das unidades (Painel › Resumo › Estoque): "Disponível",
// "Reservado" ou "Vendido", por cima do Sienge e da tabela comercial.
//  GET → { podeEditar, situacoes[] }           (qualquer usuário logado)
//  PUT → { itens: [{ unitId, enterpriseId, unidade, situacao | null }] }
//        situacao null volta ao automático. Só quem edita a tabela de preços.
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await sessaoOu401();
  if ("erro" in s) return s.erro;
  try {
    return NextResponse.json({ podeEditar: s.podeEditar, situacoes: await listarSituacoesManuais() });
  } catch (e) {
    console.error("[situacao-unidades] GET", e);
    return NextResponse.json({ error: "Falha ao ler a situação das unidades." }, { status: 500 });
  }
}

const idValido = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2_147_483_647;

export async function PUT(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;

  const body = await request.json().catch(() => null) as {
    itens?: { unitId?: unknown; enterpriseId?: unknown; unidade?: unknown; situacao?: unknown }[];
  } | null;
  const itens = body?.itens;
  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "Nenhuma unidade informada." }, { status: 400 });
  }
  if (itens.length > 5000) {
    return NextResponse.json({ error: "Unidades demais numa gravação só." }, { status: 400 });
  }

  const alteracoes: AlteracaoSituacao[] = [];
  for (const i of itens) {
    if (!idValido(i.unitId) || !idValido(i.enterpriseId)) {
      return NextResponse.json({ error: "Unidade sem identificação do Sienge." }, { status: 400 });
    }
    const unidade = typeof i.unidade === "string" ? i.unidade.slice(0, 120) : "";
    if (i.situacao !== null && !ehSituacaoManual(i.situacao)) {
      return NextResponse.json({ error: `Situação inválida para a unidade ${unidade || i.unitId}.` }, { status: 400 });
    }
    alteracoes.push({ unitId: i.unitId, enterpriseId: i.enterpriseId, unidade, situacao: i.situacao });
  }

  try {
    const alteradas = await gravarSituacoesManuais(alteracoes, s.nome === s.email ? s.email : `${s.nome} <${s.email}>`);
    return NextResponse.json({ ok: true, alteradas });
  } catch (e) {
    console.error("[situacao-unidades] PUT", e);
    return NextResponse.json({ error: "Falha ao gravar a situação das unidades." }, { status: 500 });
  }
}
