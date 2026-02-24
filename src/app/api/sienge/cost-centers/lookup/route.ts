import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idsParam = request.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({});
  }

  const ids = idsParam.split(",").map(Number).filter((n) => !isNaN(n));
  const result: Record<number, string> = {};

  const dbResult = await pool.query(
    `SELECT id, name FROM cached_cost_centers WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(",")})`,
    ids
  ).catch(() => ({ rows: [] as { id: number; name: string }[] }));

  const foundIds = new Set<number>();
  dbResult.rows.forEach((row: { id: number; name: string }) => {
    result[row.id] = row.name;
    foundIds.add(row.id);
  });

  const missing = ids.filter((id) => !foundIds.has(id));
  for (const id of missing) {
    try {
      const data = await siengeGet<{ id: number; name: string }>(`/cost-centers/${id}`);
      result[id] = data.name;
      await pool.query(
        `INSERT INTO cached_cost_centers (id, name, cached_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET name = $2, cached_at = NOW()`,
        [id, data.name]
      ).catch(() => {});
    } catch {
    }
  }

  return NextResponse.json(result);
}
