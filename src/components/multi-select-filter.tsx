"use client";

// Filtro de seleção múltipla e tooltip dos gráficos. Saíram de
// executive-dashboard.tsx sem alteração quando o Comercial virou módulo
// próprio, para serem compartilhados entre o Painel e o Comercial.

import React, { useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Search, Save } from "lucide-react";
import { formatCurrency } from "@/lib/dashboard-utils";

// === Reusable Multi-Select Filter ===
const colorStyles: Record<string, { bg: string; border: string; text: string; bgActive: string; textActive: string; borderActive: string }> = {
  amber: {
    bg: "bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700",
    border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-600 dark:text-slate-300",
    bgActive: "bg-amber-50 dark:bg-amber-950/30",
    textActive: "text-amber-700 dark:text-amber-300",
    borderActive: "border-amber-300 dark:border-amber-800",
  },
  blue: {
    bg: "bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700",
    border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-600 dark:text-slate-300",
    bgActive: "bg-blue-50 dark:bg-blue-950/30",
    textActive: "text-blue-700 dark:text-blue-300",
    borderActive: "border-blue-300 dark:border-blue-800",
  },
  violet: {
    bg: "bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700",
    border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-600 dark:text-slate-300",
    bgActive: "bg-violet-50 dark:bg-violet-950/30",
    textActive: "text-violet-700 dark:text-violet-300",
    borderActive: "border-violet-300 dark:border-violet-800",
  },
  indigo: {
    bg: "bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700",
    border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-600 dark:text-slate-300",
    bgActive: "bg-indigo-50 dark:bg-indigo-950/30",
    textActive: "text-indigo-700 dark:text-indigo-300",
    borderActive: "border-indigo-300 dark:border-indigo-800",
  },
};

export function MultiSelectFilter({
  label,
  icon,
  allOptions,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  activeColor = "blue",
  labelFn,
  subtitleFn,
  onSaveDefault,
  quickFilters,
  onSelectValues,
}: {
  label: string;
  icon: React.ReactNode;
  allOptions: string[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  activeColor?: string;
  labelFn?: (value: string) => string;
  subtitleFn?: (value: string) => string;
  onSaveDefault?: () => void;
  quickFilters?: { label: string; values: string[] }[];
  onSelectValues?: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const getLabel = labelFn || ((v: string) => v);

  const filtered = useMemo(() => {
    if (!search) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(n => {
      if (getLabel(n).toLowerCase().includes(q) || n.toLowerCase().includes(q)) return true;
      if (subtitleFn && subtitleFn(n).toLowerCase().includes(q)) return true;
      return false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOptions, search]);

  const allSelected = selected.size === allOptions.length && allOptions.length > 0;

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) setTimeout(() => inputRef.current?.focus(), 100);
      else setSearch("");
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 ${selected.size > 0 ? `border-${activeColor}-300 bg-${activeColor}-50 text-${activeColor}-700` : ""}`}
        >
          {icon}
          {label}
          {selected.size > 0 && (
            <Badge variant="secondary" className={`ml-1 bg-${activeColor}-100 text-${activeColor}-700 text-[10px] px-1.5 py-0`}>
              {selected.size}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder={`Buscar ${label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {/* Quick Filters */}
        {!search && quickFilters && quickFilters.length > 0 && (
          <div className="px-3 py-2 border-b flex flex-wrap gap-1 bg-slate-50/50 dark:bg-slate-900/10 justify-center">
            {quickFilters.map((qf) => {
              const isSelected = qf.values.every((v) => selected.has(v)) && qf.values.length > 0;
              const activeColorStyle = colorStyles[activeColor] || colorStyles.blue;
              return (
                <button
                  key={qf.label}
                  type="button"
                  onClick={() => {
                    if (onSelectValues) {
                      if (isSelected) {
                        onClear();
                      } else {
                        onSelectValues(qf.values);
                      }
                    }
                  }}
                  className={`text-[10px] px-2 py-1 rounded font-semibold border transition-all ${
                    isSelected
                      ? `${activeColorStyle.bgActive} ${activeColorStyle.borderActive} ${activeColorStyle.textActive}`
                      : `${activeColorStyle.bg} ${activeColorStyle.border} ${activeColorStyle.text}`
                  }`}
                >
                  {qf.label}
                </button>
              );
            })}
          </div>
        )}
        {/* Select All / Deselect All */}
        {!search && (
          <div className="px-1 pt-1">
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200 border-b mb-1 pb-2"
              onClick={() => {
                if (allSelected) onClear();
                else onSelectAll();
              }}
            >
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${allSelected ? "bg-primary border-primary" : "border-slate-300 dark:border-slate-600"}`}>
                {allSelected && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
              <span>{allSelected ? "Desmarcar tudo" : "Selecionar tudo"}</span>
              <span className="ml-auto text-xs text-slate-400">{allOptions.length}</span>
            </div>
          </div>
        )}
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum resultado</p>
          ) : (
            filtered.map(name => (
              <label
                key={name}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer text-sm"
              >
                <Checkbox
                  checked={selected.has(name)}
                  onCheckedChange={() => onToggle(name)}
                />
                <div className="min-w-0 flex-1">
                  <span className="truncate block">{getLabel(name)}</span>
                  {subtitleFn && <span className="text-[10px] text-slate-400 truncate block">{subtitleFn(name)}</span>}
                </div>
              </label>
            ))
          )}
        </div>
        {selected.size > 0 && (
          <div className="p-2 border-t flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="flex-1 text-slate-500 gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Limpar ({selected.size})
            </Button>
            {onSaveDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSaveDefault}
                className="flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                Salvar padrao
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pct = payload[0]?.payload?.pct;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-xl p-4 text-sm min-w-[180px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry: { color: string; name: string; value: number }, idx: number) => (
        <div key={idx} className="flex items-center justify-between gap-4 mt-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500">{entry.name}</span>
          </div>
          <span className="font-semibold text-slate-700 tabular-nums">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
      {pct !== null && pct !== undefined && (
        <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-slate-100">
          <span className="text-slate-400">Variacao</span>
          <span className={`font-semibold tabular-nums ${pct >= 0 ? "text-red-500 dark:text-red-300/70" : "text-emerald-500 dark:text-emerald-400"}`}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
