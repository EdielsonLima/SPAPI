import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { getCachedCreditors, getCachedCreditorsByIds, cacheCreditors } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  // ── Busca por IDs específicos ──────────────────────────────────────────────
  if (ids) {
    const idList = ids.split(",").map(Number).filter(Boolean);

    // 1. Verifica quais IDs já estão no banco
    const fromDb = await getCachedCreditorsByIds(idList).catch(() => ({} as Record<number, string>));
    const missingIds = idList.filter((id) => !(id in fromDb));

    // 2. Busca no Sienge apenas os que faltam (evita chamadas desnecessárias)
    const results: Record<number, string> = { ...fromDb };
    if (missingIds.length > 0) {
      const batchSize = 5;
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batch = missingIds.slice(i, i + batchSize);
        const fetched: { id: number; name: string }[] = [];
        await Promise.all(
          batch.map(async (id) => {
            try {
              const data = await siengeGet<{ id: number; name: string }>(`/creditors/${id}`);
              results[id] = data.name || String(id);
              fetched.push({ id, name: data.name || String(id) });
            } catch {
              results[id] = String(id);
            }
          })
        );
        // 3. Armazena os recém-buscados no banco
        if (fetched.length > 0) {
          await cacheCreditors(fetched).catch(() => {});
        }
      }
    }

    return NextResponse.json(results);
  }

  // ── Lista completa ─────────────────────────────────────────────────────────
  if (!forceRefresh) {
    try {
      const cached = await getCachedCreditors();
      if (cached.length > 0) {
        return NextResponse.json({
          resultSetMetadata: { count: cached.length, offset: 0, limit: cached.length },
          results: cached,
        });
      }
    } catch {
      // Se o banco falhar, cai no Sienge abaixo
    }
  }

  try {
    const limit = searchParams.get("limit") || "500";
    const offset = searchParams.get("offset") || "0";
    const data = await siengeGet<{ resultSetMetadata: { count: number }; results: { id: number; name: string }[] }>(
      "/creditors",
      { limit, offset }
    );

    // Armazena no banco para próximas requisições
    const creditors = (data.results || []).map((c) => ({ id: c.id, name: c.name }));
    if (creditors.length > 0) {
      await cacheCreditors(creditors).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching creditors:", error);
    return NextResponse.json({ error: "Failed to fetch creditors" }, { status: 500 });
  }
}
