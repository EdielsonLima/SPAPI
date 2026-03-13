import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengePaymentCategory } from "@/types/sienge";
import { getCachedFinancialPlans, cacheFinancialPlans } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    try {
      const cached = await getCachedFinancialPlans();
      if (cached.length > 0) {
        return NextResponse.json(cached);
      }
    } catch {
      // Se o banco falhar, cai no Sienge abaixo
    }
  }

  try {
    const data = await siengeGet<SiengePaymentCategory[]>("/payment-categories");

    // Armazena no banco para próximas requisições
    const plans = (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      tpConta: p.tpConta,
      flAtiva: p.flAtiva,
    }));
    if (plans.length > 0) {
      await cacheFinancialPlans(plans).catch(() => {});
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching payment categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment categories" },
      { status: 500 }
    );
  }
}
