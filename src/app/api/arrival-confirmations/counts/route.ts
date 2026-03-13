import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArrivalConfirmationCounts } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("orderIds") || "";
  const orderIds = raw
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  if (orderIds.length === 0) return NextResponse.json({});

  try {
    const counts = await getArrivalConfirmationCounts(orderIds);
    return NextResponse.json(counts);
  } catch (error) {
    console.error("Error fetching arrival counts:", error);
    return NextResponse.json({});
  }
}
