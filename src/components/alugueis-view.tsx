"use client";

/**
 * Controle de Locacoes (Alugueis) — pagina EXCLUSIVA do modo Holding.
 *
 * ARQUIVO ISOLADO: nao e importado por nenhuma tela das demais empresas.
 * A unica coisa que este componente compartilha com o resto do sistema e a
 * LEITURA de /api/sienge/income (mesmo intervalo de datas das Contas a Receber,
 * pra reaproveitar o cache do banco). Nao escreve nada, nao altera filtros
 * salvos de outras telas e usa chaves de localStorage proprias ("alugueis_*").
 *
 * Regras de negocio e validacao: ver src/lib/alugueis-utils.ts.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ChevronRight,
  CheckCircle2,
  FileSignature,
  Home,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyMode } from "@/lib/company-context";
import { formatCurrency, formatDate, formatCompactCurrency } from "@/lib/dashboard-utils";
import {
  MESES_CURTOS,
  ROTULO_PERFIL,
  agruparContratos,
  TOLERANCIAS_BAIXA,
  TOLERANCIA_BAIXA_PADRAO,
  diasEmAtraso,
  mapaPagadores,
  resumoImovel,
  hojeISO,
  isAluguel,
  nomeCurtoEmpresa,
  nomeImovel,
  saldoAberto,
  type PerfilPagador,
  type ResumoPagador,
} from "@/lib/alugueis-utils";
import { AlugueisContratos } from "@/components/alugueis-contratos";
import { SiengeIncome } from "@/types/sienge";
import { cn } from "@/lib/utils";

type Aba = "receber" | "realizado" | "contratos";
type Status = "todos" | "vencido" | "avencer";

interface LinhaReceber {
  key: string;
  dueDate: string;
  imovel: string;
  cliente: string;
  empresa: string;
  dias: number;
  valor: number;
  item: SiengeIncome;
}

interface LinhaRealizado {
  key: string;
  data: string;
  imovel: string;
  cliente: string;
  empresa: string;
  valor: number;
  item: SiengeIncome;
}

const CORES_EMPRESA = ["#2563eb", "#0ea5e9", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef4444"];
const POR_PAGINA = 50;

export function AlugueisView() {
  const { isHolding } = useCompanyMode();
  const hoje = useMemo(() => hojeISO(), []);
  const anoAtual = new Date().getFullYear();

  const [items, setItems] = useState<SiengeIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [aba, setAba] = useState<Aba>("receber");
  const [anos, setAnos] = useState<Set<number>>(() => new Set([anoAtual]));
  const [meses, setMeses] = useState<Set<number>>(() => new Set());
  const [empresas, setEmpresas] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<Status>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [tolerancia, setTolerancia] = useState(TOLERANCIA_BAIXA_PADRAO);

  // Mesmo intervalo usado pelas Contas a Receber — reaproveita o cache do banco
  // em vez de disparar uma nova consulta ao Sienge.
  const { startDate, endDate } = useMemo(
    () => ({ startDate: `${anoAtual - 10}-01-01`, endDate: `${anoAtual + 15}-12-31` }),
    [anoAtual]
  );

  const carregar = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setAtualizando(true);
      else setLoading(true);
      setErro(null);
      try {
        const url = `/api/sienge/income?startDate=${startDate}&endDate=${endDate}${forceRefresh ? "&forceRefresh=true" : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Falha ao carregar (${res.status})`);
        const json: { data?: SiengeIncome[]; cachedAt?: string } = await res.json();
        setItems((json.data || []).filter(isAluguel));
        setCachedAt(json.cachedAt || null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar alugueis");
      } finally {
        setLoading(false);
        setAtualizando(false);
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setPagina(0);
    setExpandida(null);
  }, [aba, anos, meses, empresas, status, busca]);

  const empresasDisponiveis = useMemo(
    () => Array.from(new Set(items.map((i) => i.companyName))).sort(),
    [items]
  );

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const i of items) {
      if (i.dueDate) set.add(Number(i.dueDate.slice(0, 4)));
      for (const p of i.payments || []) {
        if (p.paymentDate) set.add(Number(p.paymentDate.slice(0, 4)));
      }
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a - b);
  }, [items]);

  const passaFiltrosBase = useCallback(
    (i: SiengeIncome) => {
      if (busca.trim()) {
        const alvo = `${nomeImovel(i)} ${i.clientName || ""}`.toLowerCase();
        if (!alvo.includes(busca.trim().toLowerCase())) return false;
      }
      return true;
    },
    [busca]
  );

  /** Empresa selecionada? (vazio = todas). */
  const empresaSelecionada = useCallback(
    (nome: string) => empresas.size === 0 || empresas.has(nome),
    [empresas]
  );

  const noPeriodo = useCallback(
    (dataISO: string) => {
      if (!dataISO) return false;
      const ano = Number(dataISO.slice(0, 4));
      const mes = Number(dataISO.slice(5, 7)) - 1;
      if (anos.size > 0 && !anos.has(ano)) return false;
      if (meses.size > 0 && !meses.has(mes)) return false;
      return true;
    },
    [anos, meses]
  );

  /** Parcelas em aberto (A Receber) — ainda SEM o recorte de empresa. */
  const linhasReceberTodas = useMemo<LinhaReceber[]>(() => {
    const out: LinhaReceber[] = [];
    for (const i of items) {
      if (!passaFiltrosBase(i)) continue;
      const valor = saldoAberto(i);
      if (valor <= 0) continue;
      const venc = (i.dueDate || "").slice(0, 10);
      if (!noPeriodo(venc)) continue;
      const dias = diasEmAtraso(venc, hoje);
      if (status === "vencido" && dias <= 0) continue;
      if (status === "avencer" && dias > 0) continue;
      out.push({
        key: `${i.companyId}:${i.billId}:${i.installmentId}`,
        dueDate: venc,
        imovel: nomeImovel(i),
        cliente: i.clientName || "-",
        empresa: i.companyName,
        dias,
        valor,
        item: i,
      });
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [items, passaFiltrosBase, noPeriodo, status, hoje]);

  /** Recebimentos efetivados (Realizado) — ainda SEM o recorte de empresa. */
  const linhasRealizadoTodas = useMemo<LinhaRealizado[]>(() => {
    const out: LinhaRealizado[] = [];
    for (const i of items) {
      if (!passaFiltrosBase(i)) continue;
      (i.payments || []).forEach((p, idx) => {
        const data = (p.paymentDate || "").slice(0, 10);
        const valor = p.netAmount || 0;
        if (!valor || !noPeriodo(data)) return;
        out.push({
          key: `${i.companyId}:${i.billId}:${i.installmentId}:${idx}`,
          data,
          imovel: nomeImovel(i),
          cliente: i.clientName || "-",
          empresa: i.companyName,
          valor,
          item: i,
        });
      });
    }
    return out.sort((a, b) => b.data.localeCompare(a.data));
  }, [items, passaFiltrosBase, noPeriodo]);

  const linhasReceber = useMemo(
    () => linhasReceberTodas.filter((l) => empresaSelecionada(l.empresa)),
    [linhasReceberTodas, empresaSelecionada]
  );
  const linhasRealizado = useMemo(
    () => linhasRealizadoTodas.filter((l) => empresaSelecionada(l.empresa)),
    [linhasRealizadoTodas, empresaSelecionada]
  );

  /**
   * Perfil de pagamento por cliente. Roda sobre TODOS os titulos de locacao
   * (sem recorte de periodo/empresa) — o comportamento do cliente nao muda
   * porque o usuario filtrou um mes.
   */
  const pagadores = useMemo(() => mapaPagadores(items, tolerancia), [items, tolerancia]);

  /** Cor fixa por empresa — os cards e o grafico usam a mesma. */
  const corPorEmpresa = useMemo(() => {
    const m = new Map<string, string>();
    empresasDisponiveis.forEach((e, idx) => m.set(e, CORES_EMPRESA[idx % CORES_EMPRESA.length]));
    return m;
  }, [empresasDisponiveis]);

  /**
   * Total de cada empresa nos cards. Ignora de proposito o proprio filtro de
   * empresa: o card precisa mostrar quanto a empresa tem mesmo quando esta
   * desmarcada, senao viraria R$ 0,00.
   */
  const totaisPorEmpresa = useMemo(() => {
    const m = new Map<string, { valor: number; qtd: number }>();
    for (const e of empresasDisponiveis) m.set(e, { valor: 0, qtd: 0 });
    if (aba === "contratos") {
      // nos contratos o card mostra o aluguel mensal contratado (vigentes)
      for (const c of agruparContratos(items, hoje)) {
        if (c.status !== "vigente" && c.status !== "vence-breve") continue;
        const atual = m.get(c.empresa);
        if (!atual) continue;
        atual.valor += c.valorMes;
        atual.qtd += 1;
      }
      return m;
    }
    const base = aba === "receber" ? linhasReceberTodas : linhasRealizadoTodas;
    for (const l of base) {
      const atual = m.get(l.empresa);
      if (!atual) continue;
      atual.valor += l.valor;
      atual.qtd += 1;
    }
    return m;
  }, [aba, items, hoje, linhasReceberTodas, linhasRealizadoTodas, empresasDisponiveis]);

  /** Imoveis distintos com contrato no periodo (independente de saldo). */
  const totalImoveis = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (!passaFiltrosBase(i) || !empresaSelecionada(i.companyName)) continue;
      const temVenc = noPeriodo((i.dueDate || "").slice(0, 10));
      const temPgto = (i.payments || []).some((p) => noPeriodo((p.paymentDate || "").slice(0, 10)));
      if (temVenc || temPgto) set.add(nomeImovel(i));
    }
    return set.size;
  }, [items, passaFiltrosBase, empresaSelecionada, noPeriodo]);

  const ehReceber = aba === "receber";
  const ehContratos = aba === "contratos";
  const linhas = ehReceber ? linhasReceber : linhasRealizado;

  const totalValor = useMemo(
    () => linhas.reduce((s, l) => s + l.valor, 0),
    [linhas]
  );
  const totalAtrasado = useMemo(
    () => linhasReceber.filter((l) => l.dias > 0).reduce((s, l) => s + l.valor, 0),
    [linhasReceber]
  );
  const imoveisComSaldo = useMemo(
    () => new Set(linhasReceber.map((l) => l.imovel)).size,
    [linhasReceber]
  );

  const porEmpresa = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of linhas) map.set(l.empresa, (map.get(l.empresa) || 0) + l.valor);
    return Array.from(map.entries())
      .map(([nome, valor]) => ({ nome, curto: nomeCurtoEmpresa(nome), valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [linhas]);

  const porPeriodo = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of linhas) {
      const data = ehReceber ? (l as LinhaReceber).dueDate : (l as LinhaRealizado).data;
      const chave = data.slice(0, 7);
      map.set(chave, (map.get(chave) || 0) + l.valor);
    }
    const multiAno = anos.size !== 1;
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([chave, valor]) => {
        const mes = MESES_CURTOS[Number(chave.slice(5, 7)) - 1];
        return { label: multiAno ? `${mes}/${chave.slice(2, 4)}` : mes, valor, chave };
      });
  }, [linhas, ehReceber, anos]);

  const linhasPagina = useMemo(
    () => linhas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA),
    [linhas, pagina]
  );
  const totalPaginas = Math.ceil(linhas.length / POR_PAGINA);

  const toggle = <T,>(set: Set<T>, valor: T, setter: (s: Set<T>) => void) => {
    const novo = new Set(set);
    if (novo.has(valor)) novo.delete(valor);
    else novo.add(valor);
    setter(novo);
  };

  if (!isHolding) {
    return (
      <Card className="border-0 shadow-sm p-10 text-center">
        <Building2 className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
          Controle de Locacoes
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Esta pagina e exclusiva do modo <strong>Holding</strong>. Use o seletor de empresa
          no topo da barra lateral para alternar.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Controle de Locacoes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Alugueis a receber e realizados — Holding, Silva Packer e Sul Brasil
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cachedAt && (
            <span className="text-xs text-slate-400">
              Atualizado em {formatDate(cachedAt.slice(0, 10))}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => carregar(true)} disabled={atualizando}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-2", atualizando && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {([
          { id: "receber" as const, label: "Alugueis a Receber", icon: CalendarClock, cor: "amber" },
          { id: "realizado" as const, label: "Alugueis Realizados", icon: CheckCircle2, cor: "emerald" },
          { id: "contratos" as const, label: "Contratos", icon: FileSignature, cor: "violet" },
        ]).map((t) => {
          const ativo = aba === t.id;
          const Icone = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className={cn(
                "flex items-center gap-2 px-5 h-10 rounded-t-lg border-b-[3px] text-sm transition-all",
                ativo
                  ? t.cor === "amber"
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-semibold"
                    : t.cor === "violet"
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 font-semibold"
                      : "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <Icone className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtros — periodo a esquerda, cards de empresa ocupando a direita */}
      <Card className="border-0 shadow-sm p-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3 min-w-0">
        {!ehContratos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 w-14">Ano</span>
          {anosDisponiveis.map((ano) => (
            <button
              key={ano}
              onClick={() => toggle(anos, ano, setAnos)}
              className={cn(
                "px-3 h-7 rounded-md text-xs font-medium transition-colors",
                anos.has(ano)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {ano}
            </button>
          ))}
          {anos.size > 0 && (
            <button onClick={() => setAnos(new Set())} className="text-xs text-slate-400 hover:text-slate-600 underline">
              limpar
            </button>
          )}
        </div>
        )}

        {!ehContratos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 w-14">Mes</span>
          {MESES_CURTOS.map((m, idx) => (
            <button
              key={m}
              onClick={() => toggle(meses, idx, setMeses)}
              className={cn(
                "px-2.5 h-7 rounded-md text-xs font-medium capitalize transition-colors",
                meses.has(idx)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {m}
            </button>
          ))}
          {meses.size > 0 && (
            <button onClick={() => setMeses(new Set())} className="text-xs text-slate-400 hover:text-slate-600 underline">
              limpar
            </button>
          )}
        </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar imovel ou cliente..."
              className="pl-9 h-9"
            />
          </div>
          {!ehContratos && (
          <div className="flex items-center gap-1.5">
            <span
              className="text-[11px] text-slate-400"
              title="Atrasos ate este limite sao tratados como baixa nao registrada, nao como inadimplencia."
            >
              Tolerancia de baixa
            </span>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              {TOLERANCIAS_BAIXA.map((d) => (
                <button
                  key={d}
                  onClick={() => setTolerancia(d)}
                  className={cn(
                    "px-2.5 h-7 rounded-md text-xs font-medium transition-colors",
                    tolerancia === d
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          )}
          {ehReceber && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              {([
                { id: "todos" as const, label: "Todos" },
                { id: "vencido" as const, label: "Vencido" },
                { id: "avencer" as const, label: "A Vencer" },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatus(s.id)}
                  className={cn(
                    "px-3 h-7 rounded-md text-xs font-medium transition-colors",
                    status === s.id
                      ? s.id === "vencido"
                        ? "bg-red-500 text-white"
                        : "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Cards de empresa — clicaveis, mesmo comportamento dos chips anteriores */}
        <div className="grid gap-2 sm:grid-cols-3 xl:w-[560px]">
          {empresasDisponiveis.map((e) => {
            const selecionada = empresaSelecionada(e);
            const cor = corPorEmpresa.get(e) || CORES_EMPRESA[0];
            const t = totaisPorEmpresa.get(e) || { valor: 0, qtd: 0 };
            return (
              <button
                key={e}
                onClick={() => toggle(empresas, e, setEmpresas)}
                title={e}
                aria-pressed={selecionada}
                className={cn(
                  "group relative flex flex-col justify-center overflow-hidden rounded-xl border p-3 text-left transition-all",
                  selecionada
                    ? "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/70 shadow-sm"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 opacity-55 hover:opacity-80"
                )}
              >
                <span
                  className="absolute inset-y-0 left-0 w-1 transition-all"
                  style={{ backgroundColor: cor, opacity: selecionada ? 1 : 0.35 }}
                />
                <div className="pl-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide leading-tight text-slate-500 dark:text-slate-400 line-clamp-2">
                      {nomeCurtoEmpresa(e)}
                    </p>
                    <span
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
                        selecionada ? "border-transparent" : "border-slate-300 dark:border-slate-600"
                      )}
                      style={selecionada ? { backgroundColor: cor } : undefined}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-xl font-bold tabular-nums leading-none",
                      selecionada ? "text-slate-900 dark:text-slate-50" : "text-slate-400"
                    )}
                  >
                    {formatCompactCurrency(t.valor)}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {t.qtd}{" "}
                    {ehContratos
                      ? t.qtd === 1
                        ? "contrato vigente"
                        : "contratos vigentes"
                      : ehReceber
                        ? t.qtd === 1
                          ? "parcela"
                          : "parcelas"
                        : t.qtd === 1
                          ? "recebimento"
                          : "recebimentos"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {erro && (
        <Card className="border-0 shadow-sm p-4 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {erro}
        </Card>
      )}

      {loading ? (
        <Card className="border-0 shadow-sm p-16 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-3 text-sm text-slate-500">Carregando alugueis...</span>
        </Card>
      ) : ehContratos ? (
        <AlugueisContratos
          items={items}
          hoje={hoje}
          empresaSelecionada={empresaSelecionada}
          busca={busca}
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ehReceber ? (
              <>
                <Kpi titulo="Qt. Imoveis" valor={String(totalImoveis)} icone={Home} cor="slate" />
                <Kpi titulo="Qt. a Receber" valor={String(imoveisComSaldo)} sub={`${linhasReceber.length} parcelas`} icone={CalendarClock} cor="emerald" />
                <Kpi titulo="Vlr a Receber" valor={formatCurrency(totalValor)} icone={Wallet} cor="blue" />
                <Kpi titulo="Aluguel Atrasado" valor={formatCurrency(totalAtrasado)} sub={`${linhasReceber.filter((l) => l.dias > 0).length} parcelas vencidas`} icone={AlertTriangle} cor="red" />
              </>
            ) : (
              <>
                <Kpi titulo="Qt. Imoveis" valor={String(totalImoveis)} icone={Home} cor="slate" />
                <Kpi titulo="Qtde Recebimentos" valor={String(linhasRealizado.length)} icone={CheckCircle2} cor="emerald" />
                <Kpi titulo="Total Recebido" valor={formatCurrency(totalValor)} icone={Wallet} cor="emerald" />
                <Kpi
                  titulo="Media por Mes"
                  valor={formatCurrency(porPeriodo.length ? totalValor / porPeriodo.length : 0)}
                  sub={`${porPeriodo.length} meses com recebimento`}
                  icone={CalendarClock}
                  cor="blue"
                />
              </>
            )}
          </div>

          {/* Graficos */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-0 shadow-sm p-4 lg:col-span-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Valor por Empresa
              </h3>
              {porEmpresa.length === 0 ? (
                <VazioGrafico />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, porEmpresa.length * 64)}>
                  <BarChart data={porEmpresa} layout="vertical" margin={{ top: 4, right: 70, left: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="curto"
                      width={110}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.1)" }}
                      formatter={(v: unknown) => formatCurrency(Number(v) || 0)}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { nome?: string })?.nome || ""}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={26}>
                      {porEmpresa.map((d) => (
                        <Cell key={d.nome} fill={corPorEmpresa.get(d.nome) || CORES_EMPRESA[0]} />
                      ))}
                      <LabelList
                        dataKey="valor"
                        position="right"
                        formatter={(v: unknown) => formatCompactCurrency(Number(v) || 0)}
                        style={{ fontSize: 11, fill: "#64748b" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="border-0 shadow-sm p-4 lg:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Valor por Periodo
              </h3>
              {porPeriodo.length === 0 ? (
                <VazioGrafico />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, porEmpresa.length * 64)}>
                  <BarChart data={porPeriodo} margin={{ top: 24, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.1)" }}
                      formatter={(v: unknown) => formatCurrency(Number(v) || 0)}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill={ehReceber ? "#3b82f6" : "#10b981"}>
                      <LabelList
                        dataKey="valor"
                        position="top"
                        formatter={(v: unknown) => formatCompactCurrency(Number(v) || 0)}
                        style={{ fontSize: 10, fill: "#64748b" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Tabela */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="w-8" />
                    <th className="text-left font-semibold px-4 py-2.5">
                      {ehReceber ? "Vencimento" : "Recebimento"}
                    </th>
                    <th className="text-left font-semibold px-4 py-2.5">Imovel</th>
                    <th className="text-left font-semibold px-4 py-2.5">Cliente</th>
                    <th className="text-left font-semibold px-4 py-2.5">Empresa</th>
                    {ehReceber && <th className="text-right font-semibold px-4 py-2.5">Dias</th>}
                    <th className="text-left font-semibold px-4 py-2.5">Perfil</th>
                    <th className="text-right font-semibold px-4 py-2.5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasPagina.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                        Nenhum aluguel encontrado com os filtros atuais.
                      </td>
                    </tr>
                  )}
                  {linhasPagina.map((l) => {
                    const atrasada = ehReceber && (l as LinhaReceber).dias > 0;
                    const aberta = expandida === l.key;
                    return (
                      <Fragment key={l.key}>
                        <tr
                          onClick={() => setExpandida(aberta ? null : l.key)}
                          className={cn(
                            "border-b border-slate-100 dark:border-slate-800/70 transition-colors cursor-pointer",
                            aberta
                              ? "bg-slate-100 dark:bg-slate-800/60"
                              : atrasada
                                ? "bg-red-50/70 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          )}
                        >
                          <td className="pl-3 text-slate-400">
                            <ChevronRight className={cn("h-4 w-4 transition-transform", aberta && "rotate-90")} />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-200">
                            {formatDate(ehReceber ? (l as LinhaReceber).dueDate : (l as LinhaRealizado).data)}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{l.imovel}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{l.cliente}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">{l.empresa}</td>
                          {ehReceber && (
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {(l as LinhaReceber).dias > 0 ? (
                                <span className="text-red-600 dark:text-red-300/80 font-medium">
                                  {(l as LinhaReceber).dias}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-2.5">
                            <BadgePerfil resumo={pagadores.get(l.cliente)} tolerancia={tolerancia} />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                            {formatCurrency(l.valor)}
                          </td>
                        </tr>
                        {aberta && (
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <td colSpan={ehReceber ? 8 : 7} className="p-0">
                              <Detalhe
                                item={l.item}
                                imovel={l.imovel}
                                todos={items}
                                hoje={hoje}
                                parcelaAtual={ehReceber ? l.key : null}
                                pagador={pagadores.get(l.cliente)}
                                tolerancia={tolerancia}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                {linhas.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-900/60 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr className="font-bold text-slate-900 dark:text-slate-50">
                      <td className="px-4 py-3" colSpan={ehReceber ? 7 : 6}>
                        Total — {linhas.length} {linhas.length === 1 ? "registro" : "registros"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totalValor)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500">
                  Pagina {pagina + 1} de {totalPaginas}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina >= totalPaginas - 1}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Proxima
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const ESTILO_PERFIL: Record<PerfilPagador, string> = {
  "em-dia": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  pontual: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  cronico: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300/80",
  "sem-historico": "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const ROTULO_CURTO: Record<PerfilPagador, string> = {
  "em-dia": "Em dia",
  pontual: "Pontual",
  cronico: "Cronico",
  "sem-historico": "Sem hist.",
};

/** Explica o perfil sem esconder o numero bruto de atrasos. */
function explicarPerfil(r: ResumoPagador, tolerancia: number): string {
  if (r.perfil === "sem-historico") return "Nenhuma parcela paga registrada para este cliente.";
  const dentro = r.atrasoQualquerQtd - r.atrasoRealQtd;
  const ressalva =
    dentro > 0
      ? ` ${dentro} ${dentro === 1 ? "parcela atrasou" : "parcelas atrasaram"} ate ${tolerancia} dias e nao ${dentro === 1 ? "foi contada" : "foram contadas"} — nesse prazo o mais provavel e baixa nao registrada.`
      : "";
  if (r.perfil === "em-dia") {
    return `${r.pagasQtd} parcelas pagas, nenhuma com mais de ${tolerancia} dias de atraso.${ressalva}`;
  }
  return (
    `${r.atrasoRealQtd} de ${r.pagasQtd} parcelas pagas com mais de ${tolerancia} dias de atraso ` +
    `(${r.pctAtrasoReal}%) — media ${r.atrasoRealMedio}d, maior ${r.atrasoRealMaximo}d.${ressalva}`
  );
}

function BadgePerfil({ resumo, tolerancia }: { resumo?: ResumoPagador; tolerancia: number }) {
  if (!resumo) return <span className="text-slate-300">-</span>;
  return (
    <span
      title={explicarPerfil(resumo, tolerancia)}
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap cursor-help",
        ESTILO_PERFIL[resumo.perfil]
      )}
    >
      {ROTULO_CURTO[resumo.perfil]}
    </span>
  );
}

/**
 * Painel da linha expandida. O valor esta no cruzamento com o historico do
 * imovel — os campos avulsos do titulo (defaulterSituation, subJudicie,
 * indexerName, observation) vem constantes ou vazios nos alugueis e nao
 * entram aqui de proposito.
 */
function Detalhe({
  item,
  imovel,
  todos,
  hoje,
  parcelaAtual,
  pagador,
  tolerancia,
}: {
  item: SiengeIncome;
  imovel: string;
  todos: SiengeIncome[];
  hoje: string;
  parcelaAtual: string | null;
  pagador?: ResumoPagador;
  tolerancia: number;
}) {
  const r = useMemo(() => resumoImovel(todos, imovel, hoje), [todos, imovel, hoje]);

  const [parcelaN, parcelaTotal] = (item.installmentNumber || "").split("/");
  // "1/1" e lancamento avulso, nao contrato terminando.
  const ultimaParcela = parcelaN && parcelaN === parcelaTotal && parcelaTotal !== "1";
  const original = item.originalAmount || 0;
  const saldo = saldoAberto(item);
  const parcial = saldo > 0 && original > 0 && Math.abs(original - saldo) > 0.01;
  const jaRecebido = (item.payments || []).reduce((s, p) => s + (p.netAmount || 0), 0);

  const vencidasTotal = r.vencidas.reduce((s, v) => s + v.valor, 0);

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-4 grid gap-4 lg:grid-cols-3">
      {/* 1. Contrato */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contrato</h4>
        <Info rotulo="Parcela">
          {item.installmentNumber || "-"}
          {ultimaParcela && (
            <span className="ml-2 rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              ULTIMA — contrato terminando
            </span>
          )}
        </Info>
        <Info rotulo="Inicio">{r.contratoInicio ? formatDate(r.contratoInicio) : "-"}</Info>
        <Info rotulo="Condicao">
          {item.paymentTerm?.descrition || item.paymentTerm?.description || "-"}
        </Info>
        <Info rotulo="Titulo Sienge">
          {item.billId}/{item.installmentId}
        </Info>
        <Info rotulo="Cliente">
          {item.clientName || "-"} <span className="text-slate-400">(cod. {item.clientId})</span>
        </Info>
        {r.clientes.length > 1 && (
          <p className="text-[11px] text-slate-400">
            Imovel ja teve {r.clientes.length} inquilinos: {r.clientes.join(" · ")}
          </p>
        )}
      </div>

      {/* 2. Comportamento de pagamento — do CLIENTE, ja com a tolerancia aplicada */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Comportamento de pagamento do cliente
          </h4>
          {pagador && <BadgePerfil resumo={pagador} tolerancia={tolerancia} />}
        </div>
        {!pagador ? (
          <p className="text-sm text-slate-400">Sem dados de pagamento para este cliente.</p>
        ) : (
          <>
            <Info rotulo="Parcelas pagas">
              {pagador.pagasQtd}{" "}
              <span className="text-slate-400">({formatCurrency(pagador.pagasValor)})</span>
            </Info>
            <Info rotulo={`Atraso acima de ${tolerancia}d`}>
              {pagador.pagasQtd === 0 ? (
                <span className="text-slate-400">sem historico de pagamento</span>
              ) : pagador.atrasoRealQtd === 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">nenhuma</span>
              ) : (
                <>
                  <span
                    className={cn(
                      "font-medium",
                      pagador.perfil === "cronico" && "text-red-600 dark:text-red-300/80"
                    )}
                  >
                    {pagador.atrasoRealQtd} ({pagador.pctAtrasoReal}%)
                  </span>
                  <span className="text-slate-400">
                    {" "}
                    · media {pagador.atrasoRealMedio}d · maior {pagador.atrasoRealMaximo}d
                  </span>
                </>
              )}
            </Info>
            {pagador.atrasoQualquerQtd > pagador.atrasoRealQtd && (
              <p className="text-[11px] rounded bg-slate-100 dark:bg-slate-800/70 px-2 py-1 text-slate-500 dark:text-slate-400">
                {pagador.atrasoQualquerQtd - pagador.atrasoRealQtd} parcela
                {pagador.atrasoQualquerQtd - pagador.atrasoRealQtd === 1 ? "" : "s"} com atraso de ate{" "}
                {tolerancia} dias fora da conta — nesse prazo costuma ser baixa nao registrada, nao
                inadimplencia
              </p>
            )}
            {pagador.perfil === "cronico" && (
              <p className="text-[11px] rounded bg-red-50 dark:bg-red-950/30 px-2 py-1 text-red-700 dark:text-red-300/80">
                {ROTULO_PERFIL.cronico}: passa de {tolerancia} dias em {pagador.pctAtrasoReal}% das
                parcelas
              </p>
            )}
            <Info rotulo="Ultimo pagamento">
              {pagador.ultimoPagamento
                ? `${formatDate(pagador.ultimoPagamento.data)} — ${formatCurrency(pagador.ultimoPagamento.valor)}`
                : "nenhum recebimento registrado"}
            </Info>
          </>
        )}
        {parcial && (
          <Info rotulo="Recebimento parcial">
            <span className="text-blue-600 dark:text-blue-400">
              {formatCurrency(jaRecebido)} de {formatCurrency(original)} — saldo {formatCurrency(saldo)}
            </span>
          </Info>
        )}
      </div>

      {/* 3. Situacao em aberto do imovel */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Em aberto neste imovel <span className="normal-case tracking-normal">(todos os anos)</span>
        </h4>
        {r.vencidas.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Nenhuma parcela vencida.</p>
        ) : (
          <>
            <Info rotulo="Vencidas">
              <span className="text-red-600 dark:text-red-300/80 font-semibold">
                {r.vencidas.length} {r.vencidas.length === 1 ? "parcela" : "parcelas"} ·{" "}
                {formatCurrency(vencidasTotal)}
              </span>
            </Info>
            {r.vencidas.length > 1 && (
              <p className="text-[11px] rounded bg-red-50 dark:bg-red-950/30 px-2 py-1 text-red-700 dark:text-red-300/80">
                Debito acumulado — {r.vencidas.length} parcelas vencidas em aberto
              </p>
            )}
            <div className="space-y-1 pt-1">
              {r.vencidas.map((v) => (
                <div
                  key={v.key}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded px-2 py-1 text-xs tabular-nums",
                    v.key === parcelaAtual
                      ? "bg-slate-200 dark:bg-slate-700 font-semibold"
                      : "bg-white dark:bg-slate-800/60"
                  )}
                >
                  <span className="text-slate-600 dark:text-slate-300">
                    {formatDate(v.dueDate)}
                    <span className="text-slate-400"> · parc. {v.parcela}</span>
                  </span>
                  <span className="text-slate-400">{v.dias}d</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {formatCurrency(v.valor)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <Info rotulo="A vencer">
          {r.aVencerQtd === 0
            ? "nenhuma"
            : `${r.aVencerQtd} ${r.aVencerQtd === 1 ? "parcela" : "parcelas"} · ${formatCurrency(r.aVencerValor)}`}
        </Info>
      </div>
    </div>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <span className="text-slate-400">{rotulo}: </span>
      <span className="text-slate-700 dark:text-slate-200">{children}</span>
    </div>
  );
}

const CORES_KPI = {
  slate: "text-slate-500 bg-slate-100 dark:bg-slate-800",
  blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
  emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  red: "text-red-600 bg-red-50 dark:bg-red-950/40",
} as const;

function Kpi({
  titulo,
  valor,
  sub,
  icone: Icone,
  cor,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  icone: React.ComponentType<{ className?: string }>;
  cor: keyof typeof CORES_KPI;
}) {
  return (
    <Card className="border-0 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{titulo}</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50 truncate">{valor}</p>
          {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
        </div>
        <div className={cn("shrink-0 rounded-lg p-2", CORES_KPI[cor])}>
          <Icone className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function VazioGrafico() {
  return (
    <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">
      Sem dados no periodo selecionado
    </div>
  );
}
