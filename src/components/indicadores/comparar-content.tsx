"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { brl } from "@/lib/indicadores/fmt";
import type { CubIndicadorRow, PctIndicadorRow } from "@/lib/db";
import {
  INDICADORES_COMPARAVEIS,
  JANELA_MESES,
  acumuladoAte,
  dadosDoGrafico,
  montarComparativo,
  rotuloMesLongo,
  rotuloPeriodo,
  spreadContra,
  variacaoNoMes,
  type ModoComparativo,
  type SerieComparativa,
  type SlugComparavel,
} from "@/lib/indicadores/comparativo";
import { cn } from "@/lib/utils";

const MODOS: { id: ModoComparativo; rotulo: string; ajuda: string }[] = [
  { id: "base100", rotulo: "Evolucao (base 100)", ajuda: "Todos partem de 100 — a distancia entre as linhas e a diferenca real de rendimento" },
  { id: "acumulado", rotulo: "Acumulado %", ajuda: "Quanto cada indice acumulou desde o inicio da janela" },
  { id: "mensal", rotulo: "Variacao mensal", ajuda: "A variacao de cada mes, isolada" },
];

/** Duas casas, com sinal — o sinal importa quando o indice cai (IGP-M deflaciona). */
function pctSinal(v: number): string {
  const s = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v > 0 ? "+" : ""}${s}%`;
}

interface ItemTooltip {
  dataKey?: string | number;
  payload?: { chave?: number };
}

/**
 * Tooltip do comparativo.
 *
 * O numero do grafico sozinho nao diz muito — "106,46" so faz sentido junto do
 * que ele significa. Aqui cada indicador aparece com a variacao do proprio mes,
 * o acumulado ate ali e o indice em base 100, e o rodape traz a distancia entre
 * o que mais subiu e o que menos subiu naquele ponto.
 */
function TooltipComparativo({
  active,
  payload,
  series,
  modo,
}: {
  active?: boolean;
  payload?: ItemTooltip[];
  series: SerieComparativa[];
  modo: ModoComparativo;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const chave = payload[0]?.payload?.chave;
  if (chave === undefined) return null;

  const linhas = payload
    .map((item) => {
      const serie = series.find((s) => s.slug === item.dataKey);
      if (!serie) return null;
      return {
        serie,
        mensal: variacaoNoMes(serie, chave),
        acumulado: acumuladoAte(serie, chave),
      };
    })
    .filter((x): x is { serie: SerieComparativa; mensal: number | null; acumulado: number } => x !== null)
    .sort((a, b) => b.acumulado - a.acumulado);

  if (linhas.length === 0) return null;

  // ponto ancora: antecede a janela, entao nao tem variacao propria
  const ancora = linhas.every((l) => l.mensal === null);
  const topo = linhas[0];
  const base = linhas[linhas.length - 1];
  // arredonda ANTES de subtrair: senao o rodape mostra 1,21 p.p. enquanto as
  // linhas exibem +4,75 e +3,53, que dao 1,22 — o usuario faz a conta e estranha
  const arred = (v: number) => Math.round(v * 100) / 100;
  const distancia = arred(topo.acumulado) - arred(base.acumulado);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-lg backdrop-blur px-3 py-2.5 min-w-[230px]">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {rotuloMesLongo(chave)}
      </p>

      {ancora ? (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Inicio da janela — todos partem de 100
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 items-baseline">
            <span className="text-[10px] uppercase tracking-wider text-slate-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-400 text-right">
              no mes
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 text-right">
              acumulado
            </span>

            {linhas.map(({ serie, mensal, acumulado }) => (
              <Fragment key={serie.slug}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: serie.cor }}
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                    {serie.nome}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-xs tabular-nums text-right",
                    mensal !== null && mensal < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-600 dark:text-slate-300"
                  )}
                >
                  {mensal === null ? "—" : pctSinal(mensal)}
                </span>
                <span className="text-xs font-semibold tabular-nums text-right text-slate-800 dark:text-slate-100">
                  {pctSinal(acumulado)}
                </span>
              </Fragment>
            ))}
          </div>

          {modo === "base100" && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-3 gap-y-0.5">
              {linhas.map(({ serie, acumulado }) => (
                <span key={serie.slug} className="text-[10px] text-slate-400 tabular-nums">
                  {serie.nome} base 100 ={" "}
                  {(100 * (1 + acumulado / 100)).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              ))}
            </div>
          )}

          {linhas.length > 1 && Math.abs(distancia) >= 0.005 && (
            <p className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <strong className="text-slate-700 dark:text-slate-200">{topo.serie.nome}</strong>{" "}
              {distancia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              p.p. acima do {base.serie.nome}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function CompararContent({
  cub,
  cdi,
  ipca,
  igpm,
  incc,
}: {
  cub: CubIndicadorRow[];
  cdi: PctIndicadorRow[];
  ipca: PctIndicadorRow[];
  igpm: PctIndicadorRow[];
  incc: PctIndicadorRow[];
}) {
  // CUB x INCC ja vem marcado: e a comparacao que motivou a tela (custo de obra
  // medido em SC contra o indice nacional).
  const [selecionados, setSelecionados] = useState<SlugComparavel[]>(["cub", "incc"]);
  const [modo, setModo] = useState<ModoComparativo>("base100");
  const [referencia, setReferencia] = useState<SlugComparavel>("cub");

  const pct = useMemo(() => ({ cdi, ipca, igpm, incc }), [cdi, ipca, igpm, incc]);

  const { series, meses } = useMemo(
    () => montarComparativo(selecionados, cub, pct),
    [selecionados, cub, pct]
  );

  const dados = useMemo(() => dadosDoGrafico(series, meses, modo), [series, meses, modo]);

  const refEfetiva = selecionados.includes(referencia) ? referencia : selecionados[0];
  const spreads = useMemo(
    () => (refEfetiva ? spreadContra(series, refEfetiva) : []),
    [series, refEfetiva]
  );
  const serieRef = series.find((s) => s.slug === refEfetiva);

  const alternar = (slug: SlugComparavel) => {
    setSelecionados((atual) => {
      if (atual.includes(slug)) {
        // nunca deixa a tela vazia
        return atual.length === 1 ? atual : atual.filter((s) => s !== slug);
      }
      return [...INDICADORES_COMPARAVEIS.map((d) => d.slug)].filter(
        (s) => atual.includes(s) || s === slug
      );
    });
  };

  const formatarEixo = (v: number) =>
    modo === "base100"
      ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <div className="space-y-6">
      {/* Selecao de indicadores */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {INDICADORES_COMPARAVEIS.map((d) => {
            const ativo = selecionados.includes(d.slug);
            return (
              <button
                key={d.slug}
                onClick={() => alternar(d.slug)}
                title={d.descricao}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3.5 h-9 text-sm font-medium transition-all",
                  ativo
                    ? "border-transparent text-white shadow-sm"
                    : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"
                )}
                style={ativo ? { backgroundColor: d.cor } : undefined}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: ativo ? "rgba(255,255,255,0.85)" : d.cor }}
                />
                {d.nome}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Janela dos ultimos {JANELA_MESES} meses com dado em todos os indicadores selecionados
          {meses.length > 0 && <> — <strong>{rotuloPeriodo(meses)}</strong> ({meses.length} meses)</>}.
        </p>
      </div>

      {series.length === 0 || meses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Os indicadores selecionados nao tem meses em comum para comparar.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cards por indicador */}
          <div
            className={cn(
              "grid gap-3",
              series.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            )}
          >
            {[...series]
              .sort((a, b) => b.acumulado - a.acumulado)
              .map((s, idx) => (
                <div
                  key={s.slug}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
                  style={{ borderTopColor: s.cor, borderTopWidth: 3 }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.7rem] uppercase tracking-widest font-semibold text-slate-500 dark:text-slate-400">
                      {s.nome}
                    </p>
                    {idx === 0 && series.length > 1 && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        maior alta
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {pctSinal(s.acumulado)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    no periodo · media {pctSinal(s.mediaMensal)}/mes
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    R$ 100 mil viram <strong className="text-slate-700 dark:text-slate-200">{brl(s.valorCorrigido)}</strong>
                  </p>
                </div>
              ))}
          </div>

          {/* Grafico */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {MODOS.find((m) => m.id === modo)?.rotulo}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {MODOS.find((m) => m.id === modo)?.ajuda}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                  {MODOS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModo(m.id)}
                      className={cn(
                        "px-3 h-7 rounded-md text-xs font-medium transition-colors",
                        modo === m.id
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                      )}
                    >
                      {m.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={dados} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.25)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    domain={modo === "base100" ? ["auto", "auto"] : undefined}
                    tickFormatter={formatarEixo}
                  />
                  {modo !== "base100" && (
                    <ReferenceLine y={0} stroke="rgba(148,163,184,0.6)" strokeDasharray="4 4" />
                  )}
                  {modo === "base100" && (
                    <ReferenceLine y={100} stroke="rgba(148,163,184,0.6)" strokeDasharray="4 4" />
                  )}
                  <Tooltip
                    cursor={{ stroke: "rgba(148,163,184,0.5)", strokeWidth: 1 }}
                    content={<TooltipComparativo series={series} modo={modo} />}
                  />
                  <Legend
                    formatter={(valor) => {
                      const s = series.find((x) => x.slug === valor);
                      return (
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {s?.nome ?? String(valor)}
                        </span>
                      );
                    }}
                  />
                  {series.map((s) => (
                    <Line
                      key={s.slug}
                      type="monotone"
                      dataKey={s.slug}
                      stroke={s.cor}
                      strokeWidth={2.5}
                      dot={modo === "mensal" ? { r: 2.5 } : false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Diferenca contra a referencia */}
          {series.length > 1 && serieRef && (
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Diferenca contra
                  </h3>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                    {series.map((s) => (
                      <button
                        key={s.slug}
                        onClick={() => setReferencia(s.slug)}
                        className={cn(
                          "px-2.5 h-7 rounded-md text-xs font-medium transition-colors",
                          refEfetiva === s.slug
                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                        )}
                      >
                        {s.nome}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {serieRef.nome} acumulou {pctSinal(serieRef.acumulado)} no periodo
                  </span>
                </div>

                <div className="space-y-2">
                  {spreads.map((s) => {
                    const acima = s.diferenca > 0.005;
                    const abaixo = s.diferenca < -0.005;
                    const Icone = acima ? ArrowUp : abaixo ? ArrowDown : Minus;
                    return (
                      <div
                        key={s.slug}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-20">
                          {s.nome}
                        </span>
                        <Icone
                          className={cn(
                            "h-4 w-4 shrink-0",
                            acima ? "text-rose-500" : abaixo ? "text-emerald-500" : "text-slate-400"
                          )}
                        />
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            acima ? "text-rose-600 dark:text-rose-400" : abaixo ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"
                          )}
                        >
                          {pctSinal(s.diferenca).replace("%", " p.p.")}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {acima
                            ? `subiu mais que o ${serieRef.nome}`
                            : abaixo
                              ? `subiu menos que o ${serieRef.nome}`
                              : `praticamente empatado com o ${serieRef.nome}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                Resumo do periodo
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700">
                    <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="text-left font-semibold py-2 pr-4">Indicador</th>
                      <th className="text-right font-semibold py-2 px-3">Acumulado</th>
                      <th className="text-right font-semibold py-2 px-3">Media/mes</th>
                      <th className="text-right font-semibold py-2 px-3">Maior alta</th>
                      <th className="text-right font-semibold py-2 px-3">Menor variacao</th>
                      <th className="text-right font-semibold py-2 pl-3">R$ 100 mil viram</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series]
                      .sort((a, b) => b.acumulado - a.acumulado)
                      .map((s) => (
                        <tr key={s.slug} className="border-b border-slate-100 dark:border-slate-800/70">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                              <span className="font-medium text-slate-800 dark:text-slate-100">{s.nome}</span>
                            </div>
                            <span className="text-[11px] text-slate-400">{s.descricao}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                            {pctSinal(s.acumulado)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {pctSinal(s.mediaMensal)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {s.maiorAlta ? (
                              <>
                                {pctSinal(s.maiorAlta.variacao)}
                                <span className="text-[11px] text-slate-400">
                                  {" "}
                                  {s.maiorAlta.mes.toString().padStart(2, "0")}/{String(s.maiorAlta.ano).slice(-2)}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {s.maiorQueda ? (
                              <>
                                {pctSinal(s.maiorQueda.variacao)}
                                <span className="text-[11px] text-slate-400">
                                  {" "}
                                  {s.maiorQueda.mes.toString().padStart(2, "0")}/{String(s.maiorQueda.ano).slice(-2)}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                            {brl(s.valorCorrigido)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Acumulado composto — (1+i₁)·(1+i₂)·… −1. Somar as variacoes daria um numero maior
                que o real.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
