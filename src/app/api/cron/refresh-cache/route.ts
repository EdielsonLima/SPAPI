// Cron de refresh do cache financeiro (outcome + income + BMs avulsos + saldos),
// direto do Sienge Bulk API para o Postgres — sem depender de abrir o Painel.
//
// A logica em si vive em src/lib/refreshCache.ts (refreshFinanceiroCache), que
// e COMPARTILHADA com o tool "atualizar_cache" do conector MCP financeiro
// (src/app/api/mcp/route.ts). Mantenha a regra em um lugar so.
//
// Auth: header `x-cron-secret` ou query `?k=` == CRON_SECRET (fallback
// MCP_API_TOKEN). Disparado por GitHub Action diaria (.github/workflows/
// cron-refresh-cache.yml) antes do relatorio das 7h30 no WhatsApp.
import { NextRequest, NextResponse } from "next/server";
import { refreshFinanceiroCache, REFRESH_START, REFRESH_END } from "@/lib/refreshCache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || process.env.MCP_API_TOKEN || "";
  if (!expected) return false;
  const hdr = req.headers.get("x-cron-secret") || "";
  const q = req.nextUrl.searchParams.get("k") || "";
  return hdr === expected || q === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const resumo = await refreshFinanceiroCache();
    return NextResponse.json({ ok: true, range: { START: REFRESH_START, END: REFRESH_END }, ...resumo });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/refresh-cache] ERRO:", message);
    return NextResponse.json({ ok: false, erro: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "cron/refresh-cache",
    uso: "POST com header x-cron-secret (ou ?k=). Atualiza cached_outcome, cached_income, cached_bank_movements e cached_daily_balances direto do Sienge.",
  });
}
