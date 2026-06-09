"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatCompactCurrency } from "@/lib/dashboard-utils";
import { SiengeIncome, SiengeOutcome, SiengeSalesContract } from "@/types/sienge";

interface Props {
  // consistentIncomeForRecebidas (já filtrado por modo SP/Holding + exclusão TRAN)
  incomeItems: SiengeIncome[];
  // consistentItemsForPagas (outcome + movimentos bancários sintetizados)
  outcomeItems: SiengeOutcome[];
  salesContracts: SiengeSalesContract[];
  selectedCompanies: Set<string>;
  isHolding: boolean;
  currentYear: number;
}

type PeriodType = "sem1" | "sem2" | "ano" | "ytd" | "custom";

const MONTH_NAMES: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
  "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};
const ALL_MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

// Mesma lista de op types excluídos por padrão do "Total Pago" (contas-table.tsx /
// executive-dashboard.tsx) — Sienge "(por Credor) Sintético" não soma esses.
const PAID_EXCLUDED = ["substitui", "cancelamento", "abatimento", "devolu", "por bens", "permuta"];

// Categorias de entrada da DRE (mesma lista de dre-tab.tsx). Valores do endpoint
// /api/dre-supplementary já vêm assinados (custos negativos).
const DRE_INPUT_CATEGORIES = [
  "receita_operacional", "custo_variavel", "custo_fixo", "despesas_financeiras",
  "despesas_tributarias", "imobilizacoes", "retiradas", "entradas_nao_operacionais",
  "saidas_nao_operacionais",
] as const;

type DreRaw = Record<string, { name: string; dreCategory: string; months?: Record<string, number> }>;

function monthsForPeriod(type: PeriodType, baseYear: number, currentYear: number, currentMonth: number, cStart: string, cEnd: string): string[] {
  switch (type) {
    case "sem1": return ALL_MONTHS.slice(0, 6);
    case "sem2": return ALL_MONTHS.slice(6, 12);
    case "ano": return [...ALL_MONTHS];
    case "ytd": {
      const last = baseYear >= currentYear ? currentMonth : 12;
      return ALL_MONTHS.slice(0, last);
    }
    case "custom": {
      const a = Math.min(Number(cStart), Number(cEnd));
      const b = Math.max(Number(cStart), Number(cEnd));
      return ALL_MONTHS.filter(m => Number(m) >= a && Number(m) <= b);
    }
  }
}

function periodLabel(type: PeriodType, year: number, months: string[]): string {
  if (type === "sem1") return `1º sem ${year}`;
  if (type === "sem2") return `2º sem ${year}`;
  if (type === "ano") return `Ano ${year}`;
  if (type === "ytd") return `Jan–${MONTH_NAMES[months[months.length - 1]] || ""} ${year}`;
  return `${MONTH_NAMES[months[0]] || ""}–${MONTH_NAMES[months[months.length - 1]] || ""} ${year}`;
}

function pctDelta(a: number, b: number): number | null {
  if (b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function DeltaBadge({ a, b, goodWhenUp = true }: { a: number; b: number; goodWhenUp?: boolean }) {
  const p = pctDelta(a, b);
  if (p === null) {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Minus className="h-3 w-3" /> —</span>;
  }
  const up = p >= 0;
  const good = goodWhenUp ? up : !up;
  const cls = Math.abs(p) < 0.05
    ? "text-slate-400 bg-slate-100 dark:bg-slate-800"
    : good
      ? "text-emerald-600 bg-emerald-50 dark:text-emerald-300/80 dark:bg-emerald-950/40"
      : "text-red-600 bg-red-50 dark:text-red-300/70 dark:bg-red-950/40";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{p.toFixed(1)}%
    </span>
  );
}

export function ComparativoTab({ incomeItems, outcomeItems, salesContracts, selectedCompanies, isHolding, currentYear }: Props) {
  const currentMonth = new Date().getMonth() + 1;
  const [baseYear, setBaseYear] = useState(currentYear);
  const [periodType, setPeriodType] = useState<PeriodType>("ytd");
  const [cStart, setCStart] = useState("01");
  const [cEnd, setCEnd] = useState(String(currentMonth).padStart(2, "0"));
  const [chartMetric, setChartMetric] = useState<"recebido" | "pago" | "lucro">("lucro");

  const months = useMemo(
    () => monthsForPeriod(periodType, baseYear, currentYear, currentMonth, cStart, cEnd),
    [periodType, baseYear, currentYear, currentMonth, cStart, cEnd]
  );
  const yearA = baseYear;
  const yearB = baseYear - 1;

  const companyOk = useMemo(() => {
    return (name: string) => selectedCompanies.size === 0 || selectedCompanies.has(name);
  }, [selectedCompanies]);

  const inPeriod = (date: string | undefined, year: number, ms: string[]) =>
    !!date && date.substring(0, 4) === String(year) && ms.includes(date.substring(5, 7));

  // ─── Caixa: Recebido / Pago / Vendas por (ano, meses) ───
  const calc = useMemo(() => {
    const received = (year: number, ms: string[]) => {
      let s = 0;
      for (const i of incomeItems) {
        if (!companyOk(i.companyName)) continue;
        for (const p of i.payments || []) {
          if ((p.netAmount || 0) > 0 && inPeriod(p.paymentDate, year, ms)) s += p.netAmount || 0;
        }
      }
      return s;
    };
    const paid = (year: number, ms: string[]) => {
      let s = 0;
      for (const i of outcomeItems) {
        if (!companyOk(i.companyName)) continue;
        for (const p of i.payments || []) {
          const op = (p.operationTypeName || "").toLowerCase();
          if (PAID_EXCLUDED.some(x => op.includes(x))) continue;
          if (inPeriod(p.paymentDate, year, ms)) s += p.netAmount || 0;
        }
      }
      return s;
    };
    const sales = (year: number, ms: string[]) => {
      let s = 0;
      for (const c of salesContracts) {
        if (c.cancellationDate || c.situation === "Cancelado" || c.situation === "Distratado") continue;
        if (!companyOk(c.companyName)) continue;
        if (inPeriod(c.contractDate, year, ms)) s += c.value || 0;
      }
      return s;
    };

    const recA = received(yearA, months), recB = received(yearB, months);
    const pagA = paid(yearA, months), pagB = paid(yearB, months);
    const venA = sales(yearA, months), venB = sales(yearB, months);

    // série mensal para o gráfico
    const metricMonth = (year: number, m: string) => {
      if (chartMetric === "recebido") return received(year, [m]);
      if (chartMetric === "pago") return paid(year, [m]);
      return received(year, [m]) - paid(year, [m]);
    };
    const chart = months.map(m => ({
      month: MONTH_NAMES[m],
      [String(yearA)]: metricMonth(yearA, m),
      [String(yearB)]: metricMonth(yearB, m),
    }));

    return {
      recA, recB, pagA, pagB, venA, venB,
      lucA: recA - pagA, lucB: recB - pagB,
      chart,
    };
  }, [incomeItems, outcomeItems, salesContracts, companyOk, yearA, yearB, months, chartMetric]);

  // ─── DRE: busca os 2 anos (todos os meses) e soma os meses do período ───
  const [dreRawA, setDreRawA] = useState<DreRaw | null>(null);
  const [dreRawB, setDreRawB] = useState<DreRaw | null>(null);
  const [dreLoading, setDreLoading] = useState(false);
  const [dreError, setDreError] = useState(false);

  useEffect(() => {
    if (isHolding) { setDreRawA(null); setDreRawB(null); return; }
    let cancelled = false;
    setDreLoading(true);
    setDreError(false);
    Promise.all([yearA, yearB].map(y =>
      fetch(`/api/dre-supplementary?year=${y}&monthly=true`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )).then(([ra, rb]) => {
      if (cancelled) return;
      setDreRawA(ra?.data || null);
      setDreRawB(rb?.data || null);
      if (!ra?.data && !rb?.data) setDreError(true);
    }).finally(() => { if (!cancelled) setDreLoading(false); });
    return () => { cancelled = true; };
  }, [yearA, yearB, isHolding]);

  const dre = useMemo(() => {
    const catTotals = (raw: DreRaw | null) => {
      const t: Record<string, number> = {};
      for (const c of DRE_INPUT_CATEGORIES) t[c] = 0;
      if (!raw) return t;
      for (const fcId in raw) {
        const d = raw[fcId];
        if (t[d.dreCategory] === undefined) continue;
        for (const m of months) t[d.dreCategory] += d.months?.[m] || 0;
      }
      return t;
    };
    const lines = (t: Record<string, number>) => {
      const g = (k: string) => t[k] || 0;
      const lucroBruto = g("receita_operacional") + g("custo_variavel");
      const lucroOperacional = lucroBruto + g("custo_fixo");
      const lucroLiquido = lucroOperacional + g("despesas_financeiras") + g("despesas_tributarias");
      return {
        receita: g("receita_operacional"),
        custoVar: g("custo_variavel"),
        custoFixo: g("custo_fixo"),
        lucroBruto, lucroOperacional, lucroLiquido,
      };
    };
    return { a: lines(catTotals(dreRawA)), b: lines(catTotals(dreRawB)) };
  }, [dreRawA, dreRawB, months]);

  const labelA = periodLabel(periodType, yearA, months);
  const labelB = periodLabel(periodType, yearB, months);

  const cashCards: { key: string; label: string; a: number; b: number; goodWhenUp: boolean }[] = [
    { key: "rec", label: "Recebido", a: calc.recA, b: calc.recB, goodWhenUp: true },
    { key: "pag", label: "Pago", a: calc.pagA, b: calc.pagB, goodWhenUp: false },
    { key: "luc", label: "Lucro Realizado", a: calc.lucA, b: calc.lucB, goodWhenUp: true },
    { key: "ven", label: "Vendas (contratos)", a: calc.venA, b: calc.venB, goodWhenUp: true },
  ];

  const dreRows: { label: string; a: number; b: number; goodWhenUp: boolean; bold?: boolean }[] = [
    { label: "Receita Operacional", a: dre.a.receita, b: dre.b.receita, goodWhenUp: true },
    { label: "Custo Variável", a: dre.a.custoVar, b: dre.b.custoVar, goodWhenUp: true },
    { label: "(=) Lucro Bruto", a: dre.a.lucroBruto, b: dre.b.lucroBruto, goodWhenUp: true, bold: true },
    { label: "Custo Fixo", a: dre.a.custoFixo, b: dre.b.custoFixo, goodWhenUp: true },
    { label: "(=) Lucro Operacional", a: dre.a.lucroOperacional, b: dre.b.lucroOperacional, goodWhenUp: true, bold: true },
    { label: "(=) Lucro Líquido", a: dre.a.lucroLiquido, b: dre.b.lucroLiquido, goodWhenUp: true, bold: true },
  ];

  const periodBtns: { key: PeriodType; label: string }[] = [
    { key: "sem1", label: "1º Sem" },
    { key: "sem2", label: "2º Sem" },
    { key: "ano", label: "Ano" },
    { key: "ytd", label: "YTD" },
    { key: "custom", label: "Período" },
  ];

  const years: number[] = [];
  for (let y = currentYear + 1; y >= currentYear - 6; y--) years.push(y);

  return (
    <div className="space-y-5">
      {/* ─── Seletor de período ─── */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">Comparativo de Períodos</p>
              <p className="text-xs text-slate-400">{labelA} <span className="text-slate-300">vs</span> {labelB}</p>
            </div>
            <div className="flex-1" />
            <select
              value={baseYear}
              onChange={e => setBaseYear(Number(e.target.value))}
              className="h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
            >
              {years.map(y => <option key={y} value={y}>{y} vs {y - 1}</option>)}
            </select>
            <div className="inline-flex items-center p-0.5 bg-slate-100/80 dark:bg-slate-800 rounded-lg border border-slate-200/60 shadow-inner">
              {periodBtns.map(b => (
                <button
                  key={b.key}
                  onClick={() => setPeriodType(b.key)}
                  className={`px-3 h-8 text-xs font-bold rounded-md transition-all ${periodType === b.key ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {periodType === "custom" && (
              <div className="flex items-center gap-1.5">
                <select value={cStart} onChange={e => setCStart(e.target.value)} className="h-9 px-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  {ALL_MONTHS.map(m => <option key={m} value={m}>{MONTH_NAMES[m]}</option>)}
                </select>
                <span className="text-slate-400 text-xs">até</span>
                <select value={cEnd} onChange={e => setCEnd(e.target.value)} className="h-9 px-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  {ALL_MONTHS.map(m => <option key={m} value={m}>{MONTH_NAMES[m]}</option>)}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Bloco 1: Realizado (Caixa) ─── */}
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-3 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-l-[3px] border-emerald-500 rounded-r-md">
          Realizado (Caixa)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cashCards.map(c => (
            <Card key={c.key} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                  <DeltaBadge a={c.a} b={c.b} goodWhenUp={c.goodWhenUp} />
                </div>
                <p className="text-xl xl:text-2xl font-bold text-slate-800 dark:text-slate-50 mt-2 tabular-nums">{formatCurrency(c.a)}</p>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{labelB}</p>
                  <p className="text-base font-bold tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">{formatCurrency(c.b)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Gráfico mensal A vs B */}
        <Card className="border-0 shadow-sm mt-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Evolução mensal — {chartMetric === "recebido" ? "Recebido" : chartMetric === "pago" ? "Pago" : "Lucro Realizado"}</p>
              <div className="inline-flex items-center p-0.5 bg-slate-100/80 dark:bg-slate-800 rounded-lg border border-slate-200/60">
                {(["lucro", "recebido", "pago"] as const).map(mt => (
                  <button key={mt} onClick={() => setChartMetric(mt)} className={`px-2.5 h-7 text-xs font-bold rounded-md ${chartMetric === mt ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-500"}`}>
                    {mt === "lucro" ? "Lucro" : mt === "recebido" ? "Receb." : "Pago"}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={calc.chart} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} width={70} />
                <RechartsTooltip cursor={{ fill: "rgba(99,102,241,0.06)" }} formatter={(v: number | undefined) => formatCurrency(v ?? 0)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={String(yearB)} fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                <Bar dataKey={String(yearA)} fill="#4f46e5" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ─── Bloco 2: DRE (Contábil) ─── */}
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300 mb-3 px-3 py-1.5 bg-violet-50 dark:bg-violet-950/40 border-l-[3px] border-violet-500 rounded-r-md">
          DRE (Contábil)
        </h3>
        {isHolding ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-slate-500">
              A DRE é consolidada de todas as empresas e <strong>exclui a Holding</strong> — indisponível no modo Holding.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 mb-3">
                A DRE é sempre <strong>todas as empresas</strong> (exclui Holding) e ignora o filtro de empresa.
                {dreLoading && <span className="ml-2 text-indigo-500">Carregando…</span>}
                {dreError && <span className="ml-2 text-red-500">Sem dados de DRE para os anos selecionados.</span>}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left font-semibold py-2 px-2">Linha</th>
                      <th className="text-right font-semibold py-2 px-2">{labelB}</th>
                      <th className="text-right font-semibold py-2 px-2">{labelA}</th>
                      <th className="text-right font-semibold py-2 px-2 w-24">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreRows.map(r => (
                      <tr key={r.label} className={`border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${r.bold ? "bg-slate-50/60 dark:bg-slate-800/40" : ""}`}>
                        <td className={`py-2 px-2 ${r.bold ? "font-bold text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>{r.label}</td>
                        <td className={`py-2 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400`}>{formatCurrency(r.b)}</td>
                        <td className={`py-2 px-2 text-right tabular-nums ${r.bold ? "font-bold" : ""} ${r.a < 0 ? "text-red-600 dark:text-red-300/80" : "text-slate-800 dark:text-slate-200"}`}>{formatCurrency(r.a)}</td>
                        <td className="py-2 px-2 text-right"><DeltaBadge a={r.a} b={r.b} goodWhenUp={r.goodWhenUp} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
