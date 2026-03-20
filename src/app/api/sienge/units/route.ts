import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { getCachedUnits, cacheUnits, ensureUnitsTable } from "@/lib/db";
import { SiengeUnit, SiengeEnterprise } from "@/types/sienge";

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

// Maps raw stock code to label — applied at response time, not at cache time
// Reverse map: old labels back to raw codes (handles stale cache with wrong labels)
const LABEL_TO_CODE: Record<string, string> = {
  "Vendida": "V", "Disponível": "D", "Reserva Técnica": "R",
  "Proposta": "P", "Vendido/Terceiros": "G",
  // Old incorrect labels that may exist in cache:
  "Permuta": "P", "Gravame": "G",
};

function mapStockLabels(units: RawCachedUnit[]) {
  return units.map(u => {
    // If rawStock exists (new cache format), use it directly
    if (u.rawStock) {
      return { ...u, commercialStock: STOCK_LABELS[u.rawStock] || u.rawStock };
    }
    // Old cache: reverse-lookup the code from the cached label, then re-map
    const code = LABEL_TO_CODE[u.commercialStock] || u.commercialStock;
    return { ...u, commercialStock: STOCK_LABELS[code] || code || "Outro" };
  });
}

// What we store in the DB cache (raw stock code preserved)
interface RawCachedUnit {
  id: number;
  enterpriseId: number;
  enterpriseName: string;
  companyName: string;
  name: string;
  propertyType: string;
  rawStock: string;        // Raw code from Sienge: V, D, R, P, G
  commercialStock: string; // Label (for backwards compat, remapped on read)
  floor: string;
  contractNumber: string;
  privateArea: number;
  deliveryDate: string | null;
}

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
        const d = cached.data as { data: RawCachedUnit[]; total: number };
        // Re-map labels from raw stock codes so label changes apply without cache bust
        const remapped = mapStockLabels(d.data);
        return NextResponse.json({ data: remapped, total: remapped.length, cachedAt: cached.cachedAt });
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
    const allUnits: RawCachedUnit[] = [];
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
            rawStock: u.commercialStock || "",
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

    // Cache the result (with rawStock preserved for future label remapping)
    try {
      await cacheUnits(result);
    } catch (e) {
      console.error("Failed to cache units:", e);
    }

    // Return with current labels
    const mapped = mapStockLabels(allUnits);
    return NextResponse.json({ data: mapped, total: mapped.length, cachedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error fetching units:", error);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}
