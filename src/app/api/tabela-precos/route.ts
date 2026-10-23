import { NextRequest, NextResponse } from "next/server";
import { listarPrecos, gravarPrecos, type AlteracaoPreco } from "@/lib/db";
import { arredondar } from "@/lib/tabela-precos";
import { sessaoOu401, editorOu403, novoLote, valorValido } from "./acesso";

// Tabela de preços das unidades (Comercial).
//  GET → { podeEditar, precos[] }
//  PUT → grava valores digitados ou preenchidos por R$/m². valor null remove.

export async function GET() {
  const s = await sessaoOu401();
  if ("erro" in s) return s.erro;
  try {
    return NextResponse.json({ podeEditar: s.podeEditar, precos: await listarPrecos() });
  } catch (e) {
    console.error("[tabela-precos] GET", e);
    return NextResponse.json({ error: "Falha ao ler a tabela de preços." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const s = await editorOu403();
  if ("erro" in s) return s.erro;

  const body = await request.json().catch(() => null) as {
    itens?: { unitId?: number; enterpriseId?: number; unidade?: string; valor?: number | null }[];
    tipo?: string; descricao?: string;
  } | null;
  const itens = body?.itens;
  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "Nenhuma unidade informada." }, { status: 400 });
  }
  const tipo = body?.tipo === "m2" ? "m2" : "manual";

  const alteracoes: AlteracaoPreco[] = [];
  for (const i of itens) {
    if (!i.unitId || !i.enterpriseId) {
      return NextResponse.json({ error: "Unidade sem identificação do Sienge." }, { status: 400 });
    }
    if (i.valor !== null && !valorValido(i.valor)) {
      return NextResponse.json({ error: `Valor inválido para a unidade ${i.unidade || i.unitId}.` }, { status: 400 });
    }
    alteracoes.push({ unitId: i.unitId, enterpriseId: i.enterpriseId, unidade: i.unidade || "", valor: i.valor === null ? null : arredondar(i.valor!) });
  }

  try {
    const alteradas = await gravarPrecos(alteracoes, {
      lote: novoLote(), tipo,
      descricao: (body?.descricao || (tipo === "m2" ? "Preenchimento por R$/m²" : "Valor digitado")).slice(0, 300),
      usuario: s.nome === s.email ? s.email : `${s.nome} <${s.email}>`,
    });
    return NextResponse.json({ ok: true, alteradas });
  } catch (e) {
    console.error("[tabela-precos] PUT", e);
    return NextResponse.json({ error: "Falha ao gravar a tabela de preços." }, { status: 500 });
  }
}
