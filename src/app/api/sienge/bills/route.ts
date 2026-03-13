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
  const billId = searchParams.get("id");

  if (!billId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  try {
    const data = await siengeGet<{ notes?: string | null }>(`/bills/${billId}`);
    return NextResponse.json({ billId: Number(billId), notes: data.notes || null });
  } catch (error) {
    console.error("Error fetching bill notes:", error);
    return NextResponse.json({ billId: Number(billId), notes: null });
  }
}
