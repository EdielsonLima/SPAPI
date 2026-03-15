import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
  const companyId = searchParams.get("companyId");
  const billId = searchParams.get("billId");

  if (!companyId || !billId) {
    return NextResponse.json({ error: "companyId and billId are required" }, { status: 400 });
  }

  const fetchHeaders = {
    Authorization: authHeader,
    "Content-Type": "application/json",
  };

  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Try income first, then outcome
  for (const type of ["income", "outcome"] as const) {
    try {
      const url = new URL(`${SIENGE_BASE}/${type}`);
      url.searchParams.set("companyId", companyId);
      url.searchParams.set("billId", billId);
      url.searchParams.set("startDate", "2015-01-01");
      url.searchParams.set("endDate", localDate);
      url.searchParams.set("selectionType", "D");
      url.searchParams.set("correctionIndexerId", "0");
      url.searchParams.set("correctionDate", localDate);
      url.searchParams.set("withAuthorizations", "false");
      url.searchParams.set("withBankMovements", "false");

      const response = await fetch(url.toString(), { headers: fetchHeaders, cache: "no-store" });

      if (!response.ok) continue;

      const json = await response.json();
      const items = json.data || [];

      if (items.length > 0) {
        const item = items[0];
        return NextResponse.json({
          found: true,
          type,
          clientName: item.clientName || item.creditorName || "",
          dueDate: item.dueDate || "",
          originalAmount: item.originalAmount || 0,
          observation: item.observation || "",
        });
      }
    } catch {
      // Continue to next type
    }
  }

  return NextResponse.json({ found: false });
}
