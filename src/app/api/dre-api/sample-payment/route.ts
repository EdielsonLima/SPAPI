import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedIncomeContaining } from "@/lib/db";

// Debug endpoint — pega 3 amostras de payments de income do ano informado
// pra mostrar a estrutura exata. Util pra descobrir se os campos
// interestAmount/fineAmount/monetaryCorrectionAmount vem no payload Sienge,
// ou se tem outro nome (interest, fine, monetaryAmount, etc).

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || String(new Date().getFullYear());

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  try {
    const cache = await getCachedIncomeContaining(startDate, endDate);
    if (!cache) {
      return NextResponse.json({ error: "Cache nao encontrado pra esse range" }, { status: 404 });
    }

    const payload = cache.data as { data?: unknown[] };
    const items = Array.isArray(payload?.data) ? payload.data : [];

    // Pega 3 items que tem pagamentos no ano informado
    const samples: unknown[] = [];
    for (const itemRaw of items) {
      if (samples.length >= 3) break;
      const item = itemRaw as { payments?: { paymentDate?: string }[]; companyName?: string };
      const payments = item.payments || [];
      const hasInYear = payments.some(p => p.paymentDate?.startsWith(year));
      if (hasInYear) {
        samples.push({
          companyName: item.companyName,
          // mostra item completo pra ver TODA estrutura
          fullItem: item,
        });
      }
    }

    // Tambem coleta TODAS as chaves usadas em payments (pra mostrar o "schema")
    const paymentKeys = new Set<string>();
    let paymentsWithInterest = 0;
    let paymentsWithFine = 0;
    let paymentsWithMonetary = 0;
    let totalInterest = 0;
    let totalFine = 0;
    let totalMonetary = 0;
    let paymentCount = 0;
    for (const itemRaw of items) {
      const item = itemRaw as { payments?: Record<string, unknown>[] };
      for (const p of item.payments || []) {
        const pdate = p.paymentDate as string | undefined;
        if (!pdate?.startsWith(year)) continue;
        paymentCount++;
        Object.keys(p).forEach(k => paymentKeys.add(k));
        const interest = Number(p.interestAmount) || 0;
        const fine = Number(p.fineAmount) || 0;
        const monetary = Number(p.monetaryCorrectionAmount) || 0;
        if (interest !== 0) { paymentsWithInterest++; totalInterest += interest; }
        if (fine !== 0) { paymentsWithFine++; totalFine += fine; }
        if (monetary !== 0) { paymentsWithMonetary++; totalMonetary += monetary; }
      }
    }

    return NextResponse.json({
      year,
      totalPayments: paymentCount,
      paymentKeys: Array.from(paymentKeys).sort(),
      stats: {
        paymentsWithInterest,
        paymentsWithFine,
        paymentsWithMonetary,
        totalInterest,
        totalFine,
        totalMonetary,
        grandTotalAcrescimo: totalInterest + totalFine + totalMonetary,
      },
      samples,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
