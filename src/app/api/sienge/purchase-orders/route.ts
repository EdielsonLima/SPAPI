import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengePurchaseOrder } from "@/types/sienge";
import {
  getCachedPurchaseOrders,
  cachePurchaseOrders,
  invalidatePurchaseOrdersCache,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || "200";
  const offset = searchParams.get("offset") || "0";
  const startDate = searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
  const endDate = searchParams.get("endDate") || `${new Date().getFullYear()}-12-31`;
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  const cacheKey = `${startDate}:${endDate}:${limit}:${offset}`;

  if (!forceRefresh) {
    const cached = await getCachedPurchaseOrders(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  if (forceRefresh) {
    await invalidatePurchaseOrdersCache(startDate, endDate);
  }

  try {
    const data = await siengeGet<SiengeListResponse<SiengePurchaseOrder>>(
      "/purchase-orders",
      { limit, offset, startDate, endDate }
    );
    await cachePurchaseOrders(cacheKey, data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase orders" },
      { status: 500 }
    );
  }
}
