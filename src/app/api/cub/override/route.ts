import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCubOverride, upsertCubOverride, deleteCubOverride } from "@/lib/db";

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

    if (!value || !monthLabel) {
      return NextResponse.json({ error: "value and monthLabel are required" }, { status: 400 });
    }

    await upsertCubOverride(
      Number(value),
      monthLabel,
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
