import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerAndamento, gravarAndamento } from "@/lib/db";
import { obraDaChave } from "@/lib/torre-3d";
import { podeEditarNaSessao } from "@/app/api/tabela-precos/acesso";
import { ANDAMENTO_INICIAL, ANDAMENTO_INICIAL_EM, etapasValidas, lerAndamentoDoHtml } from "@/lib/andamento-obra";

// Andamento da obra (maquete 3D).
//  GET ?chave= → etapas; relê o site a cada 6 h (se a leitura fechar, grava).
//  PUT { chave, etapas } → grava à mão (quem edita a tabela de preços).

const SEIS_HORAS = 6 * 3600_000;
const lidoEm = new Map<string, number>();

async function doSite(url: string) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (painel Silva Packer)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    return r.ok ? lerAndamentoDoHtml(await r.text()) : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chave = req.nextUrl.searchParams.get("chave") || "";
  const local = obraDaChave(chave);
  if (!local) return NextResponse.json({ error: "Empreendimento sem andamento." }, { status: 404 });
  const partidaEm = ANDAMENTO_INICIAL_EM[chave] ?? "2026-10-23";
  const podeEditar = podeEditarNaSessao(s);
  try {
    if (local.site && Date.now() - (lidoEm.get(chave) ?? 0) > SEIS_HORAS) {
      lidoEm.set(chave, Date.now());
      const etapas = await doSite(local.site);
      if (etapas) await gravarAndamento(chave, etapas, "site", "site");
    }
    const linha = await lerAndamento(chave);
    const etapas = etapasValidas(linha?.etapas) ?? ANDAMENTO_INICIAL[chave] ?? null;
    if (!etapas) return NextResponse.json({ error: "Sem andamento." }, { status: 404 });
    return NextResponse.json({ etapas, fonte: linha?.fonte ?? "painel", atualizadoEm: linha?.atualizadoEm ?? partidaEm, podeEditar });
  } catch (e) {
    console.error("[andamento-obra]", e);
    const etapas = ANDAMENTO_INICIAL[chave];
    return etapas ? NextResponse.json({ etapas, fonte: "painel", atualizadoEm: partidaEm, podeEditar: false }) : NextResponse.json({ error: "Falha." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!podeEditarNaSessao(s)) return NextResponse.json({ error: "Sem permissão para alterar o andamento." }, { status: 403 });
  const body = await req.json().catch(() => null) as { chave?: string; etapas?: unknown } | null;
  const etapas = etapasValidas(body?.etapas);
  if (!body?.chave || !obraDaChave(body.chave) || !etapas) {
    return NextResponse.json({ error: "Andamento inválido (0 a 100% em cada etapa)." }, { status: 400 });
  }
  await gravarAndamento(body.chave, etapas, "painel", s.user?.email || "");
  return NextResponse.json({ ok: true });
}
