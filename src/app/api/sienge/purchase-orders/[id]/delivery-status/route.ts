import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengePurchaseOrderItem, SiengeDeliverySchedule, SiengePurchaseOrder } from "@/types/sienge";
import { getCachedDeliveryStatuses, cacheDeliveryStatus } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = Number(params.id);

  try {
    const cached = await getCachedDeliveryStatuses([orderId]);
    if (cached[orderId]) {
      return NextResponse.json({
        status: cached[orderId],
        cached: true,
      });
    }
  } catch {
  }

  try {
    const itemsData = await siengeGet<SiengeListResponse<SiengePurchaseOrderItem>>(
      `/purchase-orders/${params.id}/items`,
      { limit: "200", offset: "0" }
    );
    const items = itemsData.results || [];

    if (items.length === 0) {
      return NextResponse.json({ status: "none", totalItems: 0, delivered: 0, pending: 0 });
    }

    let totalDelivered = 0;
    let totalOpen = 0;
    let hasSchedules = false;

    for (const item of items) {
      try {
        const data = await siengeGet<SiengeListResponse<SiengeDeliverySchedule>>(
          `/purchase-orders/${params.id}/items/${item.itemNumber}/delivery-schedules`,
          { limit: "200", offset: "0" }
        );
        const schedules = data.results || [];
        schedules.forEach((s) => {
          hasSchedules = true;
          totalDelivered += s.deliveredQuantity;
          totalOpen += s.openQuantity;
        });
      } catch {
      }
    }

    let status = "none";
    if (!hasSchedules) status = "none";
    else if (totalOpen === 0 && totalDelivered > 0) status = "complete";
    else if (totalDelivered > 0 && totalOpen > 0) status = "partial";
    else status = "pending";

    if (status === "complete") {
      try {
        const orderData = await siengeGet<SiengePurchaseOrder>(
          `/purchase-orders/${params.id}`
        );
        if (orderData.authorized) {
          await cacheDeliveryStatus(orderId, status, "autorizado", items.length, totalDelivered, totalOpen);
        }
      } catch {
      }
    }

    return NextResponse.json({
      status,
      totalItems: items.length,
      delivered: totalDelivered,
      pending: totalOpen,
    });
  } catch (error) {
    console.error("Error fetching delivery status:", error);
    return NextResponse.json({ status: "error" });
  }
}
