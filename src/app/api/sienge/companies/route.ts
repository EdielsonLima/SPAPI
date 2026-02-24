import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeCompany, SiengeListResponse } from "@/types/sienge";
import { getCachedCompanies, cacheCompanies } from "@/lib/db";

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
      const cached = await getCachedCompanies();
      if (cached.length > 0) {
        return NextResponse.json({
          resultSetMetadata: { count: cached.length, offset: 0, limit: cached.length },
          results: cached.map((c) => ({ id: c.id, name: c.name })),
        });
      }
    } catch {
    }
  }

  try {
    const data = await siengeGet<SiengeListResponse<SiengeCompany>>(
      "/companies",
      { limit, offset }
    );

    try {
      const companies = (data.results || []).map((c: SiengeCompany) => ({ id: c.id, name: c.name }));
      if (companies.length > 0) {
        await cacheCompanies(companies);
      }
    } catch {
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies" },
      { status: 500 }
    );
  }
}
