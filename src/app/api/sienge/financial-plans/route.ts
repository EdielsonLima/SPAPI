import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { SiengePaymentCategory } from "@/types/sienge";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await siengeGet<SiengePaymentCategory[]>(
      "/payment-categories"
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching payment categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment categories" },
      { status: 500 }
    );
  }
}
