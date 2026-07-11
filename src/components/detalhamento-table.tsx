"use client";

import React, { useMemo, useState } from "react";
import { X, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/dashboard-utils";
import { SiengeOutcome, SiengeIncome } from "@/types/sienge";

type Item = SiengeOutcome | SiengeIncome;

export interface DetalhamentoDetailColumn {
  label: string;
  align?: "left" | "center" | "right";
  render: (item: Item) => React.ReactNode;
}

interface Props {
  title: string;
  items: Item[];
  // Nome do agrupador (credor ou cliente) de cada item.
  getCounterpart: (i: Item) => string;
  // Valor a somar por item (effectiveAmount / paidSum / receivedSum).
  amountFn: (i: Item) => number;
  counterpartLabel: string;   // "Credor" | "Cliente"
  countLabel: string;         // "Parcelas" | "Pagamentos" | "Recebimentos"
  totalLabel: string;         // "Total a Pagar" | "Total Pago" | ...
  accent: "blue" | "emerald";
  // Colunas da tabela interna (detalhe de cada título ao expandir).
  detailColumns: DetalhamentoDetailColumn[];
  // Ordena os itens dentro de um grupo (ex.: por vencimento / data de baixa).
  sortItems?: (a: Item, b: Item) => number;
  onClose: () => void;
}

type SortField = "counterpart" | "count" | "companies" | "total";

interface Group {
  key: string;
  total: number;
  count: number;
  companies: string[];
  items: Item[];
}

const ACCENT = {
  blue: { total: "text-blue-600 dark:text-blue-300/80", badge: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300/70" },
  emerald: { total: "text-emerald-600 dark:text-emerald-300/80", badge: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300/70" },
};

export function DetalhamentoTable({
  title, items, getCounterpart, amountFn, counterpartLabel, countLabel, totalLabel,
  accent, detailColumns, sortItems, onClose,
}: Props) {
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "total", dir: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const acc = ACCENT[accent];
  const plural = counterpartLabel.toLowerCase().endsWith("e") ? counterpartLabel.toLowerCase() + "s" : counterpartLabel.toLowerCase() + "es";

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const key = getCounterpart(it) || "(sem identificação)";
      let g = map.get(key);
      if (!g) { g = { key, total: 0, count: 0, companies: [], items: [] }; map.set(key, g); }
      g.total += amountFn(it);
      g.count += 1;
      g.items.push(it);
      if (it.companyName && !g.companies.includes(it.companyName)) g.companies.push(it.companyName);
    }
    const list = Array.from(map.values());
    const { field, dir } = sort;
    list.sort((a, b) => {
      let cmp = 0;
      if (field === "counterpart") cmp = a.key.localeCompare(b.key);
      else if (field === "count") cmp = a.count - b.count;
      else if (field === "companies") cmp = (a.companies[0] || "").localeCompare(b.companies[0] || "");
      else cmp = a.total - b.total;
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [items, getCounterpart, amountFn, sort]);

  const grandTotal = useMemo(() => groups.reduce((s, g) => s + g.total, 0), [groups]);

  const toggleSort = (field: SortField, defaultDir: "asc" | "desc") =>
    setSort(s => ({ field, dir: s.field === field ? (s.dir === "asc" ? "desc" : "asc") : defaultDir }));

  const SortIcon = ({ field }: { field: SortField }) =>
    sort.field === field
      ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
      : <ArrowUpDown className="h-3 w-3 text-slate-300" />;

  const alignCls = (a?: string) => a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <Card className="border-0 shadow-sm mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-slate-800 dark:text-slate-100">{title}</CardTitle>
            <p className="text-sm text-slate-400 mt-1">
              {groups.length} {groups.length === 1 ? counterpartLabel.toLowerCase() : plural} · {items.length} {countLabel.toLowerCase()}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                <TableHead className="w-10" />
                <TableHead className="cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort("counterpart", "asc")}>
                  <div className="flex items-center gap-1">{counterpartLabel} <SortIcon field="counterpart" /></div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-slate-700 text-center" onClick={() => toggleSort("count", "desc")}>
                  <div className="flex items-center justify-center gap-1">{countLabel} <SortIcon field="count" /></div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort("companies", "asc")}>
                  <div className="flex items-center gap-1">Empresas <SortIcon field="companies" /></div>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-slate-700 text-right" onClick={() => toggleSort("total", "desc")}>
                  <div className="flex items-center justify-end gap-1">{totalLabel} <SortIcon field="total" /></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(g => {
                const isExpanded = expanded.has(g.key);
                const detailItems = sortItems ? [...g.items].sort(sortItems) : g.items;
                return (
                  <React.Fragment key={g.key}>
                    <TableRow
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                    >
                      <TableCell className="w-10 pl-4">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </TableCell>
                      <TableCell className="font-medium text-slate-800 dark:text-slate-200">{g.key}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className={`${acc.badge} font-semibold`}>{g.count}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {g.companies.map(c => (
                            <span key={c} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{c}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-bold tabular-nums ${acc.total}`}>{formatCurrency(g.total)}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-slate-50/50 dark:bg-slate-800/30">
                        <TableCell colSpan={5} className="p-0">
                          <div className="px-8 py-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-slate-400 uppercase tracking-wider">
                                  {detailColumns.map((c, i) => (
                                    <th key={i} className={`py-2 font-semibold ${alignCls(c.align)}`}>{c.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {detailItems.map((item, idx) => (
                                  <tr key={`${item.billId}-${item.installmentId}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                                    {detailColumns.map((c, i) => (
                                      <td key={i} className={`py-2 ${alignCls(c.align)} ${c.align === "right" ? "tabular-nums" : ""} text-slate-600 dark:text-slate-300`}>
                                        {c.render(item)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-6 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex gap-6 text-sm text-slate-500">
            <span><strong className="text-slate-700 dark:text-slate-200">{groups.length}</strong> {plural}</span>
            <span><strong className="text-slate-700 dark:text-slate-200">{items.length}</strong> {countLabel.toLowerCase()}</span>
          </div>
          <div className={`text-sm font-bold ${acc.total}`}>Total: {formatCurrency(grandTotal)}</div>
        </div>
      </CardContent>
    </Card>
  );
}
