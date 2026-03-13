import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBatchArrivalConfirmations } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("orderIds") || "";
  const orderIds = raw
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  if (orderIds.length === 0) return NextResponse.json({});
  if (orderIds.length > 500)
    return NextResponse.json({ error: "Too many IDs (max 500)" }, { status: 400 });

  try {
    const result = await getBatchArrivalConfirmations(orderIds);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching batch arrival confirmations:", error);
    return NextResponse.json({});
  }
}
