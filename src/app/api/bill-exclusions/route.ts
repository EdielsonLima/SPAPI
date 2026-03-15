import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBillExclusions, addBillExclusion, deleteBillExclusion } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const exclusions = await getBillExclusions();
    return NextResponse.json({ data: exclusions });
  } catch (error) {
    console.error("Error fetching bill exclusions:", error);
    return NextResponse.json({ error: "Failed to fetch bill exclusions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { companyId, billId, companyName, clientName, dueDate, originalAmount, observation, reason } = body;

    if (!companyId || !billId || !companyName) {
      return NextResponse.json({ error: "companyId, billId and companyName are required" }, { status: 400 });
    }

    await addBillExclusion(
      Number(companyId), Number(billId), companyName,
      clientName || "", dueDate || "", Number(originalAmount) || 0,
      observation || "", reason || ""
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding bill exclusion:", error);
    return NextResponse.json({ error: "Failed to add bill exclusion" }, { status: 500 });
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
    const billId = searchParams.get("billId");

    if (!companyId || !billId) {
      return NextResponse.json({ error: "companyId and billId are required" }, { status: 400 });
    }

    await deleteBillExclusion(Number(companyId), Number(billId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bill exclusion:", error);
    return NextResponse.json({ error: "Failed to delete bill exclusion" }, { status: 500 });
  }
}
