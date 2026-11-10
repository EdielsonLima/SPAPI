import { NextRequest, NextResponse } from "next/server";
import { sessaoOu401, editorOu403, valorValido } from "@/app/api/tabela-precos/acesso";
import {
  listarUnidadesPainel, criarUnidadePainel, atualizarUnidadesPainel, removerUnidadePainel,
  ErroUnidadePainel, type AlteracaoUnidadePainel, type NovaUnidadePainel,
} from "@/lib/db";
import { ehSituacaoPainel, ehTipoPainel } from "@/lib/unidades-painel";

// Unidades cadastradas só no painel (Painel › Resumo › Estoque): apartamentos e
// salas que não estão no Sienge e contam no estoque. Regra em src/lib/unidades-painel.ts.
//  GET    → { podeEditar, unidades[] }                         (qualquer usuário logado)
//  POST   → { empresa, empreendimento, enterpriseId, unidade, tipo, area, situacao, preco }
//  PUT    → { itens: [{ id, ...campos que mudam }] }  (preco null = sem preço)
//  DELETE → ?id=N  arquiva ("tirar do painel")
// Escrita: administradores e a lista de TABELA_PRECOS_EMAILS. Nada vai para o Sienge.
export const dynamic = "force-dynamic";

const usuarioDe = (s: { nome: string; email: string }) => (s.nome === s.email ? s.email : `${s.nome} <${s.email}>`);
const idValido = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2_147_483_647;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

type Campos = Partial<NovaUnidadePainel>;

// Lê os campos enviados; devolve a mensagem de erro se algum vier inválido.
function lerCampos(b: Record<string, unknown>, exigirTudo: boolean): { campos: Campos } | { erro: string } {
  const c: Campos = {};
  if (exigirTudo || b.empresa !== undefined) {
    c.empresa = texto(b.empresa, 200);
    if (!c.empresa) return { erro: "Informe a empresa." };
  }
  if (exigirTudo || b.empreendimento !== undefined) {
    c.empreendimento = texto(b.empreendimento, 200);
    if (!c.empreendimento) return { erro: "Informe o empreendimento." };
  }
  if (exigirTudo || b.enterpriseId !== undefined) {
    if (b.enterpriseId !== null && b.enterpriseId !== undefined && !idValido(b.enterpriseId)) return { erro: "Empreendimento inválido." };
    c.enterpriseId = (b.enterpriseId as number | null | undefined) ?? null;
  }
  if (exigirTudo || b.unidade !== undefined) {
    c.unidade = texto(b.unidade, 60).toLocaleUpperCase("pt-BR");
    if (!c.unidade) return { erro: "Informe o nome da unidade (ex.: 1702 ou SALA 08)." };
  }
  if (exigirTudo || b.tipo !== undefined) {
    const tipo = b.tipo ?? "Sala comercial";
    if (!ehTipoPainel(tipo)) return { erro: "Tipo inválido." };
    c.tipo = tipo;
  }
  if (exigirTudo || b.area !== undefined) {
    const area = b.area ?? 0;
    if (typeof area !== "number" || !Number.isFinite(area) || area < 0 || area >= 100_000) return { erro: "Área inválida." };
    c.area = Math.round(area * 100) / 100;
  }
  if (exigirTudo || b.situacao !== undefined) {
    const situacao = b.situacao ?? "Disponível";
    if (!ehSituacaoPainel(situacao)) return { erro: "Situação inválida." };
    c.situacao = situacao;
  }
  if (exigirTudo || b.preco !== undefined) {
    if (b.preco !== null && b.preco !== undefined && !valorValido(b.preco)) return { erro: "Preço inválido." };
    c.preco = b.preco == null ? null : Math.round((b.preco as number) * 100) / 100;
  }
  return { campos: c };
}

const falha = (e: unknown, acao: string) => {
  if (e instanceof ErroUnidadePainel) return NextResponse.json({ error: e.message }, { status: 409 });
  console.error(`[unidades-painel] ${acao}`, e);
  return NextResponse.json({ error: "Falha ao gravar a unidade do painel." }, { status: 500 });
};

export async function GET() {
  const s = await sessaoOu401();
  if ("erro" in s) return s.erro;
  try {
    return NextResponse.json({ podeEditar: s.podeEditar, unidades: await listarUnidadesPainel() });
  } catch (e) {
    console.error("[unidades-painel] GET", e);
    return NextResponse.json({ error: "Falha ao ler as unidades do painel." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  const lido = lerCampos(body, true);
  if ("erro" in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });
  try {
    const unidade = await criarUnidadePainel(lido.campos as NovaUnidadePainel, usuarioDe(s));
    return NextResponse.json({ ok: true, unidade }, { status: 201 });
  } catch (e) {
    return falha(e, "POST");
  }
}

export async function PUT(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;
  const body = await request.json().catch(() => null) as { itens?: Record<string, unknown>[] } | null;
  const itens = body?.itens;
  if (!Array.isArray(itens) || itens.length === 0) return NextResponse.json({ error: "Nenhuma unidade informada." }, { status: 400 });
  if (itens.length > 1000) return NextResponse.json({ error: "Unidades demais numa gravação só." }, { status: 400 });

  const alteracoes: AlteracaoUnidadePainel[] = [];
  for (const i of itens) {
    if (!idValido(i.id)) return NextResponse.json({ error: "Unidade do painel sem identificação." }, { status: 400 });
    if (i.empresa !== undefined) return NextResponse.json({ error: "A empresa da unidade não muda." }, { status: 400 });
    const lido = lerCampos(i, false);
    if ("erro" in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });
    alteracoes.push({ id: i.id, ...lido.campos });
  }
  try {
    return NextResponse.json({ ok: true, alteradas: await atualizarUnidadesPainel(alteracoes, usuarioDe(s)) });
  } catch (e) {
    return falha(e, "PUT");
  }
}

export async function DELETE(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!idValido(id)) return NextResponse.json({ error: "Unidade do painel sem identificação." }, { status: 400 });
  try {
    const ok = await removerUnidadePainel(id, usuarioDe(s));
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "A unidade já não estava no painel." }, { status: 404 });
  } catch (e) {
    return falha(e, "DELETE");
  }
}
