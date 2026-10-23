import { NextRequest, NextResponse } from "next/server";
import { listarPrecos, gravarPrecos } from "@/lib/db";
import { aplicarReajuste, descreverReajuste, validarReajuste, type Reajuste } from "@/lib/tabela-precos";
import { editorOu403, novoLote } from "../acesso";

// Reajuste em lote. O cálculo é feito AQUI, sobre o valor gravado no banco —
// não sobre o que a tela tinha carregado — para dois reajustes seguidos não
// partirem do mesmo número velho. Unidade sem preço fica de fora.
//  POST { unitIds: number[], reajuste: Reajuste } → { alteradas, semPreco }

export async function POST(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;

  const body = await request.json().catch(() => null) as { unitIds?: number[]; reajuste?: Reajuste } | null;
  const unitIds = Array.isArray(body?.unitIds) ? body!.unitIds.filter(n => Number.isInteger(n) && n > 0) : [];
  if (unitIds.length === 0) return NextResponse.json({ error: "Nenhuma unidade selecionada." }, { status: 400 });
  const erro = validarReajuste(body?.reajuste);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const reajuste = body!.reajuste!;

  try {
    const atuais = new Map((await listarPrecos()).map(p => [p.unitId, p]));
    const alvo = unitIds.map(id => atuais.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const novos = alvo.map(p => ({ ...p, valor: aplicarReajuste(p.valor, reajuste) }));
    const negativo = novos.find(p => !(p.valor > 0));
    if (negativo) {
      return NextResponse.json({ error: `O reajuste deixaria a unidade ${negativo.unidade} sem valor positivo.` }, { status: 400 });
    }
    const alteradas = await gravarPrecos(
      novos.map(p => ({ unitId: p.unitId, enterpriseId: p.enterpriseId, unidade: p.unidade, valor: p.valor })),
      { lote: novoLote(), tipo: reajuste.tipo, descricao: descreverReajuste(reajuste), usuario: s.nome === s.email ? s.email : `${s.nome} <${s.email}>` },
    );
    return NextResponse.json({ ok: true, alteradas, semPreco: unitIds.length - alvo.length });
  } catch (e) {
    console.error("[tabela-precos] reajuste", e);
    return NextResponse.json({ error: "Falha ao aplicar o reajuste." }, { status: 500 });
  }
}
