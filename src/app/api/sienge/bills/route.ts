import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

interface SiengeBill {
  id: number;
  notes: string | null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const billId = searchParams.get("billId");

  if (!billId) {
    return NextResponse.json({ error: "billId is required" }, { status: 400 });
  }

  try {
    const data = await siengeGet<SiengeBill>(`/bills/${billId}`);
    return NextResponse.json({ notes: data.notes || null });
  } catch (error) {
    console.error("Error fetching bill notes:", error);
    return NextResponse.json({ notes: null });
  }
}
