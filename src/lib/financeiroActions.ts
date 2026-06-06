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
  getCachedCompanies,
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

// Aceita "YYYY-MM-DD" ou "DD/MM/YYYY" e normaliza para ISO (YYYY-MM-DD).
function parseDataISO(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return undefined;
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
// 'de'/'ate' filtram por janela de VENCIMENTO; 'detalhar' lista as parcelas.
export async function resumoContasPagar(
  args: { empresa?: string; agruparPorCredor?: boolean; de?: string; ate?: string; detalhar?: boolean; limit?: number } = {}
) {
  const hoje = todayISO();
  const de = parseDataISO(args.de);
  const ate = parseDataISO(args.ate);
  const cache = await getCachedOutcomeContaining("2023-01-01", "2027-12-31");
  const items = extractItems(cache) as (OutcomeItem & { billId?: number; installmentId?: number })[];

  const porEmpresa = new Map<string, { aPagar: number; vencidas: number; qtdAPagar: number; qtdVencidas: number }>();
  const porCredor = new Map<string, { aPagar: number; vencidas: number }>();
  type ParcelaDet = { credor: string; empresa: string; titulo: number | null; parcela: number | null; documento: string | null; vencimento: string; valor: number; valor_fmt: string };
  const parcelasDet: ParcelaDet[] = [];
  let totalAPagar = 0, totalVencidas = 0, qtdAPagar = 0, qtdVencidas = 0;

  for (const i of items) {
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument)) continue;
    if (isHolding(i.companyName)) continue;
    if (!matchEmpresa(i.companyName, args.empresa)) continue;
    const venc = i.dueDate ? String(i.dueDate).split("T")[0] : "";
    if (de && (!venc || venc < de)) continue;
    if (ate && (!venc || venc > ate)) continue;
    const eff = effectiveOpenAmount(i, false);
    if (eff <= 0) continue;

    if (args.detalhar) {
      parcelasDet.push({
        credor: i.creditorName || "(sem credor)", empresa: i.companyName || "(sem empresa)",
        titulo: i.billId ?? null, parcela: i.installmentId ?? null,
        documento: i.documentIdentificationName ?? null, vencimento: venc,
        valor: eff, valor_fmt: fmtBRL(eff),
      });
    }

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

  if (args.detalhar) {
    parcelasDet.sort((a, b) => a.vencimento === b.vencimento ? b.valor - a.valor : a.vencimento.localeCompare(b.vencimento));
  }

  return {
    referencia: hoje,
    cacheAtualizadoEm: cache?.cachedAt ?? null,
    filtros: { empresa: args.empresa ?? null, de: de ?? null, ate: ate ?? null },
    totais: {
      aPagar: totalAPagar, aPagar_fmt: fmtBRL(totalAPagar), qtdAPagar,
      vencidas: totalVencidas, vencidas_fmt: fmtBRL(totalVencidas), qtdVencidas,
      total: totalAPagar + totalVencidas, total_fmt: fmtBRL(totalAPagar + totalVencidas),
    },
    porEmpresa: empresas,
    ...(credores ? { porCredor: credores } : {}),
    ...(args.detalhar ? { parcelas: parcelasDet.slice(0, args.limit ?? 100) } : {}),
  };
}

// ── 2. Resumo Contas a Receber ──────────────────────────────────────────────
// A receber = saldo aberto (effectiveOpenAmount isIncome=true, sem subtrair
// taxAmount). Inadimplencia = aberto com dueDate < hoje. Exclui Holding/Admin.
export async function resumoContasReceber(
  args: { empresa?: string; agruparPorCliente?: boolean; de?: string; ate?: string; detalhar?: boolean; limit?: number } = {}
) {
  const hoje = todayISO();
  const de = parseDataISO(args.de);
  const ate = parseDataISO(args.ate);
  const cache = await getCachedIncomeContaining("2023-01-01", "2027-12-31");
  const items = extractItems(cache) as (OutcomeItem & { clientName?: string; billId?: number; installmentId?: number })[];

  const porEmpresa = new Map<string, { aReceber: number; inadimplencia: number; qtd: number; qtdInad: number }>();
  const porCliente = new Map<string, { aReceber: number; inadimplencia: number }>();
  type ParcelaDet = { cliente: string; empresa: string; titulo: number | null; parcela: number | null; documento: string | null; vencimento: string; valor: number; valor_fmt: string };
  const parcelasDet: ParcelaDet[] = [];
  let totalReceber = 0, totalInad = 0, qtd = 0, qtdInad = 0;

  for (const i of items) {
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument)) continue;
    if (isHolding(i.companyName)) continue;
    if (!matchEmpresa(i.companyName, args.empresa)) continue;
    const venc = i.dueDate ? String(i.dueDate).split("T")[0] : "";
    if (de && (!venc || venc < de)) continue;
    if (ate && (!venc || venc > ate)) continue;
    const eff = effectiveOpenAmount(i, true);
    if (eff <= 0) continue;

    if (args.detalhar) {
      parcelasDet.push({
        cliente: i.clientName || i.creditorName || "(sem cliente)", empresa: i.companyName || "(sem empresa)",
        titulo: i.billId ?? null, parcela: i.installmentId ?? null,
        documento: i.documentIdentificationName ?? null, vencimento: venc,
        valor: eff, valor_fmt: fmtBRL(eff),
      });
    }

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

  if (args.detalhar) {
    parcelasDet.sort((a, b) => a.vencimento === b.vencimento ? b.valor - a.valor : a.vencimento.localeCompare(b.vencimento));
  }

  return {
    referencia: hoje,
    cacheAtualizadoEm: cache?.cachedAt ?? null,
    filtros: { empresa: args.empresa ?? null, de: de ?? null, ate: ate ?? null },
    totais: {
      aReceber: totalReceber, aReceber_fmt: fmtBRL(totalReceber), qtd,
      inadimplencia: totalInad, inadimplencia_fmt: fmtBRL(totalInad), qtdInad,
    },
    porEmpresa: empresas,
    ...(clientes ? { porCliente: clientes } : {}),
    ...(args.detalhar ? { parcelas: parcelasDet.slice(0, args.limit ?? 100) } : {}),
    nota: "v1: 'a receber' = saldo aberto; inadimplencia = aberto vencido. 'Recebidas' (pagas) sera adicionado apos validar o shape de income.payments.",
  };
}

// ── 2b. Inadimplencia detalhada ─────────────────────────────────────────────
// Parcelas de income VENCIDAS e em aberto, com cliente, empresa, vencimento e
// dias de atraso. Mesmos filtros/formula do resumoContasReceber.
export async function inadimplenciaDetalhe(
  args: { empresa?: string; cliente?: string; minDias?: number; limit?: number } = {}
) {
  const hoje = todayISO();
  const hojeMs = new Date(`${hoje}T12:00:00`).getTime();
  const cache = await getCachedIncomeContaining("2023-01-01", "2027-12-31");
  const items = extractItems(cache) as (OutcomeItem & {
    clientName?: string; billId?: number; installmentId?: number;
  })[];

  type Parcela = {
    cliente: string; empresa: string; titulo: number | null; parcela: number | null;
    documento: string | null; vencimento: string; diasAtraso: number;
    valor: number; valor_fmt: string;
  };
  const parcelas: Parcela[] = [];

  for (const i of items) {
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate >= hoje) continue; // so vencidas
    if (isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument)) continue;
    if (isHolding(i.companyName)) continue;
    if (!matchEmpresa(i.companyName, args.empresa)) continue;
    const cliente = i.clientName || i.creditorName || "(sem cliente)";
    if (args.cliente && !normalizeFilterText(cliente).includes(normalizeFilterText(args.cliente))) continue;
    const eff = effectiveOpenAmount(i, true);
    if (eff <= 0) continue;
    const vencMs = new Date(`${String(i.dueDate).split("T")[0]}T12:00:00`).getTime();
    const diasAtraso = Math.max(0, Math.floor((hojeMs - vencMs) / 86400000));
    if (args.minDias && diasAtraso < args.minDias) continue;
    parcelas.push({
      cliente, empresa: i.companyName || "(sem empresa)",
      titulo: i.billId ?? null, parcela: i.installmentId ?? null,
      documento: i.documentIdentificationName ?? null,
      vencimento: String(i.dueDate).split("T")[0], diasAtraso,
      valor: eff, valor_fmt: fmtBRL(eff),
    });
  }

  parcelas.sort((a, b) => b.valor - a.valor);

  const porCliente = new Map<string, { total: number; qtd: number; maxAtraso: number; empresas: Set<string> }>();
  let total = 0;
  for (const p of parcelas) {
    total += p.valor;
    if (!porCliente.has(p.cliente)) porCliente.set(p.cliente, { total: 0, qtd: 0, maxAtraso: 0, empresas: new Set() });
    const c = porCliente.get(p.cliente)!;
    c.total += p.valor; c.qtd++; c.maxAtraso = Math.max(c.maxAtraso, p.diasAtraso);
    c.empresas.add(p.empresa);
  }

  const clientes = Array.from(porCliente.entries())
    .map(([nome, v]) => ({
      cliente: nome, total: v.total, total_fmt: fmtBRL(v.total), qtdParcelas: v.qtd,
      maiorAtrasoDias: v.maxAtraso, empresas: Array.from(v.empresas),
    }))
    .sort((a, b) => b.total - a.total);

  const limit = args.limit ?? 100;
  return {
    referencia: hoje,
    cacheAtualizadoEm: cache?.cachedAt ?? null,
    filtros: { empresa: args.empresa ?? null, cliente: args.cliente ?? null, minDias: args.minDias ?? null },
    totais: { valor: total, valor_fmt: fmtBRL(total), qtdParcelas: parcelas.length, qtdClientes: clientes.length },
    porCliente: clientes,
    parcelas: parcelas.slice(0, limit),
  };
}

// ── 2c. Pagas e Recebidas por dia/periodo ───────────────────────────────────
// Regra validada do Painel ("Realizado"/Contas Pagas): soma netAmount dos
// payments, excluindo PREVISAO e op types substituicao/cancelamento/abatimento/
// devolucao/por bens/permuta. Recebidas: payments de income com netAmount > 0
// (regra do Resumo Financeiro). NAO inclui BMs avulsos (v2).
export async function pagasRecebidasDia(
  args: { dia?: string; de?: string; ate?: string; empresa?: string; detalhar?: boolean; limit?: number } = {}
) {
  const ontemD = new Date(); ontemD.setDate(ontemD.getDate() - 1);
  const ontem = `${ontemD.getFullYear()}-${String(ontemD.getMonth() + 1).padStart(2, "0")}-${String(ontemD.getDate()).padStart(2, "0")}`;
  const de = parseDataISO(args.de) || parseDataISO(args.dia) || ontem;
  const ate = parseDataISO(args.ate) || parseDataISO(args.dia) || ontem;

  const EXCLUDED_OPS = ["substitui", "cancelamento", "abatimento", "devolu", "por bens", "permuta"];
  type Pay = { paymentDate?: string; netAmount?: number; operationTypeName?: string };
  type Receipt = { paymentDate?: string; date?: string; netAmount?: number; operationTypeName?: string; bankMovements?: unknown[] };
  type Item = OutcomeItem & { payments?: Pay[]; receipts?: Receipt[]; clientName?: string; billId?: number; installmentId?: number };

  function noPeriodo(p: { paymentDate?: string }): string | null {
    const d = p.paymentDate ? String(p.paymentDate).split("T")[0] : "";
    return d && d >= de && d <= ate ? d : null;
  }

  type Det = { quem: string; empresa: string; titulo: number | null; data: string; tipoOp: string | null; valor: number; valor_fmt: string };

  function processa(items: Item[], isIncome: boolean) {
    const porEmpresa = new Map<string, { total: number; qtd: number }>();
    const det: Det[] = [];
    let total = 0, qtd = 0;
    for (const i of items) {
      if (isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument)) continue;
      if (isHolding(i.companyName)) continue;
      if (!matchEmpresa(i.companyName, args.empresa)) continue;
      // income do cache pode vir com payments (rota ja mapeia) ou so receipts
      const pays: Pay[] = i.payments && i.payments.length > 0
        ? i.payments
        : (i.receipts || []).map((r) => ({
            paymentDate: r.paymentDate || r.date,
            netAmount: (r.bankMovements && r.bankMovements.length > 0) ? (r.netAmount || 0) : 0,
            operationTypeName: r.operationTypeName || "Recebimento",
          }));
      for (const p of pays) {
        const data = noPeriodo(p);
        if (!data) continue;
        const v = p.netAmount || 0;
        if (v === 0) continue;
        if (isIncome) {
          if (v < 0) continue; // regra Resumo Financeiro: recebidas = netAmount > 0
        } else {
          const op = (p.operationTypeName || "").toLowerCase();
          if (EXCLUDED_OPS.some((x) => op.includes(x))) continue;
        }
        const co = i.companyName || "(sem empresa)";
        if (!porEmpresa.has(co)) porEmpresa.set(co, { total: 0, qtd: 0 });
        const e = porEmpresa.get(co)!;
        e.total += v; e.qtd++; total += v; qtd++;
        if (args.detalhar) {
          det.push({
            quem: (isIncome ? i.clientName : i.creditorName) || i.creditorName || "(sem nome)",
            empresa: co, titulo: i.billId ?? null, data,
            tipoOp: p.operationTypeName ?? null, valor: v, valor_fmt: fmtBRL(v),
          });
        }
      }
    }
    det.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    return {
      total, total_fmt: fmtBRL(total), qtd,
      porEmpresa: Array.from(porEmpresa.entries())
        .map(([nome, v]) => ({ empresa: nome, total: v.total, total_fmt: fmtBRL(v.total), qtd: v.qtd }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      ...(args.detalhar ? { lancamentos: det.slice(0, args.limit ?? 60) } : {}),
    };
  }

  const outCache = await getCachedOutcomeContaining("2023-01-01", "2027-12-31");
  const incCache = await getCachedIncomeContaining("2023-01-01", "2027-12-31");
  const pagas = processa(extractItems(outCache) as Item[], false);
  const recebidas = processa(extractItems(incCache) as Item[], true);

  return {
    periodo: { de, ate },
    cachePagasAtualizadoEm: outCache?.cachedAt ?? null,
    cacheRecebidasAtualizadoEm: incCache?.cachedAt ?? null,
    avisoFrescor: "Os valores refletem o cache populado pelo Painel. Se o cache for anterior ao fim do periodo consultado, pagamentos/recebimentos podem estar incompletos — abrir o Painel atualiza.",
    pagas,
    recebidas,
    saldoDoDia: { liquido: pagas.total > 0 || recebidas.total > 0 ? recebidas.total - pagas.total : 0, liquido_fmt: fmtBRL(recebidas.total - pagas.total) },
    nota: "Nao inclui movimentos bancarios avulsos (sem titulo) — entram numa v2.",
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

  // Cada linha do cache e { accountId: "companyId:accountNumber", amount }
  // (shape gravado por src/app/api/sienge/bank-accounts/route.ts).
  const companies = await getCachedCompanies();
  const companyName = new Map<string, string>(companies.map((c) => [String(c.id), c.name]));

  type Bal = { accountId?: string; amount?: number };
  const porEmpresa = new Map<string, { saldo: number; contas: { conta: string; saldo: number; saldo_fmt: string }[] }>();
  let total = 0;
  for (const r of achou.rows as Bal[]) {
    const [cid, ...rest] = String(r.accountId || "").split(":");
    const conta = rest.join(":") || "?";
    const co = companyName.get(cid) || `Empresa ${cid || "?"}`;
    if (!matchEmpresa(co, args.empresa)) continue;
    if (!porEmpresa.has(co)) porEmpresa.set(co, { saldo: 0, contas: [] });
    const e = porEmpresa.get(co)!;
    const s = r.amount || 0;
    e.saldo += s; total += s;
    e.contas.push({ conta, saldo: s, saldo_fmt: fmtBRL(s) });
  }

  const empresas = Array.from(porEmpresa.entries())
    .map(([nome, v]) => ({
      empresa: nome, saldo: v.saldo, saldo_fmt: fmtBRL(v.saldo),
      contas: v.contas.sort((a, b) => b.saldo - a.saldo),
    }))
    .sort((a, b) => b.saldo - a.saldo);

  return {
    dataSaldo: achou.date,
    totalGeral: total, totalGeral_fmt: fmtBRL(total),
    filtroEmpresa: args.empresa ?? null,
    porEmpresa: empresas,
    nota: "Saldo do ultimo dia salvo no cache (dias passados; o dia corrente so entra no cache no dia seguinte). Para atualizar, abrir a aba Saldos no Painel.",
  };
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

export async function dreResumo(args: { ano?: string; categoria?: string } = {}) {
  const ano = args.ano || String(new Date().getFullYear());
  const accounts = await getDreExcelData(ano, undefined, undefined, ["SILVA ADMINISTRADORA HOLDING LTDA"]);
  const porCategoria = new Map<string, number>();
  for (const a of accounts) {
    porCategoria.set(a.dreCategory, (porCategoria.get(a.dreCategory) || 0) + (a.amount || 0));
  }

  // ── Drill-down de uma categoria: por conta financeira e por empresa ──
  if (args.categoria) {
    const alvoNorm = normalizeFilterText(args.categoria);
    const chave = Array.from(new Set(accounts.map((a) => a.dreCategory))).find(
      (k) => k === args.categoria ||
        normalizeFilterText(k).includes(alvoNorm) ||
        normalizeFilterText(DRE_CATEGORIA_LABEL[k] || "").includes(alvoNorm)
    );
    if (!chave) {
      return { ano, erro: `Categoria '${args.categoria}' nao encontrada. Disponiveis: ${Array.from(porCategoria.keys()).join(", ")}` };
    }
    const doCat = accounts.filter((a) => a.dreCategory === chave);
    const porConta = new Map<string, { nome: string; valor: number }>();
    const porEmp = new Map<string, number>();
    for (const a of doCat) {
      const cid = a.financialPlanId || "?";
      if (!porConta.has(cid)) porConta.set(cid, { nome: a.financialPlanName || cid, valor: 0 });
      porConta.get(cid)!.valor += a.amount || 0;
      porEmp.set(a.companyName || "(sem)", (porEmp.get(a.companyName || "(sem)") || 0) + (a.amount || 0));
    }
    return {
      ano,
      categoria: DRE_CATEGORIA_LABEL[chave] || chave,
      chave,
      total: porCategoria.get(chave) || 0,
      total_fmt: fmtBRL(porCategoria.get(chave) || 0),
      porContaFinanceira: Array.from(porConta.entries())
        .map(([id, v]) => ({ contaId: id, conta: v.nome, valor: v.valor, valor_fmt: fmtBRL(v.valor) }))
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 40),
      porEmpresa: Array.from(porEmp.entries())
        .map(([nome, v]) => ({ empresa: nome, valor: v, valor_fmt: fmtBRL(v) }))
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
    };
  }

  const linhas = Array.from(porCategoria.entries()).map(([cat, valor]) => ({
    categoria: DRE_CATEGORIA_LABEL[cat] || cat, chave: cat, valor, valor_fmt: fmtBRL(valor),
  }));

  // Linhas calculadas (mesmas formulas do Painel/dre-tab), so quando a
  // categoria correspondente nao veio do Excel — evita duplicar.
  const g = (k: string) => porCategoria.get(k) || 0;
  const calc: { categoria: string; chave: string; valor: number; valor_fmt: string; calculada: true }[] = [];
  const addCalc = (chave: string, valor: number) => {
    if (!porCategoria.has(chave)) calc.push({ categoria: DRE_CATEGORIA_LABEL[chave] || chave, chave, valor, valor_fmt: fmtBRL(valor), calculada: true });
  };
  const lucroBruto = g("receita_operacional") + g("custo_variavel");
  const lucroOperacional = lucroBruto + g("custo_fixo");
  const lucroLiquido = lucroOperacional + g("despesas_financeiras") + g("despesas_tributarias");
  const saldo = lucroLiquido + g("imobilizacoes") + g("retiradas");
  const variacaoCaixa = saldo + g("entradas_nao_operacionais") + g("saidas_nao_operacionais");
  addCalc("lucro_bruto", lucroBruto);
  addCalc("lucro_operacional", lucroOperacional);
  addCalc("lucro_liquido", lucroLiquido);
  addCalc("saldo", saldo);
  addCalc("variacao_caixa", variacaoCaixa);

  return {
    ano,
    observacao: "Consolidado de todas as empresas exceto Holding (igual ao Painel/Power BI). Linhas com 'calculada: true' seguem as formulas do Painel. Use 'categoria' para drill-down por conta financeira e empresa.",
    linhas: [...linhas, ...calc],
  };
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
