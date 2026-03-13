import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengeDeliverySchedule } from "@/types/sienge";
import { getCachedDeliverySchedules, cacheDeliverySchedules, getCachedDeliveryStatuses } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemNumber: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = Number(params.id);
  const itemNumber = Number(params.itemNumber);
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  // Pedidos 100% entregues têm cronogramas imutáveis → cache permanente
  // Pedidos parciais/aguardando ainda mudam → TTL de 2h
  const isFullyDelivered = await getCachedDeliveryStatuses([orderId])
    .then((s) => s[orderId] === "Entregue")
    .catch(() => false);

  if (!forceRefresh) {
    try {
      const cached = await getCachedDeliverySchedules(orderId, itemNumber, isFullyDelivered);
      if (cached !== null) {
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
    const data = await siengeGet<SiengeListResponse<SiengeDeliverySchedule>>(
      `/purchase-orders/${orderId}/items/${itemNumber}/delivery-schedules`,
      { limit: "200", offset: "0" }
    );

    const schedules = data.results || [];
    await cacheDeliverySchedules(orderId, itemNumber, schedules).catch(() => {});

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching delivery schedules:", error);
    return NextResponse.json(
      { error: "Failed to fetch delivery schedules" },
      { status: 500 }
    );
  }
}
