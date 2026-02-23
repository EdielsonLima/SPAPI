import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengePurchaseOrderItem } from "@/types/sienge";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const purchaseOrderId = params.id;

  try {
    const data = await siengeGet<SiengeListResponse<SiengePurchaseOrderItem>>(
      `/purchase-orders/${purchaseOrderId}/items`,
      { limit: "200", offset: "0" }
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching purchase order items:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase order items" },
      { status: 500 }
    );
  }
}
