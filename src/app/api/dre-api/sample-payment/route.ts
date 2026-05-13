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
  const excludeParam = searchParams.get("excludeCompanies");
  const excludeCompanies = excludeParam
    ? new Set(excludeParam.split(",").map(s => s.trim().toUpperCase()))
    : new Set<string>();

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

    // Stats de PAYMENTS (campo direto)
    const paymentKeys = new Set<string>();
    const pStat = { withInterest: 0, withFine: 0, withMonetary: 0, withAddition: 0, totalInterest: 0, totalFine: 0, totalMonetary: 0, totalAddition: 0, count: 0 };
    // Stats de RECEIPTS (o que parece ter os acrescimos)
    const receiptKeys = new Set<string>();
    const rStat = { withInterest: 0, withFine: 0, withMonetary: 0, withAddition: 0, totalInterest: 0, totalFine: 0, totalMonetary: 0, totalAddition: 0, count: 0 };

    for (const itemRaw of items) {
      const item = itemRaw as { payments?: Record<string, unknown>[]; receipts?: Record<string, unknown>[]; companyName?: string };
      if (excludeCompanies.has((item.companyName || "").toUpperCase())) continue;
      for (const p of item.payments || []) {
        const pdate = p.paymentDate as string | undefined;
        if (!pdate?.startsWith(year)) continue;
        pStat.count++;
        Object.keys(p).forEach(k => paymentKeys.add(k));
        const interest = Number(p.interestAmount) || 0;
        const fine = Number(p.fineAmount) || 0;
        const monetary = Number(p.monetaryCorrectionAmount) || 0;
        const addition = Number(p.additionAmount) || 0;
        if (interest !== 0) { pStat.withInterest++; pStat.totalInterest += interest; }
        if (fine !== 0) { pStat.withFine++; pStat.totalFine += fine; }
        if (monetary !== 0) { pStat.withMonetary++; pStat.totalMonetary += monetary; }
        if (addition !== 0) { pStat.withAddition++; pStat.totalAddition += addition; }
      }
      for (const r of item.receipts || []) {
        const pdate = r.paymentDate as string | undefined;
        if (!pdate?.startsWith(year)) continue;
        rStat.count++;
        Object.keys(r).forEach(k => receiptKeys.add(k));
        const interest = Number(r.interestAmount) || 0;
        const fine = Number(r.fineAmount) || 0;
        const monetary = Number(r.monetaryCorrectionAmount) || 0;
        const addition = Number(r.additionAmount) || 0;
        if (interest !== 0) { rStat.withInterest++; rStat.totalInterest += interest; }
        if (fine !== 0) { rStat.withFine++; rStat.totalFine += fine; }
        if (monetary !== 0) { rStat.withMonetary++; rStat.totalMonetary += monetary; }
        if (addition !== 0) { rStat.withAddition++; rStat.totalAddition += addition; }
      }
    }

    return NextResponse.json({
      year,
      paymentKeys: Array.from(paymentKeys).sort(),
      receiptKeys: Array.from(receiptKeys).sort(),
      paymentStats: { ...pStat, grandTotalAcrescimo: pStat.totalInterest + pStat.totalFine + pStat.totalMonetary + pStat.totalAddition },
      receiptStats: { ...rStat, grandTotalAcrescimo: rStat.totalInterest + rStat.totalFine + rStat.totalMonetary + rStat.totalAddition },
      samples,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
