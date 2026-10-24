import { NextRequest, NextResponse } from "next/server";
import { sessaoOu401, editorOu403 } from "@/app/api/tabela-precos/acesso";
import { lerCondicoesPagamento, salvarCondicoesPagamento } from "@/lib/db";
import { CONDICOES_PADRAO, normalizarCondicoes, validarCondicoes } from "@/lib/condicoes-pagamento";

// Condições de pagamento por empreendimento (modal "Condições" do Quadro
// Espelho 3D). Leitura: qualquer usuário logado. Escrita: quem edita a tabela
// de preços (TABELA_PRECOS_EMAILS), igual à tabela.
export const dynamic = "force-dynamic";

const CHAVE_OK = /^[a-z0-9-]{1,60}$/;

export async function GET(request: NextRequest) {
  const s = await sessaoOu401();
  if ("erro" in s) return s.erro;
  const chave = new URL(request.url).searchParams.get("chave") || "";
  if (!CHAVE_OK.test(chave)) return NextResponse.json({ error: "chave inválida" }, { status: 400 });
  try {
    const salvas = await lerCondicoesPagamento(chave);
    return NextResponse.json({
      podeEditar: s.podeEditar,
      cadastrada: !!salvas,
      condicoes: salvas ? normalizarCondicoes(salvas.dados) : CONDICOES_PADRAO,
      atualizadoPor: salvas?.atualizadoPor ?? null,
      atualizadoEm: salvas?.atualizadoEm ?? null,
    });
  } catch (e) {
    console.error("[condicoes-pagamento] ler", e);
    return NextResponse.json({ error: "Não consegui ler as condições." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;
  const body = await request.json().catch(() => null) as { chave?: unknown; condicoes?: unknown } | null;
  const chave = typeof body?.chave === "string" ? body.chave : "";
  if (!CHAVE_OK.test(chave)) return NextResponse.json({ error: "chave inválida" }, { status: 400 });
  if (!body?.condicoes || typeof body.condicoes !== "object") return NextResponse.json({ error: "Condições vazias." }, { status: 400 });
  const cond = normalizarCondicoes(body.condicoes as Record<string, unknown>);
  const erro = validarCondicoes(cond);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  try {
    await salvarCondicoesPagamento(chave, cond, s.email);
    return NextResponse.json({ ok: true, condicoes: cond });
  } catch (e) {
    console.error("[condicoes-pagamento] salvar", e);
    return NextResponse.json({ error: "Não consegui salvar as condições." }, { status: 500 });
  }
}
