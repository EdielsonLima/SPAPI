// Acoes do conector MCP financeiro (spapi). Funcoes server-side que produzem
// RESUMOS a partir do cache PostgreSQL populado pelo Painel, reusando as
// formulas JA VALIDADAS (effectiveOpenAmount, isExcludedFinancialDocType).
// Nao recalcula regras novas — espelha o que o Painel mostra na tela.
//
// Consumido por src/app/api/mcp/route.ts (JSON-RPC / Streamable HTTP).
import {
  getCachedOutcomeContaining,
  getCachedIncomeContaining,
  getCachedDailyBalance,
  getDreExcelData,
  getIndicadoresCub,
  getIndicadoresValorM2,
  getCompanySettings,
} from "@/lib/db";
import {
  effectiveOpenAmount,
  isExcludedFinancialDocType,
  normalizeFilterText,
} from "@/lib/dashboard-utils";

// ── helpers ───────────────────────────────────────────────────────────────
function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

// Empresas tipo Holding/Administradora sao excluidas dos resumos operacionais,
// igual aos fetches de DRE do Painel (excludeCompanies=SILVA ADMINISTRADORA HOLDING).
function isHolding(name: string | null | undefined): boolean {
  const u = normalizeFilterText(name);
  return u.includes("HOLDING") || u.includes("ADMINISTRADORA");
}

type OutcomeItem = {
  companyId?: number;
  companyName?: string;
  creditorId?: number;
  creditorName?: string;
  correctedBalanceAmount?: number;
  originalAmount?: number;
  discountAmount?: number;
  taxAmount?: number;
  dueDate?: string;
  documentIdentificationName?: string;
  forecastDocument?: string | null;
};

function extractItems(cache: { data: unknown } | null): OutcomeItem[] {
  if (!cache) return [];
  const d = cache.data as { data?: OutcomeItem[] } | OutcomeItem[] | null;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray((d as { data?: OutcomeItem[] }).data)) return (d as { data: OutcomeItem[] }).data;
  return [];
}

function matchEmpresa(name: string | null | undefined, filtro?: string): boolean {
  if (!filtro) return true;
  return normalizeFilterText(name).includes(normalizeFilterText(filtro));
}

// ── 1. Resumo Contas a Pagar ────────────────────────────────────────────────
// Formula do Painel: effectiveOpenAmount (correctedBalanceAmount - discount -
// taxAmount quando integralmente aberta). A pagar = dueDate >= hoje; Vencidas =
// dueDate < hoje. Exclui PREVISAO e empresas Holding/Administradora.
export async function resumoContasPagar(args: { empresa?: string; agruparPorCredor?: boolean } = {}) {
  const hoje = todayISO();
  const cache = await getCachedOutcomeContaining("2023-01-01", "2027-12-31");
  const items = extractItems(cache);

  const porEmpresa = new Map<string, { aPagar: number; vencidas: number; qtdAPagar: number; qtdVencidas: number }>();
  const porCredor = new Map<string, { aPagar: number; vencidas: number }>();
  let totalAPagar = 0, totalVencidas = 0, qtdAPagar = 0, qtdVencidas = 0;

  for (const i of items) {
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument)) continue;
    if (isHolding(i.companyName)) continue;
    if (!matchEmpresa(i.companyName, args.empresa)) continue;
    const eff = effectiveOpenAmount(i, false);
    if (eff <= 0) continue;

    const vencida = !!i.dueDate && i.dueDate < hoje;
    const co = i.companyName || "(sem empresa)";
    if (!porEmpresa.has(co)) porEmpresa.set(co, { aPagar: 0, vencidas: 0, qtdAPagar: 0, qtdVencidas: 0 });
    const e = porEmpresa.get(co)!;
    if (vencida) { e.vencidas += eff; e.qtdVencidas++; totalVencidas += eff; qtdVencidas++; }
    else { e.aPagar += eff; e.qtdAPagar++; totalAPagar += eff; qtdAPagar++; }

    if (args.agruparPorCredor) {
      const cr = i.creditorName || "(sem credor)";
      if (!porCredor.has(cr)) porCredor.set(cr, { aPagar: 0, vencidas: 0 });
      const c = porCredor.get(cr)!;
      if (vencida) c.vencidas += eff; else c.aPagar += eff;
    }
  }

  const empresas = Array.from(porEmpresa.entries())
    .map(([nome, v]) => ({ empresa: nome, ...v, total: v.aPagar + v.vencidas,
      aPagar_fmt: fmtBRL(v.aPagar), vencidas_fmt: fmtBRL(v.vencidas) }))
    .sort((a, b) => b.total - a.total);

  const credores = args.agruparPorCredor
    ? Array.from(porCredor.entries())
        .map(([nome, v]) => ({ credor: nome, ...v, total: v.aPagar + v.vencidas, total_fmt: fmtBRL(v.aPagar + v.vencidas) }))
        .sort((a, b) => b.total - a.total).slice(0, 30)
    : undefined;

  return {
    referencia: hoje,
    cacheAtualizadoEm: cache?.cachedAt ?? null,
    filtroEmpresa: args.empresa ?? null,
    totais: {
      aPagar: totalAPagar, aPagar_fmt: fmtBRL(totalAPagar), qtdAPagar,
      vencidas: totalVencidas, vencidas_fmt: fmtBRL(totalVencidas), qtdVencidas,
      total: totalAPagar + totalVencidas, total_fmt: fmtBRL(totalAPagar + totalVencidas),
    },
    porEmpresa: empresas,
    ...(credores ? { porCredor: credores } : {}),
  };
}

// ── 2. Resumo Contas a Receber ──────────────────────────────────────────────
// A receber = saldo aberto (effectiveOpenAmount isIncome=true, sem subtrair
// taxAmount). Inadimplencia = aberto com dueDate < hoje. Exclui Holding/Admin.
export async function resumoContasReceber(args: { empresa?: string; agruparPorCliente?: boolean } = {}) {
  const hoje = todayISO();
  const cache = await getCachedIncomeContaining("2023-01-01", "2027-12-31");
  const items = extractItems(cache) as (OutcomeItem & { clientName?: string })[];

  const porEmpresa = new Map<string, { aReceber: number; inadimplencia: number; qtd: number; qtdInad: number }>();
  const porCliente = new Map<string, { aReceber: number; inadimplencia: number }>();
  let totalReceber = 0, totalInad = 0, qtd = 0, qtdInad = 0;

  for (const i of items) {
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument)) continue;
    if (isHolding(i.companyName)) continue;
    if (!matchEmpresa(i.companyName, args.empresa)) continue;
    const eff = effectiveOpenAmount(i, true);
    if (eff <= 0) continue;

    const inad = !!i.dueDate && i.dueDate < hoje;
    const co = i.companyName || "(sem empresa)";
    if (!porEmpresa.has(co)) porEmpresa.set(co, { aReceber: 0, inadimplencia: 0, qtd: 0, qtdInad: 0 });
    const e = porEmpresa.get(co)!;
    e.aReceber += eff; e.qtd++; totalReceber += eff; qtd++;
    if (inad) { e.inadimplencia += eff; e.qtdInad++; totalInad += eff; qtdInad++; }

    if (args.agruparPorCliente) {
      const cl = i.clientName || (i as { creditorName?: string }).creditorName || "(sem cliente)";
      if (!porCliente.has(cl)) porCliente.set(cl, { aReceber: 0, inadimplencia: 0 });
      const c = porCliente.get(cl)!;
      c.aReceber += eff; if (inad) c.inadimplencia += eff;
    }
  }

  const empresas = Array.from(porEmpresa.entries())
    .map(([nome, v]) => ({ empresa: nome, ...v, aReceber_fmt: fmtBRL(v.aReceber), inadimplencia_fmt: fmtBRL(v.inadimplencia) }))
    .sort((a, b) => b.aReceber - a.aReceber);

  const clientes = args.agruparPorCliente
    ? Array.from(porCliente.entries())
        .map(([nome, v]) => ({ cliente: nome, ...v, aReceber_fmt: fmtBRL(v.aReceber) }))
        .sort((a, b) => b.aReceber - a.aReceber).slice(0, 30)
    : undefined;

  return {
    referencia: hoje,
    cacheAtualizadoEm: cache?.cachedAt ?? null,
    filtroEmpresa: args.empresa ?? null,
    totais: {
      aReceber: totalReceber, aReceber_fmt: fmtBRL(totalReceber), qtd,
      inadimplencia: totalInad, inadimplencia_fmt: fmtBRL(totalInad), qtdInad,
    },
    porEmpresa: empresas,
    ...(clientes ? { porCliente: clientes } : {}),
    nota: "v1: 'a receber' = saldo aberto; inadimplencia = aberto vencido. 'Recebidas' (pagas) sera adicionado apos validar o shape de income.payments.",
  };
}

// ── 3. Saldos Bancarios ─────────────────────────────────────────────────────
// Le o cache de saldos diarios (cached_daily_balances). Procura o dia mais
// recente disponivel (ate 10 dias atras). currentBalance por conta/empresa.
export async function saldosBancarios(args: { empresa?: string } = {}) {
  let achou: { date: string; rows: unknown[] } | null = null;
  const d0 = new Date();
  for (let k = 0; k < 10 && !achou; k++) {
    const d = new Date(d0); d.setDate(d.getDate() - k);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = await getCachedDailyBalance(iso);
    if (rows && rows.length > 0) achou = { date: iso, rows };
  }
  if (!achou) return { erro: "Sem cache de saldos bancarios. Abra a aba Saldos no Painel para popular o cache." };

  type Bal = { companyName?: string; bankName?: string; accountNumber?: string; currentBalance?: number };
  const porEmpresa = new Map<string, { saldo: number; contas: { banco: string; conta: string; saldo: number; saldo_fmt: string }[] }>();
  let total = 0;
  for (const r of achou.rows as Bal[]) {
    if (!matchEmpresa(r.companyName, args.empresa)) continue;
    const co = r.companyName || "(sem empresa)";
    if (!porEmpresa.has(co)) porEmpresa.set(co, { saldo: 0, contas: [] });
    const e = porEmpresa.get(co)!;
    const s = r.currentBalance || 0;
    e.saldo += s; total += s;
    e.contas.push({ banco: r.bankName || "?", conta: r.accountNumber || "?", saldo: s, saldo_fmt: fmtBRL(s) });
  }

  const empresas = Array.from(porEmpresa.entries())
    .map(([nome, v]) => ({ empresa: nome, saldo: v.saldo, saldo_fmt: fmtBRL(v.saldo), contas: v.contas }))
    .sort((a, b) => b.saldo - a.saldo);

  return { dataSaldo: achou.date, totalGeral: total, totalGeral_fmt: fmtBRL(total), filtroEmpresa: args.empresa ?? null, porEmpresa: empresas };
}

// ── 4. DRE / Indicadores ────────────────────────────────────────────────────
// DRE consolidada por categoria (ano), excluindo Holding (igual ao Painel).
const DRE_CATEGORIA_LABEL: Record<string, string> = {
  receita_operacional: "Receita Operacional", custo_variavel: "Custo Variavel",
  lucro_bruto: "Lucro Bruto", custo_fixo: "Custo Fixo", lucro_operacional: "Lucro Operacional",
  despesas_financeiras: "Despesas Financeiras", despesas_tributarias: "Despesas Tributarias",
  lucro_liquido: "Lucro Liquido", imobilizacoes: "Imobilizacoes", retiradas: "Retiradas",
  saldo: "Saldo", entradas_nao_operacionais: "Entradas nao Operacionais",
  saidas_nao_operacionais: "Saidas nao Operacionais", variacao_caixa: "Variacao de Caixa",
};

export async function dreResumo(args: { ano?: string } = {}) {
  const ano = args.ano || String(new Date().getFullYear());
  const accounts = await getDreExcelData(ano, undefined, undefined, ["SILVA ADMINISTRADORA HOLDING LTDA"]);
  const porCategoria = new Map<string, number>();
  for (const a of accounts as { dreCategory: string; amount: number }[]) {
    porCategoria.set(a.dreCategory, (porCategoria.get(a.dreCategory) || 0) + (a.amount || 0));
  }
  const linhas = Array.from(porCategoria.entries()).map(([cat, valor]) => ({
    categoria: DRE_CATEGORIA_LABEL[cat] || cat, chave: cat, valor, valor_fmt: fmtBRL(valor),
  }));
  return { ano, observacao: "Consolidado de todas as empresas exceto Holding (igual ao Painel/Power BI).", linhas };
}

export async function indicadoresResumo() {
  const cub = await getIndicadoresCub();
  const valorM2 = await getIndicadoresValorM2();
  const ultCub = cub.length ? cub[cub.length - 1] : null;
  const ultM2 = valorM2.length ? valorM2[valorM2.length - 1] : null;
  return {
    cub: ultCub ? {
      valorM2: ultCub.valor_m2, valorM2_fmt: fmtBRL(ultCub.valor_m2),
      variacaoMensalPct: ultCub.variacao_pct, variacaoAnualPct: ultCub.variacao_anual_pct,
      mesRef: { ano: ultCub.ano, mes: ultCub.mes },
    } : null,
    valorM2: ultM2 ?? null,
  };
}

// ── catalogo de empresas (auxiliar p/ a IA saber os nomes/filtros validos) ──
export async function listarEmpresas() {
  const settings = await getCompanySettings();
  return {
    empresas: settings.map((s) => ({
      companyId: s.companyId, nome: s.companyName,
      status: (s as { status?: string }).status ?? null,
    })),
  };
}
