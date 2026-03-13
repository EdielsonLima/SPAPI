import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedIncome, cacheIncome } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SIENGE_BASE = process.env.SIENGE_BULK_API_URL!;
  const SIENGE_USERNAME = process.env.SIENGE_USERNAME!;
  const SIENGE_PASSWORD = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || "2024-01-01";
  const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    const cached = await getCachedIncome(startDate, endDate);
    if (cached) return NextResponse.json(cached);
  }

  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const buildUrl = (selectionType: string) => {
    const url = new URL(`${SIENGE_BASE}/income`);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("selectionType", selectionType);
    url.searchParams.set("correctionIndexerId", "0");
    url.searchParams.set("correctionDate", localDate);
    url.searchParams.set("withAuthorizations", "false");
    url.searchParams.set("withBankMovements", "true");
    return url.toString();
  };

  const fetchHeaders = {
    Authorization: authHeader,
    "Content-Type": "application/json",
  };

  try {
    // Fetch both by due date (D) and by payment date (P) to get complete data
    const [responseD, responseP] = await Promise.all([
      fetch(buildUrl("D"), { headers: fetchHeaders, cache: "no-store" }),
      fetch(buildUrl("P"), { headers: fetchHeaders, cache: "no-store" }),
    ]);

    if (!responseD.ok) {
      throw new Error(`Sienge API error (D): ${responseD.status} ${responseD.statusText}`);
    }

    const dataD = await responseD.json();
    const mergedData = dataD.data || [];

    if (responseP.ok) {
      const dataP = await responseP.json();
      const itemsP = dataP.data || [];
      // Merge: add items from P that aren't already in D (dedup by billId+installmentId)
      const existingKeys = new Set(
        mergedData.map((i: { billId: number; installmentId: number }) => `${i.billId}:${i.installmentId}`)
      );
      for (const item of itemsP) {
        const key = `${item.billId}:${item.installmentId}`;
        if (!existingKeys.has(key)) {
          mergedData.push(item);
          existingKeys.add(key);
        } else {
          // If item exists in D but has payments in P, update it
          const idx = mergedData.findIndex(
            (i: { billId: number; installmentId: number }) => `${i.billId}:${i.installmentId}` === key
          );
          if (idx !== -1 && item.payments?.length > 0 && (!mergedData[idx].payments || mergedData[idx].payments.length === 0)) {
            mergedData[idx] = item;
          }
        }
      }
    }

    const result = { data: mergedData };
    await cacheIncome(startDate, endDate, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching income:", error);
    return NextResponse.json(
      { error: "Failed to fetch income data" },
      { status: 500 }
    );
  }
}
