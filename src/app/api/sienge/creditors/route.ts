import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");

  if (ids) {
    const idList = ids.split(",").map(Number).filter(Boolean);
    const results: Record<number, string> = {};
    const batchSize = 5;
    for (let i = 0; i < idList.length; i += batchSize) {
      const batch = idList.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (id) => {
          try {
            const data = await siengeGet<{ id: number; name: string }>(`/creditors/${id}`);
            results[id] = data.name || String(id);
          } catch {
            results[id] = String(id);
          }
        })
      );
    }
    return NextResponse.json(results);
  }

  const limit = searchParams.get("limit") || "200";
  const offset = searchParams.get("offset") || "0";
  try {
    const data = await siengeGet<{ resultSetMetadata: { count: number }; results: { id: number; name: string }[] }>(
      "/creditors",
      { limit, offset }
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching creditors:", error);
    return NextResponse.json({ error: "Failed to fetch creditors" }, { status: 500 });
  }
}
