"use client";

import { useState } from "react";
import { Loader2, RefreshCcw, MapPin, TrendingUp, Building2, BarChart3, BarChartHorizontal } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brl, formatDateTime } from "@/lib/indicadores/fmt";
import type { ValorM2Row } from "@/lib/db";
import { KpiCard } from "./kpi-card";

export type ValorM2Kpis = {
  maisCaro: { cidade: string; uf: string; valor: number } | null;
  maiorValorizacao: { cidade: string; uf: string; variacao: number } | null;
  totalCidades: number;
  referencia: string | null;
};

function pctBr(v: number | null): string {
  if (v === null || v === undefined) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2).replace(".", ",")}%`;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { cidade: string; uf: string; valor_m2: number; variacao_12m_pct: number | null } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const variacao = p.variacao_12m_pct;
  const variacaoPositiva = variacao !== null && variacao >= 0;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        {p.cidade} <span className="text-slate-400">({p.uf})</span>
      </p>
      <p className="tabular-nums text-slate-800 dark:text-slate-100">{brl(p.valor_m2)}/m²</p>
      {variacao !== null && (
        <p
          className={
            variacaoPositiva
              ? "tabular-nums text-emerald-600 dark:text-emerald-400"
              : "tabular-nums text-rose-600 dark:text-rose-400"
          }
        >
          {pctBr(variacao)} em 12 meses
        </p>
      )}
    </div>
  );
}

export function ValorM2Content({
  rows,
  kpis,
  atualizadoEm,
  onSynced,
}: {
  rows: ValorM2Row[];
  kpis: ValorM2Kpis;
  atualizadoEm: string | null;
  onSynced: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [chartLayout, setChartLayout] = useState<"barras" | "colunas">("colunas");

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/indicadores/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicador: "valorm2" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Valor m² sincronizado — ${data.inseridos} cidades (ref: ${data.ultimo}).`);
        onSynced();
      } else {
        toast.error(`Falha ao sincronizar Valor m²: ${data.error ?? "erro desconhecido"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(`Falha ao sincronizar Valor m²: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const chartData = rows.map((r) => ({
    label: `${r.cidade} (${r.uf})`,
    cidade: r.cidade,
    uf: r.uf,
    valor_m2: r.valor_m2,
    variacao_12m_pct: r.variacao_12m_pct,
  }));

  // Gradiente de cor azul → rosa por posição (mais caro → mais barato)
  const corBarra = (idx: number, total: number): string => {
    if (total <= 1) return "#2563eb";
    const t = idx / (total - 1);
    // 2563eb (azul) → 8b5cf6 (violet) → ec4899 (rose)
    if (t < 0.5) {
      // azul → violet
      const k = t * 2;
      return mixHex("#2563eb", "#8b5cf6", k);
    }
    const k = (t - 0.5) * 2;
    return mixHex("#8b5cf6", "#ec4899", k);
  };

  const chartHeight =
    chartLayout === "barras" ? Math.max(280, rows.length * 32) : 420;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Fonte: FipeZAP via{" "}
          <a
            href="https://myside.com.br/guia-imoveis/metro-quadrado-mais-caro-brasil"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            myside.com.br
          </a>
          {kpis.referencia && (
            <>
              {" · "}
              <span>referência: <strong>{kpis.referencia}</strong></span>
            </>
          )}
          {" · "}sincronizado em {formatDateTime(atualizadoEm)}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Atualizar Valor m²
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          tone="accent"
          label="Cidade mais cara"
          value={kpis.maisCaro ? brl(kpis.maisCaro.valor) + "/m²" : "—"}
          hint={kpis.maisCaro ? `${kpis.maisCaro.cidade} (${kpis.maisCaro.uf})` : undefined}
        />
        <KpiCard
          tone={
            kpis.maiorValorizacao && kpis.maiorValorizacao.variacao < 0
              ? "danger"
              : "success"
          }
          label="Maior valorização 12m"
          value={kpis.maiorValorizacao ? pctBr(kpis.maiorValorizacao.variacao) : "—"}
          hint={
            kpis.maiorValorizacao
              ? `${kpis.maiorValorizacao.cidade} (${kpis.maiorValorizacao.uf})`
              : undefined
          }
        />
        <KpiCard
          tone="warning"
          label="Cidades monitoradas"
          value={String(kpis.totalCidades)}
          hint={kpis.referencia ? `Referência: ${kpis.referencia}` : undefined}
        />
      </div>

      <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                R$/m² por cidade
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                ({rows.length} cidades)
              </span>
            </div>
            <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setChartLayout("barras")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  chartLayout === "barras"
                    ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
                title="Barras horizontais"
              >
                <BarChartHorizontal className="h-3.5 w-3.5" />
                Barras
              </button>
              <button
                type="button"
                onClick={() => setChartLayout("colunas")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  chartLayout === "colunas"
                    ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
                title="Colunas verticais"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Colunas
              </button>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">
              Sem dados. Clique em <strong className="mx-1">Atualizar Valor m²</strong> para carregar.
            </div>
          ) : chartLayout === "barras" ? (
            <div style={{ width: "100%", height: chartHeight }}>
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 80, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(Number(v))
                    }
                    axisLine={false}
                    tickLine={false}
                    className="text-slate-500 dark:text-slate-400"
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    width={170}
                    axisLine={false}
                    tickLine={false}
                    className="text-slate-600 dark:text-slate-300"
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar dataKey="valor_m2" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={corBarra(idx, chartData.length)} />
                    ))}
                    <LabelList
                      dataKey="valor_m2"
                      position="right"
                      formatter={(v: unknown) =>
                        new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(Number(v))
                      }
                      style={{ fontSize: 11, fontWeight: 600 }}
                      className="fill-slate-700 dark:fill-slate-200"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ width: "100%", height: chartHeight }}>
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  margin={{ top: 28, right: 16, left: 8, bottom: 56 }}
                  barCategoryGap="8%"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" vertical={false} />
                  <XAxis
                    type="category"
                    dataKey="label"
                    interval={0}
                    tick={<TwoLineCityTick />}
                    axisLine={false}
                    tickLine={false}
                    height={56}
                  />
                  <YAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(Number(v))
                    }
                    axisLine={false}
                    tickLine={false}
                    className="text-slate-500 dark:text-slate-400"
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar dataKey="valor_m2" radius={[6, 6, 0, 0]} maxBarSize={120}>
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={corBarra(idx, chartData.length)} />
                    ))}
                    <LabelList
                      dataKey="valor_m2"
                      position="top"
                      formatter={(v: unknown) =>
                        new Intl.NumberFormat("pt-BR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(Number(v))
                      }
                      style={{ fontSize: 11, fontWeight: 700 }}
                      className="fill-slate-700 dark:fill-slate-200"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
                  <th className="text-left font-semibold py-2.5 px-4 w-12">#</th>
                  <th className="text-left font-semibold py-2.5 px-4">Cidade</th>
                  <th className="text-left font-semibold py-2.5 px-4 w-16">UF</th>
                  <th className="text-right font-semibold py-2.5 px-4">Valor m²</th>
                  <th className="text-right font-semibold py-2.5 px-4">Variação 12m</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                      Sem dados.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const variacao = r.variacao_12m_pct;
                    const positiva = variacao !== null && variacao >= 0;
                    return (
                      <tr
                        key={`${r.cidade}-${r.uf}`}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2 px-4 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                          {r.posicao}º
                        </td>
                        <td className="py-2 px-4 text-slate-800 dark:text-slate-200 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {r.cidade}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-xs text-slate-500 dark:text-slate-400">{r.uf}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                          {brl(r.valor_m2)}
                        </td>
                        <td className="py-2 px-4 text-right">
                          {variacao === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 tabular-nums font-semibold ${
                                positiva
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              <TrendingUp
                                className={`h-3 w-3 ${positiva ? "" : "rotate-180"}`}
                              />
                              {pctBr(variacao)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tick customizado do XAxis: cidade na primeira linha, (UF) na segunda
function TwoLineCityTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const { x = 0, y = 0, payload } = props;
  const text = String(payload?.value ?? "");
  const m = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const cidade = m ? m[1] : text;
  const uf = m ? m[2] : "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" className="fill-slate-600 dark:fill-slate-300">
        <tspan x={0} dy={14} fontSize={11} fontWeight={600}>
          {cidade}
        </tspan>
        {uf && (
          <tspan x={0} dy={14} fontSize={10} className="fill-slate-400 dark:fill-slate-500">
            ({uf})
          </tspan>
        )}
      </text>
    </g>
  );
}

// ── Helpers de cor ────────────────────────────────────────────────────────
function mixHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
