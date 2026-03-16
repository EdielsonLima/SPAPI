import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SIENGE_BASE = process.env.SIENGE_BULK_API_URL!;
  const SIENGE_USERNAME = process.env.SIENGE_USERNAME!;
  const SIENGE_PASSWORD = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");

  try {
    // Fetch a small sample of income data
    const url = new URL(`${SIENGE_BASE}/income`);
    url.searchParams.set("startDate", "2024-01-01");
    url.searchParams.set("endDate", "2026-12-31");
    url.searchParams.set("selectionType", "P"); // by payment date - guaranteed to have receipts
    url.searchParams.set("correctionIndexerId", "0");
    url.searchParams.set("correctionDate", new Date().toISOString().split("T")[0]);
    url.searchParams.set("withAuthorizations", "false");
    url.searchParams.set("withBankMovements", "true");

    const response = await fetch(url.toString(), {
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Sienge API error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const items = data.data || [];

    // Collect diagnostics
    const sampleItem = items[0];
    const sampleKeys = sampleItem ? Object.keys(sampleItem) : [];
    const samplePC = sampleItem?.paymentsCategories?.[0] || null;
    const sampleReceipt = sampleItem?.receipts?.[0] || null;

    let withPC = 0;
    let withReceipts = 0;
    const allFcIds = new Set<string>();

    for (const item of items) {
      if (item.paymentsCategories?.length > 0) {
        withPC++;
        for (const pc of item.paymentsCategories) {
          allFcIds.add(String(pc.financialCategoryId));
        }
      }
      if (item.receipts?.length > 0) withReceipts++;
    }

    return NextResponse.json({
      totalItems: items.length,
      itemsWithPaymentsCategories: withPC,
      itemsWithReceipts: withReceipts,
      sampleItemKeys: sampleKeys,
      samplePaymentsCategory: samplePC,
      sampleReceipt: sampleReceipt ? {
        paymentDate: sampleReceipt.paymentDate,
        netAmount: sampleReceipt.netAmount,
        operationTypeName: sampleReceipt.operationTypeName,
        hasBankMovements: !!(sampleReceipt.bankMovements?.length > 0),
      } : null,
      allUniqueFinancialCategoryIds: Array.from(allFcIds).sort().slice(0, 50),
      sampleItemPreview: sampleItem ? {
        billId: sampleItem.billId,
        companyName: sampleItem.companyName,
        clientName: sampleItem.clientName,
        dueDate: sampleItem.dueDate,
        originalAmount: sampleItem.originalAmount,
        paymentsCategoriesCount: sampleItem.paymentsCategories?.length || 0,
        receiptsCount: sampleItem.receipts?.length || 0,
      } : null,
    });
  } catch (error) {
    console.error("DRE debug error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
