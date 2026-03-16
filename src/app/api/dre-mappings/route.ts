import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDreMappings, addDreMapping, deleteDreMapping } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const mappings = await getDreMappings();
    return NextResponse.json({ data: mappings });
  } catch (error) {
    console.error("Error fetching DRE mappings:", error);
    return NextResponse.json({ error: "Failed to fetch DRE mappings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { dreCategory, financialPlanId, financialPlanName } = body;

    if (!dreCategory || !financialPlanId || !financialPlanName) {
      return NextResponse.json({ error: "dreCategory, financialPlanId and financialPlanName are required" }, { status: 400 });
    }

    await addDreMapping(dreCategory, financialPlanId, financialPlanName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding DRE mapping:", error);
    return NextResponse.json({ error: "Failed to add DRE mapping" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dreCategory = searchParams.get("dreCategory");
    const financialPlanId = searchParams.get("financialPlanId");

    if (!dreCategory || !financialPlanId) {
      return NextResponse.json({ error: "dreCategory and financialPlanId are required" }, { status: 400 });
    }

    await deleteDreMapping(dreCategory, financialPlanId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting DRE mapping:", error);
    return NextResponse.json({ error: "Failed to delete DRE mapping" }, { status: 500 });
  }
}
