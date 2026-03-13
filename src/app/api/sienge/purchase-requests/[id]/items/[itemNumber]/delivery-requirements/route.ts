import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengeDeliveryRequirement } from "@/types/sienge";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemNumber: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await siengeGet<SiengeListResponse<SiengeDeliveryRequirement>>(
      `/purchase-requests/${params.id}/items/${params.itemNumber}/delivery-requirements`
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error(
      `Error fetching delivery requirements for purchase-request ${params.id} item ${params.itemNumber}:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch delivery requirements" },
      { status: 500 }
    );
  }
}
