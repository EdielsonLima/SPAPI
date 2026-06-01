"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, List, Star } from "lucide-react";
import { formatCurrency, effectiveOpenAmount } from "@/lib/dashboard-utils";
import { Button } from "@/components/ui/button";
import { SiengeIncome } from "@/types/sienge";
import { ReceiptDetailModal } from "./receipt-detail-modal";

interface Props {
  // Items pendentes ja filtrados (correctedBalanceAmount > 0). Sao os mesmos
  // dados que alimentam a aba "Contas a Receber".
  itemsAReceber: SiengeIncome[];
  // Base COMPLETA de income (abertos + pagos) para montar o histórico do cliente
  // no modal. Opcional para retrocompatibilidade.
  allIncomeItems?: SiengeIncome[];
  // Filtro de empresas selecionadas (mesmo state global do painel).
  selectedCompanies: Set<string>;
  // Filtro de doc types selecionados.
  selectedDocTypes: Set<string>;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

interface CalendarDay {
  date: string;
  day: number;
  isOutside: boolean;
  amount: number;
  count: number;
}

export function CalendarioRecebimentoTab({ itemsAReceber, allIncomeItems, selectedCompanies, selectedDocTypes }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => getCurrentMonthKey());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SiengeIncome | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // 1. Aplica filtros globais (empresa, doc type) sobre itemsAReceber
  const filteredItems = useMemo(() => {
    return itemsAReceber.filter(item => {
      if (selectedCompanies.size > 0 && !selectedCompanies.has(item.companyName)) return false;
      if (selectedDocTypes.size > 0 && !selectedDocTypes.has(item.documentIdentificationName || "")) return false;
      return true;
    });
  }, [itemsAReceber, selectedCompanies, selectedDocTypes]);

  // 2. Filtra pelo mes atual e calcula valor a receber de cada parcela
  const monthItems = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const monthPrefix = `${y}-${String(m).padStart(2, "0")}`;
    return filteredItems
      .filter(item => item.dueDate?.startsWith(monthPrefix))
      .map(item => ({
        id: `${item.billId}-${item.installmentId}`,
        billId: item.billId,
        installmentId: item.installmentId,
        client: item.clientName || "(sem cliente)",
        documentNumber: item.documentNumber || "",
        documentType: item.documentIdentificationName || "",
        companyName: item.companyName,
        dueDate: item.dueDate,
        amount: effectiveOpenAmount(item, true),
        raw: item,
      }))
      .filter(i => i.amount > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);
  }, [filteredItems, currentMonth]);

  // 3. Constroi mapa de dia → { amount, count }
  const dayMap = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    for (const item of monthItems) {
      const key = item.dueDate.substring(0, 10);
      if (!map[key]) map[key] = { amount: 0, count: 0 };
      map[key].amount += item.amount;
      map[key].count += 1;
    }
    return map;
  }, [monthItems]);

  // 4. Constroi grid 6x7 do calendario
  const grid = useMemo<CalendarDay[]>(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrev = new Date(year, month - 1, 0).getDate();

    const cells: CalendarDay[] = [];
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const day = daysInPrev - i;
      const pm = month === 1 ? 12 : month - 1;
      const py = month === 1 ? year - 1 : year;
      const key = `${py}-${String(pm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ date: key, day, isOutside: true, amount: 0, count: 0 });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ date: key, day, isOutside: false, amount: dayMap[key]?.amount || 0, count: dayMap[key]?.count || 0 });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1];
      const [ly, lm, ld] = last.date.split("-").map(Number);
      const next = new Date(ly, lm - 1, ld + 1);
      cells.push({
        date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
        day: next.getDate(), isOutside: true, amount: 0, count: 0,
      });
    }
    // Garante 6 linhas (42 celulas)
    while (cells.length < 42) {
      const last = cells[cells.length - 1];
      const [ly, lm, ld] = last.date.split("-").map(Number);
      const next = new Date(ly, lm - 1, ld + 1);
      cells.push({
        date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
        day: next.getDate(), isOutside: true, amount: 0, count: 0,
      });
    }
    return cells;
  }, [currentMonth, dayMap]);

  const totalAmount = useMemo(() => Object.values(dayMap).reduce((s, d) => s + d.amount, 0), [dayMap]);
  const totalCount = useMemo(() => Object.values(dayMap).reduce((s, d) => s + d.count, 0), [dayMap]);
  const maxDayAmount = useMemo(() => Object.values(dayMap).reduce((m, d) => Math.max(m, d.amount), 0), [dayMap]);

  const monthLabel = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [currentMonth]);

  // 5. Side panel: itens filtrados pelo dia selecionado (ou todos do mes)
  const visibleItems = useMemo(() => {
    if (!selectedDay) return monthItems;
    return monthItems.filter(i => i.dueDate.startsWith(selectedDay));
  }, [monthItems, selectedDay]);

  const groupedByDay = useMemo(() => {
    const groups: { date: string; label: string; total: number; items: typeof monthItems }[] = [];
    const map: Record<string, typeof groups[0]> = {};
    for (const item of visibleItems) {
      const key = item.dueDate.substring(0, 10);
      if (!map[key]) {
        const [y, m, d] = key.split("-").map(Number);
        const label = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        map[key] = { date: key, label, total: 0, items: [] };
        groups.push(map[key]);
      }
      map[key].items.push(item);
      map[key].total += item.amount;
    }
    groups.sort((a, b) => a.date.localeCompare(b.date));
    return groups;
  }, [visibleItems]);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDay) return null;
    const [y, m, d] = selectedDay.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  }, [selectedDay]);

  // Histórico do cliente selecionado: todos os títulos (abertos + pagos) do mesmo
  // cliente, identificado por clientId (fallback clientName). Usa a base completa
  // de income quando disponível; senão cai nos itens a receber.
  const clientHistory = useMemo(() => {
    if (!selectedItem) return [];
    const base = allIncomeItems && allIncomeItems.length > 0 ? allIncomeItems : itemsAReceber;
    const byId = selectedItem.clientId != null && selectedItem.clientId !== 0;
    return base.filter(i =>
      byId ? i.clientId === selectedItem.clientId : (i.clientName || "") === (selectedItem.clientName || "")
    );
  }, [selectedItem, allIncomeItems, itemsAReceber]);

  const handleDayClick = (date: string, isOutside: boolean, amount: number) => {
    if (isOutside || amount === 0) return;
    setSelectedDay(prev => (prev === date ? null : date));
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100dvh-300px)] min-h-[480px]">
      {/* Header com navegação de mês + total */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => { setCurrentMonth(shiftMonth(currentMonth, -1)); setSelectedDay(null); }}
              className="h-8 w-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-[150px] text-center">
              <h2 className="text-base font-bold tracking-tight capitalize leading-tight text-slate-800 dark:text-slate-100">
                {monthLabel}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{totalCount} parcela(s)</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => { setCurrentMonth(shiftMonth(currentMonth, 1)); setSelectedDay(null); }}
              className="h-8 w-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCurrentMonth(getCurrentMonthKey()); setSelectedDay(null); }}
              className="text-xs h-8"
            >
              Hoje
            </Button>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Total do mês</p>
            <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 leading-tight tabular-nums">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Grid + Side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 flex-1 min-h-0">
        {/* Calendário */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xs font-semibold leading-tight text-slate-800 dark:text-slate-200">Calendário de Recebimentos</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Clique em um dia para filtrar</p>
            </div>
          </div>
          {totalCount === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum recebimento previsto para este mês
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1 flex-shrink-0">
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 py-0.5">
                    {wd}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
                {grid.map((cell, i) => {
                  const isSelected = selectedDay === cell.date;
                  const isToday = cell.date === todayStr;
                  const intensity = maxDayAmount > 0 && cell.amount > 0 ? cell.amount / maxDayAmount : 0;
                  const hasValue = cell.amount > 0;
                  const opacity = 0.1 + intensity * 0.45;
                  return (
                    <button
                      key={i}
                      onClick={() => handleDayClick(cell.date, cell.isOutside, cell.amount)}
                      disabled={cell.isOutside || cell.amount === 0}
                      className={`relative min-h-0 rounded-md border p-1.5 text-left transition-all overflow-hidden ${
                        cell.isOutside
                          ? "border-transparent bg-slate-100/50 dark:bg-slate-800/40 text-slate-400/40 cursor-default"
                          : isSelected
                            ? "border-violet-500 ring-2 ring-violet-500/40 cursor-pointer"
                            : isToday
                              ? "border-amber-400 dark:border-amber-500 ring-1 ring-amber-300/50 dark:ring-amber-500/30 cursor-pointer"
                              : hasValue
                                ? "border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:shadow-md cursor-pointer"
                                : "border-slate-200/50 dark:border-slate-700/50 text-slate-400/60 cursor-default"
                      }`}
                      style={
                        isSelected
                          ? { backgroundColor: "rgba(139, 92, 246, 0.55)" }
                          : hasValue
                            ? { backgroundColor: `rgba(16, 185, 129, ${opacity})` }
                            : undefined
                      }
                    >
                      <div className={`text-[11px] font-bold leading-none flex items-center gap-0.5 ${isSelected ? "text-white" : "text-slate-700 dark:text-slate-200"}`}>
                        {cell.day}
                        {isToday && !cell.isOutside && (
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      {hasValue && (
                        <>
                          <div
                            className={`absolute bottom-1 left-1 right-1 text-[10px] font-semibold leading-tight truncate text-center ${
                              isSelected ? "text-white" : "text-slate-700 dark:text-slate-200"
                            }`}
                            title={formatCurrency(cell.amount)}
                          >
                            {formatCurrency(cell.amount)}
                          </div>
                          <div className={`absolute top-1 right-1.5 text-[9px] font-medium ${isSelected ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}>
                            {cell.count}×
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
                <List className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold truncate leading-tight text-slate-800 dark:text-slate-200">
                  {selectedDay ? `Recebimentos de ${selectedDayLabel}` : "Todos os recebimentos do mês"}
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {visibleItems.length} {visibleItems.length === 1 ? "cliente" : "clientes"}
                </p>
              </div>
            </div>
            {selectedDay && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)} className="text-xs flex-shrink-0 h-7">
                Limpar
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0">
            {visibleItems.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Nenhum recebimento</p>
            ) : (
              <div className="space-y-3">
                {groupedByDay.map((group) => (
                  <div key={group.date} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200/40 dark:border-emerald-800/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{group.label}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          ({group.items.length} {group.items.length === 1 ? "cliente" : "clientes"})
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        {formatCurrency(group.total)}
                      </span>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-2 px-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => setSelectedItem(item.raw)}
                                className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline hover:text-emerald-900 dark:hover:text-emerald-200 text-left break-words cursor-pointer"
                                title={`Ver detalhes de ${item.client}`}
                              >
                                {item.client}
                              </button>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 break-words">
                                {item.companyName} {item.documentNumber && <>· {item.documentNumber}</>}
                              </p>
                            </td>
                            <td className="py-2 px-3 text-xs font-semibold text-right whitespace-nowrap tabular-nums text-slate-800 dark:text-slate-200">
                              {formatCurrency(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ReceiptDetailModal
        item={selectedItem}
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        clientHistory={clientHistory}
      />
    </div>
  );
}
