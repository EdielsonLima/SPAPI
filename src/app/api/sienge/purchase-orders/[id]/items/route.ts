import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengePurchaseOrderItem } from "@/types/sienge";
import { getCachedOrderItems, cacheOrderItems } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const purchaseOrderId = Number(params.id);
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    try {
      const cached = await getCachedOrderItems(purchaseOrderId);
      if (cached && cached.length > 0) {
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
    const data = await siengeGet<SiengeListResponse<SiengePurchaseOrderItem>>(
      `/purchase-orders/${purchaseOrderId}/items`,
      { limit: "200", offset: "0" }
    );

    const items = data.results || [];
    if (items.length > 0) {
      await cacheOrderItems(purchaseOrderId, items).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching purchase order items:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase order items" },
      { status: 500 }
    );
  }
}
