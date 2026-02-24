import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedDeliveryStatuses } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idsParam = request.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ cached: {} });
  }

  const ids = idsParam.split(",").map(Number).filter((n) => !isNaN(n));

  try {
    const cached = await getCachedDeliveryStatuses(ids);
    return NextResponse.json({ cached });
  } catch (error) {
    console.error("Error fetching delivery cache:", error);
    return NextResponse.json({ cached: {} });
  }
}
