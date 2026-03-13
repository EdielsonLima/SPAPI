import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengePurchaseRequest } from "@/types/sienge";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await siengeGet<SiengePurchaseRequest>(
      `/purchase-requests/${params.id}`
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error fetching purchase request ${params.id}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch purchase request" },
      { status: 500 }
    );
  }
}
