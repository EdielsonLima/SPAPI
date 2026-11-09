import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCubOverride, upsertCubOverride, deleteCubOverride } from "@/lib/db";
import { lerRotuloMes, rotuloMes } from "@/lib/indicadores/cub-manual";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const override = await getCubOverride();
    return NextResponse.json({ data: override });
  } catch (error) {
    console.error("Error fetching CUB override:", error);
    return NextResponse.json({ error: "Failed to fetch CUB override" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { value, monthLabel, monthlyVariation, yearlyAccumulated } = body;

    // Só vale para um mês que o site ainda não publicou (regra em cub-manual.ts);
    // a variação, o acumulado e os 12 meses saem da série — os % digitados só
    // entram se faltar a base.
    const mes = lerRotuloMes(monthLabel);
    const valor = Number(value);
    if (!mes || !Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: "Informe o mês (ex.: Dez/2026) e o valor do CUB em R$/m²" }, { status: 400 });
    }

    await upsertCubOverride(
      valor,
      rotuloMes(mes.ano, mes.mes),
      Number(monthlyVariation) || 0,
      Number(yearlyAccumulated) || 0
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving CUB override:", error);
    return NextResponse.json({ error: "Failed to save CUB override" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteCubOverride();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CUB override:", error);
    return NextResponse.json({ error: "Failed to delete CUB override" }, { status: 500 });
  }
}
