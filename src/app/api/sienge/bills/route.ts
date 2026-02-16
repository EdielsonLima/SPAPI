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
  const billIds = searchParams.get("ids");

  if (!billIds) {
    return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
  }

  const ids = billIds.split(",").map(id => id.trim()).filter(Boolean);

  try {
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const url = `${apiUrl}/v1/bills/${id}`;
        const response = await fetch(url, {
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          next: { revalidate: 300 },
        });
        if (!response.ok) {
          return { billId: Number(id), notes: null };
        }
        const data = await response.json();
        return { billId: Number(id), notes: data.notes || null };
      })
    );

    const notes: Record<number, string | null> = {};
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        notes[result.value.billId] = result.value.notes;
      }
    });

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Error fetching bill notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch bill notes" },
      { status: 500 }
    );
  }
}
