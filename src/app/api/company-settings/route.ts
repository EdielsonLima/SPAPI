import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanySettings, upsertCompanySetting, deleteCompanySetting } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getCompanySettings();
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error("Error fetching company settings:", error);
    return NextResponse.json({ error: "Failed to fetch company settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { companyId, companyName, areaM2, factor, status, controlaOrcamento } = body;

    if (!companyId || !companyName) {
      return NextResponse.json({ error: "companyId and companyName are required" }, { status: 400 });
    }

    await upsertCompanySetting(companyId, companyName, Number(areaM2) || 0, Number(factor) || 1, status || "ativa", !!controlaOrcamento);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving company setting:", error);
    return NextResponse.json({ error: "Failed to save company setting" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    await deleteCompanySetting(Number(companyId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting company setting:", error);
    return NextResponse.json({ error: "Failed to delete company setting" }, { status: 500 });
  }
}
