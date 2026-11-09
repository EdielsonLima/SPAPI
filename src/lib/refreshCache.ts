// Refresh do cache financeiro (outcome + income + BMs avulsos + saldos do dia),
// direto do Sienge Bulk API para o Postgres — sem depender de abrir o Painel.
//
// Funcao COMPARTILHADA por:
//   - src/app/api/cron/refresh-cache/route.ts  (GitHub Action diaria)
//   - src/app/api/mcp/route.ts  (tool "atualizar_cache" do conector financeiro,
//     chamada pela tarefa de Fechamento de Caixa ANTES de ler os dados)
//
// Chaves IGUAIS as do Painel Executivo (periodosDoPainel: CP e movimentos
// ano-10..ano+5, CR ano-10..ano+15) para o Painel abrir com o dado da rotina.
// O CR tambem e gravado na chave antiga do conector MCP (REFRESH_START..
// REFRESH_END), DEPOIS da do Painel: o MCP le "o cache mais recente que cobre o
// periodo" e assim continua com os mesmos numeros de antes.
//
// O processamento de income (merge D+P, receipts->payments, receivedNetAmount)
// e uma COPIA de src/app/api/sienge/income/route.ts — manter em sincronia.
import {
  cacheOutcome,
  cacheIncome,
  cacheBankMovements,
  cacheDailyBalance,
  getCachedDailyBalance,
  getCachedCompanies,
} from "@/lib/db";
import { siengeBulkGet, siengeGet } from "@/lib/sienge";
import { expectedDimBancoKeys } from "@/lib/dimBanco";
import { periodosDoPainel } from "@/lib/painel-periodos";
import { prepararCachePainel } from "@/lib/cache-sienge-resposta";

export const REFRESH_START = "2016-01-01";
export const REFRESH_END = "2031-12-31";

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function autenticacaoSienge() {
  const SIENGE_USERNAME = process.env.SIENGE_USERNAME!;
  const SIENGE_PASSWORD = process.env.SIENGE_PASSWORD!;
  return "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");
}

// Income D + P com o MESMO pos-processamento da rota /api/sienge/income.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarIncome(SIENGE_BASE: string, authHeader: string, START: string, END: string): Promise<any[]> {
  const buildIncomeUrl = (selectionType: string) => {
    const url = new URL(`${SIENGE_BASE}/income`);
    url.searchParams.set("startDate", START);
    url.searchParams.set("endDate", END);
    url.searchParams.set("selectionType", selectionType);
    url.searchParams.set("correctionIndexerId", "0");
    url.searchParams.set("correctionDate", todayISO());
    url.searchParams.set("withAuthorizations", "false");
    url.searchParams.set("withBankMovements", "true");
    return url.toString();
  };
  const respD = await siengeBulkGet(buildIncomeUrl("D"), authHeader);
  if (!respD.ok) throw new Error(`income D: ${respD.status} ${respD.statusText}`);
  const respP = await siengeBulkGet(buildIncomeUrl("P"), authHeader);

  const dataD = await respD.json();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mergedData: any[] = dataD.data || [];

  if (respP.ok) {
    const dataP = await respP.json();
    const itemsP: any[] = dataP.data || [];
    const existingKeys = new Set(mergedData.map((i) => `${i.billId}:${i.installmentId}`));
    for (const item of itemsP) {
      const key = `${item.billId}:${item.installmentId}`;
      if (!existingKeys.has(key)) {
        mergedData.push(item);
        existingKeys.add(key);
      } else {
        const idx = mergedData.findIndex((i) => `${i.billId}:${i.installmentId}` === key);
        if (idx !== -1 && item.receipts?.length > 0 && (!mergedData[idx].receipts || mergedData[idx].receipts.length === 0)) {
          mergedData[idx] = item;
        }
      }
    }
  }

  for (const item of mergedData) {
    if (!item.paymentsCategories && item.receiptsCategories) {
      item.paymentsCategories = item.receiptsCategories;
    }
  }

  interface IncomeReceipt {
    netAmount: number;
    paymentDate?: string;
    operationTypeName?: string;
    bankMovements?: unknown[];
    [key: string]: unknown;
  }
  for (const item of mergedData) {
    const receipts: IncomeReceipt[] = item.receipts || [];
    item.payments = receipts.map((r: IncomeReceipt) => {
      const hasBankMov = r.bankMovements && r.bankMovements.length > 0;
      const liquidoAmount = hasBankMov ? (r.netAmount || 0) : 0;
      return {
        operationTypeId: r.operationTypeName === "Por Bens" ? 11 : 2,
        operationTypeName: r.operationTypeName || "Recebimento",
        netAmount: liquidoAmount,
        paymentDate: r.paymentDate || "",
        grossAmount: r.netAmount || 0,
        monetaryCorrectionAmount: 0,
        interestAmount: 0,
        fineAmount: 0,
        discountAmount: 0,
        taxAmount: 0,
        calculationDate: r.paymentDate || "",
        paymentAuthentication: "",
        sequencialNumber: 0,
        correctedNetAmount: r.netAmount || 0,
      };
    });
    item.receivedNetAmount = receipts.reduce((sum: number, r: IncomeReceipt) => {
      if (r.bankMovements && r.bankMovements.length > 0) {
        return sum + (r.netAmount || 0);
      }
      return sum;
    }, 0);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return mergedData;
}

// Executa o refresh completo. Lanca em erro nas etapas criticas (outcome/income/
// BMs); saldos e best-effort (nao derruba o refresh). Retorna um resumo.
export async function refreshFinanceiroCache(): Promise<Record<string, number | string>> {
  const painel = periodosDoPainel();
  const START = painel.inicio;
  const END = painel.fim;
  const SIENGE_BASE = process.env.SIENGE_BULK_API_URL!;
  const authHeader = autenticacaoSienge();
  const t0 = Date.now();
  const resumo: Record<string, number | string> = {};

  // ── 1. Outcome (mesmos params do painel) ──
  const outcomeUrl = new URL(`${SIENGE_BASE}/outcome`);
  outcomeUrl.searchParams.set("startDate", START);
  outcomeUrl.searchParams.set("endDate", END);
  outcomeUrl.searchParams.set("selectionType", "D");
  outcomeUrl.searchParams.set("correctionIndexerId", "0");
  outcomeUrl.searchParams.set("correctionDate", todayISO());
  outcomeUrl.searchParams.set("withAuthorizations", "false");
  outcomeUrl.searchParams.set("withBankMovements", "true");
  const outResp = await siengeBulkGet(outcomeUrl.toString(), authHeader);
  if (!outResp.ok) throw new Error(`outcome: ${outResp.status} ${outResp.statusText}`);
  const outcomeData = await outResp.json();
  await cacheOutcome(START, END, outcomeData);
  resumo.outcome = (outcomeData?.data || []).length;

  // ── 2. Bank movements avulsos ──
  const bmUrl = new URL(`${SIENGE_BASE}/bank-movement`);
  bmUrl.searchParams.set("startDate", START);
  bmUrl.searchParams.set("endDate", END);
  bmUrl.searchParams.set("selectionType", "M");
  bmUrl.searchParams.set("onlyDetachedMovement", "S");
  const bmResp = await siengeBulkGet(bmUrl.toString(), authHeader);
  if (!bmResp.ok) throw new Error(`bank-movement: ${bmResp.status} ${bmResp.statusText}`);
  const bmData = await bmResp.json();
  await cacheBankMovements(START, END, bmData);
  resumo.bankMovementsAvulsos = (bmData?.data || []).length;

  // ── 3. Income: chave do Painel primeiro, depois a do conector MCP ──
  const incomePainel = await buscarIncome(SIENGE_BASE, authHeader, painel.inicio, painel.fimReceber);
  await cacheIncome(painel.inicio, painel.fimReceber, { data: incomePainel });
  resumo.incomePainel = incomePainel.length;
  const incomeMcp = await buscarIncome(SIENGE_BASE, authHeader, REFRESH_START, REFRESH_END);
  await cacheIncome(REFRESH_START, REFRESH_END, { data: incomeMcp });
  resumo.income = incomeMcp.length;

  // ── 4. Saldos bancarios de ONTEM (cached_daily_balances) ──
  // Mesma logica da aba Saldos: pagina /accounts-balances, completa empresas
  // faltantes e preenche contas DimBanco ausentes com o ultimo valor conhecido.
  try {
    const ontemD = new Date(); ontemD.setDate(ontemD.getDate() - 1);
    const ontem = `${ontemD.getFullYear()}-${String(ontemD.getMonth() + 1).padStart(2, "0")}-${String(ontemD.getDate()).padStart(2, "0")}`;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const allAccounts: any[] = [];
    const firstPage: any = await siengeGet("/accounts-balances", { balanceDate: ontem, offset: "0", limit: "200" });
    const results = firstPage?.results || [];
    const total = firstPage?.resultSetMetadata?.count || results.length;
    allAccounts.push(...results);
    let offset = results.length;
    while (offset < total) {
      const page: any = await siengeGet("/accounts-balances", { balanceDate: ontem, offset: String(offset), limit: "200" });
      const pr = page?.results || [];
      if (pr.length === 0) break;
      allAccounts.push(...pr);
      offset += pr.length;
    }
    // Empresas que nao vieram na paginacao geral
    const companies = await getCachedCompanies();
    const companyIds = companies.map((c) => c.id);
    const seenCompanies = new Set(allAccounts.map((a: any) => a.companyId));
    for (const compId of companyIds.filter((id) => !seenCompanies.has(id))) {
      try {
        const cp: any = await siengeGet("/accounts-balances", { balanceDate: ontem, companyId: String(compId), offset: "0", limit: "100" });
        allAccounts.push(...(cp?.results || []));
      } catch { /* segue */ }
    }

    const mapped: { accountId: string; amount: number }[] = allAccounts.map((a: any) => ({
      accountId: `${a.companyId}:${a.accountNumber}`,
      amount: a.amount ?? 0,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Preenche contas DimBanco ausentes com o ultimo valor conhecido do cache
    const lastKnown: Record<string, number> = {};
    for (let k = 2; k <= 8; k++) {
      const d = new Date(); d.setDate(d.getDate() - k);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const prev = (await getCachedDailyBalance(iso)) as { accountId: string; amount: number }[] | null;
      if (prev) {
        for (const e of prev) if (!(e.accountId in lastKnown)) lastKnown[e.accountId] = e.amount;
        break;
      }
    }
    const seenKeys = new Set(mapped.map((m) => m.accountId));
    for (const ek of expectedDimBancoKeys()) {
      if (!seenKeys.has(ek)) mapped.push({ accountId: ek, amount: lastKnown[ek] ?? 0 });
    }

    // Se o Sienge nao devolveu NENHUMA conta para o dia, o array acima e feito
    // so de valores antigos (lastKnown) — gravar isso produz um saldo identico
    // ao do dia anterior carimbado com a data nova, que foi o que aconteceu em
    // 09/09/2026. Melhor nao gravar o dia: o saldos_bancarios cai sozinho no
    // ultimo dia com dado real e informa a data verdadeira.
    if (allAccounts.length === 0) {
      resumo.saldosAviso = `Sienge nao devolveu saldos para ${ontem} — dia NAO gravado (evita repetir o saldo do dia anterior)`;
      resumo.saldosContas = 0;
    } else {
      await cacheDailyBalance(ontem, mapped);
      resumo.saldosContas = mapped.length;
      resumo.saldosData = ontem;
      const estimadas = mapped.length - allAccounts.length;
      if (estimadas > 0) resumo.saldosEstimados = estimadas;
    }
  } catch (e) {
    // Saldos sao best-effort: nao derruba o refresh principal
    resumo.saldosErro = e instanceof Error ? e.message : String(e);
  }

  resumo.duracaoSegundos = Math.round((Date.now() - t0) / 1000);
  return resumo;
}

// ── Depois da rotina, em segundo plano (quem chamou a rotina não espera) ──
// 1. Movimentos bancários TODOS (chave all:, usada pela DRE e pelas tarifas de
//    cobrança da aba Contas Pagas): a rotina não renovava; venciam em 7 dias e
//    aí o Painel ia buscar 144 MB no Sienge na hora.
// 2. Deixa pronto na memória o gzip das quatro chaves do Painel, para o
//    primeiro a abrir depois da rotina não esperar ~30 s (Edielson, 09/11/2026).
let depoisDaRotina: Promise<void> | null = null;

export function prepararPainelDepoisDaRotina(motivo: string): Promise<void> {
  if (depoisDaRotina) return depoisDaRotina.then(() => prepararCachePainel(motivo));
  depoisDaRotina = (async () => {
    const t0 = Date.now();
    const { inicio, fim } = periodosDoPainel();
    try {
      const url = new URL(`${process.env.SIENGE_BULK_API_URL!}/bank-movement`);
      url.searchParams.set("startDate", inicio);
      url.searchParams.set("endDate", fim);
      url.searchParams.set("selectionType", "M");
      const resp = await siengeBulkGet(url.toString(), autenticacaoSienge());
      if (resp.status === 404) {
        await cacheBankMovements(`all:${inicio}`, `all:${fim}`, { data: [] });
      } else if (!resp.ok) {
        throw new Error(`${resp.status} ${resp.statusText}`);
      } else {
        const dados = await resp.json();
        await cacheBankMovements(`all:${inicio}`, `all:${fim}`, dados);
        console.log(`[rotina] movimentos bancários (todos): ${(dados?.data || []).length} em ${Math.round((Date.now() - t0) / 1000)} s`);
      }
    } catch (e) {
      console.error("[rotina] movimentos bancários (todos) falhou:", e instanceof Error ? e.message : e);
    }
    await prepararCachePainel(motivo);
  })().finally(() => {
    depoisDaRotina = null;
  });
  return depoisDaRotina;
}
