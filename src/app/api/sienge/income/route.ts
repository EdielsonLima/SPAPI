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
    if (cached) {
      const resp = typeof cached.data === "object" && cached.data !== null ? cached.data : { data: cached.data };
      return NextResponse.json({ ...(resp as Record<string, unknown>), cachedAt: cached.cachedAt });
    }
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

  // Build URL for bank movements (credit type = income receipts)
  const buildBankMovUrl = () => {
    const url = new URL(`${SIENGE_BASE}/bank-movement`);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("selectionType", "M");
    url.searchParams.set("onlyDetachedMovement", "N");
    return url.toString();
  };

  try {
    // Fetch income by due date (D), by payment date (P), and bank movements in parallel
    const [responseD, responseP, responseBM] = await Promise.all([
      fetch(buildUrl("D"), { headers: fetchHeaders, cache: "no-store" }),
      fetch(buildUrl("P"), { headers: fetchHeaders, cache: "no-store" }),
      fetch(buildBankMovUrl(), { headers: fetchHeaders, cache: "no-store" }),
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

    // Enrich income items with bank movement data (actual net received amounts)
    const bmDebug = { total: 0, withBillId: 0, matched: 0, types: {} as Record<string, number>, status: "not_fetched" };
    if (responseBM.ok) {
      const bmData = await responseBM.json();
      const bankMovements = bmData.data || [];
      bmDebug.total = bankMovements.length;
      bmDebug.status = "ok";

      // Collect all income billIds for matching
      const incomeBillIds = new Set(mergedData.map((i: { billId: number }) => i.billId));

      // Group bank movements by billId:installmentId (no type filter initially)
      const bmByBill = new Map<string, number>();
      for (const bm of bankMovements) {
        // Count types for debug
        const t = bm.bankMovementOperationType || "null";
        bmDebug.types[t] = (bmDebug.types[t] || 0) + 1;

        if (bm.billId) {
          bmDebug.withBillId++;
          // Match any movement linked to an income bill
          if (incomeBillIds.has(bm.billId)) {
            const key = `${bm.billId}:${bm.installmentId}`;
            bmByBill.set(key, (bmByBill.get(key) || 0) + bm.bankMovementAmount);
          }
        }
      }
      bmDebug.matched = bmByBill.size;

      // Attach receivedNetAmount to each income item
      for (const item of mergedData) {
        const key = `${item.billId}:${item.installmentId}`;
        if (bmByBill.has(key)) {
          item.receivedNetAmount = bmByBill.get(key);
        }
      }
    } else {
      bmDebug.status = `error_${responseBM.status}`;
    }
    console.log("[income] Bank movements debug:", JSON.stringify(bmDebug));

    const result = { data: mergedData, _bmDebug: bmDebug };
    await cacheIncome(startDate, endDate, result);
    return NextResponse.json({ ...result, cachedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error fetching income:", error);
    return NextResponse.json(
      { error: "Failed to fetch income data" },
      { status: 500 }
    );
  }
}
