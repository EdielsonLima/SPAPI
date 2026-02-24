import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeCostCenter, SiengeListResponse } from "@/types/sienge";
import { getCachedCostCenters, cacheCostCenters } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || "100";
  const offset = searchParams.get("offset") || "0";
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    try {
      const cached = await getCachedCostCenters();
      if (cached.length > 0) {
        return NextResponse.json({
          resultSetMetadata: { count: cached.length, offset: 0, limit: cached.length },
          results: cached,
        });
      }
    } catch {
    }
  }

  try {
    const data = await siengeGet<SiengeListResponse<SiengeCostCenter>>(
      "/cost-centers",
      { limit, offset }
    );

    try {
      const centers = (data.results || []).map((c: SiengeCostCenter) => ({
        id: c.id,
        name: c.name,
        ...(c.cnpj ? { cnpj: c.cnpj } : {}),
        ...(c.idCompany ? { idCompany: c.idCompany } : {}),
      }));
      if (centers.length > 0) {
        await cacheCostCenters(centers);
      }
    } catch {
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching cost centers:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost centers" },
      { status: 500 }
    );
  }
}
