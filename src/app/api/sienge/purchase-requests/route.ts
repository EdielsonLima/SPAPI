import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengeListResponse, SiengePurchaseRequestItem } from "@/types/sienge";

// Retorna todos os itens de todas as solicitações.
// Usamos /purchase-requests/all/items pois não existe endpoint de listagem geral.
// A página agrupa os itens por purchaseRequestId para montar a view de solicitações.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || "200";
  const offset = searchParams.get("offset") || "0";

  try {
    const data = await siengeGet<SiengeListResponse<SiengePurchaseRequestItem>>(
      "/purchase-requests/all/items",
      { limit, offset }
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching purchase request items:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase request items" },
      { status: 500 }
    );
  }
}
