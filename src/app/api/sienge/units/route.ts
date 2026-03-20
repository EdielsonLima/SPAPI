import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { getCachedUnits, cacheUnits, ensureUnitsTable } from "@/lib/db";
import { SiengeUnit, SiengeEnterprise, SiengeEnrichedUnit } from "@/types/sienge";

interface SiengeListResponse<T> {
  resultSetMetadata: { count: number; offset: number; limit: number };
  results: T[];
}

const STOCK_LABELS: Record<string, string> = {
  V: "Vendida",
  D: "Disponível",
  R: "Reserva Técnica",
  P: "Proposta",
  G: "Vendido/Terceiros",
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  await ensureUnitsTable();

  // Check cache first
  if (!forceRefresh) {
    try {
      const cached = await getCachedUnits();
      if (cached) {
        const d = cached.data as Record<string, unknown>;
        return NextResponse.json({ ...d, cachedAt: cached.cachedAt });
      }
    } catch {
      // Cache miss, proceed to fetch
    }
  }

  try {
    // 1. Fetch all enterprises to build ID → name map
    const enterpriseMap = new Map<number, { name: string; companyName: string }>();
    const pageSize = 200;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await siengeGet<SiengeListResponse<SiengeEnterprise>>(
        "/enterprises",
        { limit: String(pageSize), offset: String(offset) }
      );
      if (response.results && response.results.length > 0) {
        response.results.forEach(e => enterpriseMap.set(e.id, { name: e.name, companyName: e.companyName }));
        offset += response.results.length;
        hasMore = response.results.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    // 2. Fetch all units
    const allUnits: SiengeEnrichedUnit[] = [];
    offset = 0;
    hasMore = true;

    while (hasMore) {
      const response = await siengeGet<SiengeListResponse<SiengeUnit>>(
        "/units",
        { limit: String(pageSize), offset: String(offset) }
      );
      if (response.results && response.results.length > 0) {
        response.results.forEach(u => {
          const enterprise = enterpriseMap.get(u.enterpriseId);
          allUnits.push({
            id: u.id,
            enterpriseId: u.enterpriseId,
            enterpriseName: enterprise?.name || `Empreendimento ${u.enterpriseId}`,
            companyName: enterprise?.companyName || "",
            name: u.name,
            propertyType: u.propertyType || "",
            commercialStock: STOCK_LABELS[u.commercialStock] || u.commercialStock || "Outro",
            floor: u.floor || "",
            contractNumber: u.contractNumber || "",
            privateArea: u.privateArea || 0,
            deliveryDate: u.deliveryDate || null,
          });
        });
        offset += response.results.length;
        hasMore = response.results.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const result = { data: allUnits, total: allUnits.length };

    // Cache the result
    try {
      await cacheUnits(result);
    } catch (e) {
      console.error("Failed to cache units:", e);
    }

    return NextResponse.json({ ...result, cachedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error fetching units:", error);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}
