import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

// Debug endpoint — testa a API REST regular do Sienge (nao bulk) pra ver se
// ela expoe campos que a bulk nao expoe (especificamente "additionAmount"
// que bate com a coluna 'Acrescimo' do relatorio 'Contas Recebidas').
//
// Testa multiplos endpoints e mostra a estrutura da resposta. Use:
// GET /api/dre-api/test-rest?endpoint=accounts-receivable/receivable-bills
//                          &billId=1&installmentId=50

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "accounts-receivable/receivable-bills";
  const billId = searchParams.get("billId");
  const installmentId = searchParams.get("installmentId");

  // Tenta diferentes formas de chamar o endpoint
  const attempts: Array<{ url: string }> = [];

  if (endpoint === "all") {
    // Testa varios endpoints conhecidos pra ver quais retornam 200
    attempts.push({ url: "/accounts-receivable/receivable-bills" });
    attempts.push({ url: "/accounts-receivable/receipts" });
    attempts.push({ url: "/accounts-receivable/income" });
    attempts.push({ url: "/accounts-receivable/installments" });
    attempts.push({ url: "/payment-categories" });
    attempts.push({ url: "/companies" });
    attempts.push({ url: "/financial-categories" });
    attempts.push({ url: "/cost-centers" });
    attempts.push({ url: "/income" });
    attempts.push({ url: "/income/all" });
    attempts.push({ url: "/clients" });
  } else if (endpoint === "details") {
    // Testa rotas aninhadas em receivable-bills/{id}/...
    const b = billId || "678"; // default Rozza 1501
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/installments` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/installments/1` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/installments/1/receipts` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/payments` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/receipts` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/categories` });
    attempts.push({ url: `/accounts-receivable/receivable-bills/${b}/payment-categories` });
  } else if (billId && installmentId) {
    attempts.push({ url: `/${endpoint}/${billId}/installments/${installmentId}` });
    attempts.push({ url: `/${endpoint}/${billId}/${installmentId}` });
    attempts.push({ url: `/${endpoint}/${billId}` });
  } else if (billId) {
    attempts.push({ url: `/${endpoint}/${billId}` });
  } else {
    attempts.push({ url: `/${endpoint}` });
    attempts.push({ url: `/${endpoint}?startDate=2026-01-01&endDate=2026-05-13` });
  }

  const results: Array<{ url: string; status: string; sample?: unknown; error?: string }> = [];

  for (const { url } of attempts) {
    try {
      const data = await siengeGet<unknown>(url);
      // Pega apenas o primeiro item se for array, ou o item completo
      let sample: unknown = data;
      if (Array.isArray(data)) {
        sample = { totalItems: data.length, firstItem: data[0] };
      } else if (data && typeof data === "object" && "results" in data) {
        const obj = data as { results?: unknown[]; resultSetMetadata?: unknown };
        const results = obj.results;
        sample = {
          totalItems: Array.isArray(results) ? results.length : 0,
          metadata: obj.resultSetMetadata,
          firstItem: Array.isArray(results) ? results[0] : null,
        };
      }
      results.push({ url, status: "ok", sample });
      // Se for modo 'all' ou 'details', testa todos. Senao, para no primeiro sucesso
      if (endpoint !== "all" && endpoint !== "details") break;
    } catch (e) {
      results.push({ url, status: "error", error: e instanceof Error ? e.message : "Unknown" });
    }
  }

  return NextResponse.json({ endpoint, billId, installmentId, attempts: results });
}
