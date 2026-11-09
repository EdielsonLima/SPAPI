// Número do badge "Contas Vencidas" do menu lateral, contado no PostgreSQL sobre
// o cache de Contas a Pagar do Painel (ver contarParcelasComSaldoNoCache).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { contarParcelasComSaldoNoCache, getCacheCachedAt } from "@/lib/db";
import { periodosDoPainel } from "@/lib/painel-periodos";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
// A conta leva ~1 s no banco: guarda o último resultado por versão do cache.
let ultimo: { chave: string; quantidade: number } | null = null;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const de = searchParams.get("de") ?? "";
  const ate = searchParams.get("ate") ?? "";
  if (!DATA.test(de) || !DATA.test(ate)) {
    return NextResponse.json({ error: "Informe de=AAAA-MM-DD e ate=AAAA-MM-DD" }, { status: 400 });
  }
  const { inicio, fim } = periodosDoPainel();
  const cachedAt = await getCacheCachedAt("outcome", inicio, fim);
  const chave = `${cachedAt}|${de}|${ate}`;
  if (cachedAt && ultimo?.chave === chave) return NextResponse.json({ quantidade: ultimo.quantidade, cachedAt });

  const r = await contarParcelasComSaldoNoCache(inicio, fim, de, ate);
  if (!r) return NextResponse.json({ quantidade: null, cachedAt: null });
  ultimo = { chave: `${r.cachedAt}|${de}|${ate}`, quantidade: r.quantidade };
  return NextResponse.json(r);
}
