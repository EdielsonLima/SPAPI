import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.SIENGE_API_URL!;
  const username = process.env.SIENGE_USERNAME!;
  const password = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const { searchParams } = new URL(request.url);
  const billId = searchParams.get("id");

  if (!billId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  try {
    const url = `${apiUrl}/v1/bills/${billId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json({ billId: Number(billId), notes: null });
    }

    const data = await response.json();
    return NextResponse.json({ billId: Number(billId), notes: data.notes || null });
  } catch (error) {
    console.error("Error fetching bill notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch bill notes" },
      { status: 500 }
    );
  }
}
