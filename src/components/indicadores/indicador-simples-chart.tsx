"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brl, pct } from "@/lib/indicadores/fmt";

export type ChartPoint = {
  label: string;
  value: number;
};

type Format = "brl" | "pct";

function formatValue(v: number, format: Format): string {
  return format === "brl" ? brl(v) : pct(v, true);
}

function formatYAxis(v: number, format: Format): string {
  if (format === "brl") {
    return new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  }
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v) + "%";
}

type TooltipPayload = {
  payload: ChartPoint & { prev?: number };
};

function CustomTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  format: Format;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const prev = p.prev;
  const diff = prev !== undefined && prev !== 0 ? ((p.value - prev) / prev) * 100 : null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{p.label}</p>
      <p className="tabular-nums text-slate-800 dark:text-slate-100">
        {formatValue(p.value, format)}
      </p>
      {format === "brl" && diff !== null && (
        <p
          className={
            diff >= 0
              ? "tabular-nums text-emerald-600 dark:text-emerald-400"
              : "tabular-nums text-rose-600 dark:text-rose-400"
          }
        >
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(2)}% vs mês anterior
        </p>
      )}
    </div>
  );
}

export function IndicadorSimplesChart({
  data,
  format = "brl",
  color = "#2563eb",
  height = 280,
}: {
  data: ChartPoint[];
  format?: Format;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">
        Sem dados.
      </div>
    );
  }

  const withPrev = data.map((d, i) => ({
    ...d,
    prev: i > 0 ? data[i - 1].value : undefined,
  }));

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yMin = min >= 0 ? min * 0.985 : min * 1.05;
  const yMax = max <= 0 ? max * 0.985 : max * 1.005;

  const gradId = `grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={withPrev} margin={{ top: 24, right: 24, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.8} />
              <stop offset="100%" stopColor={color} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="text-slate-500 dark:text-slate-400"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => formatYAxis(Number(v), format)}
            className="text-slate-500 dark:text-slate-400"
            width={70}
          />
          <Tooltip content={<CustomTooltip format={format} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="value"
              position="top"
              className="fill-slate-700 dark:fill-slate-200 text-[10px]"
              formatter={(v: unknown) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return "";
                if (format === "pct") {
                  return `${n.toFixed(2).replace(".", ",")}%`;
                }
                return new Intl.NumberFormat("pt-BR", {
                  maximumFractionDigits: 0,
                }).format(n);
              }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
