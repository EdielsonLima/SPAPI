import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { ensureCommissionsTable, getCachedCommissions, cacheCommissions } from "@/lib/db";
import type { SiengeComissao } from "@/lib/comercial-utils";

// Comissões de venda do Sienge (/commissions): cada linha traz o corretor ou
// imobiliária (brokerName), o contrato e o cliente. Mesmo esquema de cache das
// outras rotas do Comercial: 7 dias ou até "Atualizar" (?forceRefresh=true).

interface Pagina { resultSetMetadata: { count: number }; results: SiengeComissao[] }

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forceRefresh = request.nextUrl.searchParams.get("forceRefresh") === "true";
  await ensureCommissionsTable();

  if (!forceRefresh) {
    try {
      const cached = await getCachedCommissions();
      if (cached) return NextResponse.json({ ...(cached.data as Record<string, unknown>), cachedAt: cached.cachedAt });
    } catch { /* sem cache: busca */ }
  }

  try {
    const todas: SiengeComissao[] = [];
    const limite = 200;
    for (let offset = 0; offset < 20000; offset += limite) {
      const r = await siengeGet<Pagina>("/commissions", { limit: String(limite), offset: String(offset) });
      todas.push(...(r.results || []));
      if (!r.results || r.results.length < limite) break;
    }
    const result = { data: todas, total: todas.length };
    try { await cacheCommissions(result); } catch (e) { console.error("Falha ao gravar cache de comissões:", e); }
    return NextResponse.json({ ...result, cachedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Erro ao buscar comissões:", error);
    return NextResponse.json({ error: "Falha ao buscar comissões no Sienge" }, { status: 500 });
  }
}
