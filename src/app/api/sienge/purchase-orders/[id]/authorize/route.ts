import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengePut } from "@/lib/sienge";

export async function PUT(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ok, status } = await siengePut(`/purchase-orders/${params.id}/authorize`);

  if (!ok) {
    return NextResponse.json(
      { error: `Sienge retornou ${status}` },
      { status: status === 400 ? 400 : 502 }
    );
  }
  return NextResponse.json({ success: true });
}
