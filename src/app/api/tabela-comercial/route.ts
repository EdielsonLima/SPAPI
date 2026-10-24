import { NextRequest, NextResponse } from "next/server";
import { sessaoOu401, editorOu403 } from "@/app/api/tabela-precos/acesso";
import { lerTabelasComerciais, salvarTabelaComercial } from "@/lib/db";
import { normalizarTabelaComercial, validarTabelaComercial } from "@/lib/tabela-comercial";

// Tabela comercial manual por empreendimento (disponíveis + preços do
// diretor comercial). Leitura: logado. Escrita: editores da tabela de preços.
export const dynamic = "force-dynamic";

const CHAVE_OK = /^[a-z0-9-]{1,60}$/;

export async function GET() {
  const s = await sessaoOu401();
  if ("erro" in s) return s.erro;
  try {
    const lista = await lerTabelasComerciais();
    const tabelas: Record<string, unknown> = {};
    for (const t of lista) tabelas[t.chave] = { ...normalizarTabelaComercial(t.dados), atualizadoPor: t.atualizadoPor, atualizadoEm: t.atualizadoEm };
    return NextResponse.json({ podeEditar: s.podeEditar, tabelas });
  } catch (e) {
    console.error("[tabela-comercial] ler", e);
    return NextResponse.json({ error: "Não consegui ler a tabela comercial." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;
  const body = await request.json().catch(() => null) as { chave?: unknown; dados?: unknown } | null;
  const chave = typeof body?.chave === "string" ? body.chave : "";
  if (!CHAVE_OK.test(chave)) return NextResponse.json({ error: "chave inválida" }, { status: 400 });
  if (!body?.dados || typeof body.dados !== "object") return NextResponse.json({ error: "Tabela vazia." }, { status: 400 });
  const dados = normalizarTabelaComercial(body.dados as Record<string, unknown>);
  const erro = validarTabelaComercial(dados);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  try {
    await salvarTabelaComercial(chave, dados, s.nome === s.email ? s.email : `${s.nome} <${s.email}>`);
    return NextResponse.json({ ok: true, dados });
  } catch (e) {
    console.error("[tabela-comercial] salvar", e);
    return NextResponse.json({ error: "Não consegui salvar a tabela comercial." }, { status: 500 });
  }
}
