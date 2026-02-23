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
  const purchaseOrderId = searchParams.get("purchaseOrderId");
  const limit = searchParams.get("limit") || "200";
  const offset = searchParams.get("offset") || "0";

  if (!purchaseOrderId) {
    return NextResponse.json({ error: "purchaseOrderId is required" }, { status: 400 });
  }

  try {
    const data = await siengeGet<{ results: unknown[]; resultSetMetadata: { count: number } }>(
      "/purchase-invoices/deliveries-attended",
      { purchaseOrderId, limit, offset }
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching deliveries attended:", error);
    return NextResponse.json(
      { error: "Failed to fetch deliveries attended" },
      { status: 500 }
    );
  }
}
