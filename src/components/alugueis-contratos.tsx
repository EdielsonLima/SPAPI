"use client";

/**
 * Aba "Contratos" do Controle de Locacoes — EXCLUSIVA do modo Holding.
 *
 * Acompanha vencimento e renovacao dos contratos de aluguel. Um contrato e um
 * billId do Sienge (o lote de parcelas criado junto); as regras de agrupamento,
 * sucessor e status estao em src/lib/alugueis-utils.ts.
 *
 * ARQUIVO ISOLADO: nao e importado por nenhuma tela das demais empresas.
 */

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarX2, FileCheck2, RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/dashboard-utils";
import {
  DIAS_ALERTA_VENCIMENTO,
  MESES_ATE_ENCERRADO,
  MESES_CURTOS,
  ROTULO_CONTRATO,
  agruparContratos,
  competencia,
  taxaRenovacao,
  type Contrato,
  type StatusContrato,
} from "@/lib/alugueis-utils";
import { SiengeIncome } from "@/types/sienge";
import { cn } from "@/lib/utils";

const ESTILO_STATUS: Record<StatusContrato, string> = {
  vencido: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300/80",
  "vence-breve": "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  vigente: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  renovado: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  encerrado: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const CURTO: Record<StatusContrato, string> = {
  vencido: "Vencido",
  "vence-breve": "Vence em breve",
  vigente: "Vigente",
  renovado: "Renovado",
  encerrado: "Encerrado",
};

const ORDEM: StatusContrato[] = ["vencido", "vence-breve", "vigente", "renovado", "encerrado"];
const POR_PAGINA = 50;

export function AlugueisContratos({
  items,
  hoje,
  empresaSelecionada,
  busca,
}: {
  items: SiengeIncome[];
  hoje: string;
  empresaSelecionada: (empresa: string) => boolean;
  busca: string;
}) {
  // Situacoes que importam por padrao — "encerrado" e historico, fica de fora
  // ate o usuario pedir.
  const [situacoes, setSituacoes] = useState<Set<StatusContrato>>(
    () => new Set<StatusContrato>(["vencido", "vence-breve", "vigente"])
  );
  const [pagina, setPagina] = useState(0);

  const contratos = useMemo(() => agruparContratos(items, hoje), [items, hoje]);
  const taxa = useMemo(() => taxaRenovacao(contratos, hoje), [contratos, hoje]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = contratos.filter((c) => {
      if (!empresaSelecionada(c.empresa)) return false;
      if (!situacoes.has(c.status)) return false;
      if (termo && !`${c.imovel} ${c.cliente}`.toLowerCase().includes(termo)) return false;
      return true;
    });
    // urgencia primeiro; dentro de cada grupo, vencidos/historicos do mais
    // recente para o mais antigo e futuros do mais proximo para o mais distante
    const recenteAntes: StatusContrato[] = ["vencido", "renovado", "encerrado"];
    return filtrados.sort((a, b) => {
      const ga = ORDEM.indexOf(a.status);
      const gb = ORDEM.indexOf(b.status);
      if (ga !== gb) return ga - gb;
      return recenteAntes.includes(a.status)
        ? b.fim.localeCompare(a.fim)
        : a.fim.localeCompare(b.fim);
    });
  }, [contratos, empresaSelecionada, situacoes, busca]);

  /** Totais dos KPIs — nao dependem dos chips de situacao, so da empresa/busca. */
  const totais = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = contratos.filter(
      (c) =>
        empresaSelecionada(c.empresa) &&
        (!termo || `${c.imovel} ${c.cliente}`.toLowerCase().includes(termo))
    );
    const soma = (st: StatusContrato) => {
      const g = base.filter((c) => c.status === st);
      return { n: g.length, valor: g.reduce((s, c) => s + c.valorMes, 0) };
    };
    return {
      vencido: soma("vencido"),
      breve: soma("vence-breve"),
      vigente: soma("vigente"),
      renovado: soma("renovado"),
      encerrado: soma("encerrado"),
    };
  }, [contratos, empresaSelecionada, busca]);

  /** Quanto vence por mes nos proximos 12 meses (so o que ainda nao renovou). */
  const cronograma = useMemo(() => {
    const mapa = new Map<string, number>();
    for (let k = 0; k < 12; k++) mapa.set(competencia(hoje, k), 0);
    for (const c of visiveis) {
      if (c.sucessor) continue;
      const chave = c.fim.slice(0, 7);
      if (!mapa.has(chave)) continue;
      mapa.set(chave, (mapa.get(chave) || 0) + c.valorMes);
    }
    return Array.from(mapa.entries()).map(([chave, valor]) => ({
      label: `${MESES_CURTOS[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`,
      valor,
    }));
  }, [visiveis, hoje]);

  const linhas = visiveis.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const totalPaginas = Math.ceil(visiveis.length / POR_PAGINA);

  const alternar = (st: StatusContrato) => {
    const novo = new Set(situacoes);
    if (novo.has(st)) novo.delete(st);
    else novo.add(st);
    setSituacoes(novo);
    setPagina(0);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiContrato
          titulo="Vencidos sem renovacao"
          valor={formatCurrency(totais.vencido.valor)}
          sub={`${totais.vencido.n} contrato${totais.vencido.n === 1 ? "" : "s"} · aluguel mensal parado`}
          icone={AlertTriangle}
          cor="red"
        />
        <KpiContrato
          titulo={`Vence em ${DIAS_ALERTA_VENCIMENTO} dias`}
          valor={formatCurrency(totais.breve.valor)}
          sub={`${totais.breve.n} contrato${totais.breve.n === 1 ? "" : "s"} · a renovar`}
          icone={CalendarX2}
          cor="amber"
        />
        <KpiContrato
          titulo="Vigentes"
          valor={formatCurrency(totais.vigente.valor + totais.breve.valor)}
          sub={`${totais.vigente.n + totais.breve.n} contratos · receita mensal contratada`}
          icone={FileCheck2}
          cor="emerald"
        />
        <KpiContrato
          titulo="Renovacao historica"
          valor={`${taxa.pct}%`}
          sub={`${taxa.renovados} de ${taxa.total} renovados · reajuste mediano ${taxa.reajusteMediano >= 0 ? "+" : ""}${taxa.reajusteMediano.toFixed(1)}%`}
          icone={RefreshCcw}
          cor="blue"
        />
      </div>

      {/* Cronograma */}
      <Card className="border-0 shadow-sm p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
          Aluguel mensal vencendo por mes — proximos 12 meses
        </h3>
        <p className="text-[11px] text-slate-400 mb-3">
          Soma do aluguel mensal dos contratos que terminam em cada mes e ainda nao tem contrato
          seguinte cadastrado.
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={cronograma} margin={{ top: 22, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.1)" }}
              formatter={(v: unknown) => formatCurrency(Number(v) || 0)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill="#f59e0b">
              <LabelList
                dataKey="valor"
                position="top"
                formatter={(v: unknown) => (Number(v) ? formatCompactCurrency(Number(v)) : "")}
                style={{ fontSize: 10, fill: "#64748b" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Filtro de situacao */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Situacao</span>
        {ORDEM.map((st) => {
          const n = totais[st === "vence-breve" ? "breve" : st].n;
          const ativo = situacoes.has(st);
          return (
            <button
              key={st}
              onClick={() => alternar(st)}
              title={
                st === "encerrado"
                  ? `Contratos vencidos ha mais de ${MESES_ATE_ENCERRADO} meses sem contrato seguinte — imovel desocupado.`
                  : ROTULO_CONTRATO[st]
              }
              className={cn(
                "px-3 h-7 rounded-md text-xs font-medium transition-colors",
                ativo
                  ? ESTILO_STATUS[st]
                  : "bg-slate-50 dark:bg-slate-900/40 text-slate-400 opacity-60 hover:opacity-100"
              )}
            >
              {CURTO[st]} <span className="opacity-60">({n})</span>
            </button>
          );
        })}
      </div>

      {/* Tabela */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-semibold px-4 py-2.5">Vence em</th>
                <th className="text-left font-semibold px-4 py-2.5">Imovel</th>
                <th className="text-left font-semibold px-4 py-2.5">Cliente</th>
                <th className="text-left font-semibold px-4 py-2.5">Empresa</th>
                <th className="text-left font-semibold px-4 py-2.5">Contrato</th>
                <th className="text-center font-semibold px-4 py-2.5">Renov.</th>
                <th className="text-left font-semibold px-4 py-2.5">Situacao</th>
                <th className="text-right font-semibold px-4 py-2.5">Aluguel/mes</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    Nenhum contrato nas situacoes selecionadas.
                  </td>
                </tr>
              )}
              {linhas.map((c) => (
                <tr
                  key={c.billId}
                  className={cn(
                    "border-b border-slate-100 dark:border-slate-800/70 transition-colors",
                    c.status === "vencido"
                      ? "bg-red-50/70 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                      : c.status === "vence-breve"
                        ? "bg-amber-50/60 dark:bg-amber-950/15 hover:bg-amber-50 dark:hover:bg-amber-950/25"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  )}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="tabular-nums text-slate-700 dark:text-slate-200">
                      {formatDate(c.fim)}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-400">{prazoTexto(c)}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.imovel}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{c.cliente}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{c.empresa}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {c.parcelas}x · {formatDate(c.inicio)} a {formatDate(c.fim)}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums">
                    {c.renovacoesAnteriores > 0 ? (
                      <span
                        className="text-slate-600 dark:text-slate-300"
                        title={`Este imovel ja teve ${c.renovacoesAnteriores} contrato(s) antes deste.`}
                      >
                        {c.renovacoesAnteriores}x
                      </span>
                    ) : (
                      <span className="text-slate-300" title="Primeiro contrato deste imovel.">
                        -
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      title={descreverStatus(c)}
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap cursor-help",
                        ESTILO_STATUS[c.status]
                      )}
                    >
                      {CURTO[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                    {formatCurrency(c.valorMes)}
                  </td>
                </tr>
              ))}
            </tbody>
            {visiveis.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-900/60 border-t-2 border-slate-200 dark:border-slate-700">
                <tr className="font-bold text-slate-900 dark:text-slate-50">
                  <td className="px-4 py-3" colSpan={7}>
                    {visiveis.length} contrato{visiveis.length === 1 ? "" : "s"}
                    <span className="ml-2 font-normal text-xs text-slate-400">
                      soma do aluguel mensal dos contratos listados
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(visiveis.reduce((s, c) => s + c.valorMes, 0))}
                  </td>
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
    </div>
  );
}

function prazoTexto(c: Contrato): string {
  const d = c.diasParaVencer;
  if (c.status === "encerrado" || c.status === "renovado") return "";
  if (d < 0) return `ha ${-d}d`;
  if (d === 0) return "hoje";
  if (d < 60) return `em ${d}d`;
  return `em ${Math.round(d / 30)} meses`;
}

function descreverStatus(c: Contrato): string {
  const historico =
    c.renovacoesAnteriores > 0
      ? ` Este imovel ja renovou ${c.renovacoesAnteriores}x antes.`
      : " E o primeiro contrato deste imovel.";
  switch (c.status) {
    case "renovado":
      return `Ja existe contrato seguinte cadastrado, comecando em ${formatDate(
        c.sucessor!.inicio
      )} por ${formatCurrency(c.sucessor!.valorMes)}/mes.`;
    case "vencido":
      return `Terminou ha ${-c.diasParaVencer} dias e nao ha contrato seguinte cadastrado — renovar ou registrar o encerramento.${historico}`;
    case "vence-breve":
      return `Termina em ${c.diasParaVencer} dias sem contrato seguinte cadastrado.${historico}`;
    case "encerrado":
      return `Terminou ha mais de ${MESES_ATE_ENCERRADO} meses sem contrato seguinte — imovel provavelmente desocupado.`;
    default:
      return `Contrato em curso, termina em ${formatDate(c.fim)}.${historico}`;
  }
}

const CORES_KPI_CONTRATO = {
  red: "text-red-600 bg-red-50 dark:bg-red-950/40",
  amber: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
} as const;

function KpiContrato({
  titulo,
  valor,
  sub,
  icone: Icone,
  cor,
}: {
  titulo: string;
  valor: string;
  sub: string;
  icone: React.ComponentType<{ className?: string }>;
  cor: keyof typeof CORES_KPI_CONTRATO;
}) {
  return (
    <Card className="border-0 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{titulo}</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50 truncate">{valor}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
        </div>
        <div className={cn("shrink-0 rounded-lg p-2", CORES_KPI_CONTRATO[cor])}>
          <Icone className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
