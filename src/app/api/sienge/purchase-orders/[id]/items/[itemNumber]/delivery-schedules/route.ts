import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengeDeliverySchedule } from "@/types/sienge";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemNumber: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await siengeGet<SiengeListResponse<SiengeDeliverySchedule>>(
      `/purchase-orders/${params.id}/items/${params.itemNumber}/delivery-schedules`,
      { limit: "200", offset: "0" }
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching delivery schedules:", error);
    return NextResponse.json(
      { error: "Failed to fetch delivery schedules" },
      { status: 500 }
    );
  }
}
