import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";

// Faz fetch direto e captura o body da resposta (mesmo em 400/404) pra ver
// a mensagem detalhada do Sienge (ex: "param 'X' is required").
async function siengeFetchRaw(endpoint: string): Promise<{ status: number; body: unknown }> {
  const apiUrl = process.env.SIENGE_API_URL!;
  const username = process.env.SIENGE_USERNAME!;
  const password = process.env.SIENGE_PASSWORD!;
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  const url = `${apiUrl}${endpoint}`;
  const response = await fetch(url, {
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    cache: "no-store",
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => null);
  }
  return { status: response.status, body };
}

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
  } else if (endpoint === "more") {
    // Testa outros endpoints REST conhecidos do Sienge
    attempts.push({ url: "/accounts-receivable/customer-extracts" });
    attempts.push({ url: "/accounts-receivable/cobrancas" });
    attempts.push({ url: "/accounts-receivable/checking-accounts" });
    attempts.push({ url: "/accounts-receivable/income-payments" });
    attempts.push({ url: "/accounts-receivable/installments-paid" });
    attempts.push({ url: "/income-payments" });
    attempts.push({ url: "/payment-slips" });
    attempts.push({ url: "/customers" });
    attempts.push({ url: "/customer-financial-statements" });
    attempts.push({ url: "/bank-accounts" });
    attempts.push({ url: "/financial-statements" });
    attempts.push({ url: "/dre" });
    attempts.push({ url: "/financial/dre" });
    attempts.push({ url: "/reports/dre" });
    attempts.push({ url: "/reports/contas-recebidas" });
    attempts.push({ url: "/sales-contracts" });
  } else if (endpoint === "params") {
    // Testa parametros e endpoints especificos pra recebimentos
    attempts.push({ url: "/accounts-receivable/receivable-bills?selectionType=I&startDate=2026-01-01&endDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills?detailed=true&startDate=2026-01-01&endDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills?includePayments=true&startDate=2026-01-01&endDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills?startReceiveDate=2026-01-01&endReceiveDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?startDate=2026-01-01&endDate=2026-05-13" });
  } else if (endpoint === "raw") {
    // Modo especial: faz fetch direto e captura body da resposta de erro pra
    // ver mensagem detalhada do Sienge.
    const targets = [
      "/accounts-receivable/receivable-bills/income-payments",
      "/accounts-receivable/receivable-bills/income-payments?receivableBillId=678",
      "/accounts-receivable/receivable-bills/income-payments?receivableBillId=678&installmentId=7",
      "/accounts-receivable/receivable-bills/income-payments?startDate=2026-01-01&endDate=2026-05-13",
    ];
    const rawResults = [];
    for (const t of targets) {
      try {
        const r = await siengeFetchRaw(t);
        rawResults.push({ url: t, status: r.status, body: r.body });
      } catch (e) {
        rawResults.push({ url: t, status: -1, error: e instanceof Error ? e.message : "Unknown" });
      }
    }
    return NextResponse.json({ endpoint, raw: rawResults });
  } else if (endpoint === "income-payments") {
    // /accounts-receivable/receivable-bills/income-payments retornou 400
    // (rota existe, faltam parametros) — testa varios formatos
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?startReceiveDate=2026-01-01&endReceiveDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?startPaymentDate=2026-01-01&endPaymentDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?paymentStartDate=2026-01-01&paymentEndDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?paidStartDate=2026-01-01&paidEndDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?dueStartDate=2026-01-01&dueEndDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?companyId=1&startDate=2026-01-01&endDate=2026-05-13" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?receivableBillId=678" });
    attempts.push({ url: "/accounts-receivable/receivable-bills/income-payments?receivableBillId=678&installmentId=7" });
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
      // Se for modo de exploracao, testa todos. Senao, para no primeiro sucesso
      const exploreModes = ["all", "details", "more", "params", "income-payments"];
      if (!exploreModes.includes(endpoint)) break;
    } catch (e) {
      results.push({ url, status: "error", error: e instanceof Error ? e.message : "Unknown" });
    }
  }

  return NextResponse.json({ endpoint, billId, installmentId, attempts: results });
}
