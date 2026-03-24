"use client";

import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  ChevronDown,
  Filter,
  Loader2,
  X,
  FileText,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
  Calendar,
  Save,
  Building2,
  FolderOpen,
  Users,
} from "lucide-react";
import { SiengeOutcome, SiengeIncome } from "@/types/sienge";
import { toast } from "sonner";

type ContasItem = SiengeOutcome | SiengeIncome;

function getCounterpartName(item: ContasItem): string {
  if ("creditorName" in item) return item.creditorName || "";
  return (item as SiengeIncome).clientName || "";
}

function getCounterpartId(item: ContasItem): number {
  if ("creditorId" in item) return item.creditorId;
  return (item as SiengeIncome).clientId;
}

function getBuildingsCosts(item: ContasItem) {
  if ("buildingsCosts" in item) return item.buildingsCosts || [];
  return [];
}

type SortField =
  | "billId"
  | "dueDate"
  | "daysOverdue"
  | "creditorName"
  | "companyName"
  | "projectName"
  | "documentNumber"
  | "documentType"
  | "costEstimationSheet"
  | "financialCategory"
  | "originalAmount"
  | "balanceAmount"
  | "paymentDate"
  | "paidAmount";

type SortDir = "asc" | "desc";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  // Extract just the date portion in case Sienge returns full ISO datetime strings
  const datePart = String(dateStr).split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return String(dateStr);
  // Parse as local noon to avoid UTC midnight → previous BRT day conversion
  const d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function daysDiff(dateStr: string) {
  const due = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function latestPaymentDate(item: ContasItem, yearFilter?: string, monthFilter?: string): string {
  const dates = (item.payments || [])
    .filter(p => {
      if (!p.paymentDate || p.netAmount <= 0) return false;
      if (yearFilter && yearFilter !== "all" && !p.paymentDate.startsWith(yearFilter)) return false;
      if (monthFilter && monthFilter !== "all" && p.paymentDate.substring(5, 7) !== monthFilter) return false;
      return true;
    })
    .map(p => p.paymentDate);
  if (dates.length === 0) return "";
  return dates.sort().reverse()[0];
}

// ▼▼▼ VALIDATED 2026-03-18 — paidTotal — DO NOT MODIFY without explicit user request ▼▼▼
// Valor líquido = netAmount - taxAmount (matches Sienge "Contas Pagas Sintético" Líquido column)
function paidTotal(item: ContasItem, yearFilter?: string, monthFilter?: string): number {
  const matchesPeriod = (paymentDate: string) => {
    if (yearFilter && yearFilter !== "all" && !paymentDate.startsWith(yearFilter)) return false;
    if (monthFilter && monthFilter !== "all" && paymentDate.substring(5, 7) !== monthFilter) return false;
    return true;
  };
  const hasFilter = (yearFilter && yearFilter !== "all") || (monthFilter && monthFilter !== "all");

  // Always sum from payments array using valor líquido (netAmount - taxAmount)
  // to match Sienge "Contas Pagas Sintético" Líquido column
  const payments = (item.payments || [])
    .filter(p => p.netAmount > 0 && (!hasFilter || (p.paymentDate && matchesPeriod(p.paymentDate))));
  return payments.reduce((s, p) => s + (p.netAmount - (p.taxAmount || 0)), 0);
}
// ▲▲▲ END VALIDATED — paidTotal ▲▲▲

const monthNames = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];


function MultiSelectFilter({
  label,
  icon,
  allOptions,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  activeColor = "blue",
  labelFn,
  onSaveDefault,
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
  onSaveDefault?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const getLabel = labelFn || ((v: string) => v);

  const filteredOpts = useMemo(() => {
    if (!search) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(n => getLabel(n).toLowerCase().includes(q) || n.toLowerCase().includes(q));
  }, [allOptions, search, getLabel]);

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
          className={`w-full justify-between font-normal h-10 gap-2 ${selected.size > 0 ? `border-${activeColor}-300 bg-${activeColor}-50 text-${activeColor}-700` : ""}`}
        >
          <span className="flex items-center gap-2 truncate">
            {icon}
            {selected.size === 0
              ? `Todas`
              : selected.size === 1
              ? getLabel([...selected][0])
              : `${selected.size} selecionados`}
          </span>
          {selected.size > 0 && (
            <Badge variant="secondary" className={`ml-1 bg-${activeColor}-100 text-${activeColor}-700 text-[10px] px-1.5 py-0`}>
              {selected.size}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
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
        {!search && (
          <div className="px-1 pt-1">
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 border-b mb-1 pb-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => {
                  if (allSelected) onClear();
                  else onSelectAll();
                }}
              />
              <span>Selecionar tudo</span>
              <span className="ml-auto text-xs text-slate-400">{allOptions.length}</span>
            </label>
          </div>
        )}
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filteredOpts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum resultado</p>
          ) : (
            filteredOpts.map(name => (
              <label
                key={name}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 cursor-pointer text-sm"
              >
                <Checkbox
                  checked={selected.has(name)}
                  onCheckedChange={() => onToggle(name)}
                />
                <span className="truncate">{getLabel(name)}</span>
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

interface ContasTableProps {
  mode: "a-vencer" | "vencidas" | "pagas";
  title: string;
  subtitle: string;
  dataSource?: "outcome" | "income";
}

export function ContasTable({ mode, title, subtitle, dataSource = "outcome" }: ContasTableProps) {
  const isIncome = dataSource === "income";
  const counterpartLabel = isIncome ? "Cliente" : "Credor";
  const counterpartLabelPlural = isIncome ? "clientes" : "credores";
  const apiEndpoint = isIncome ? "/api/sienge/income" : "/api/sienge/outcome";
  const isOverdue = mode === "vencidas";
  const isPagas = mode === "pagas";

  const currentYear = new Date().getFullYear();

  const [items, setItems] = useState<ContasItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [exclusionSet, setExclusionSet] = useState<Set<string>>(new Set());
  const [filterEmpresas, setFilterEmpresas] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${dataSource}_${mode}_default_empresas`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterCentrosCusto, setFilterCentrosCusto] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${dataSource}_${mode}_default_centrosCusto`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterCredores, setFilterCredores] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${dataSource}_${mode}_default_credores`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterTipoDoc, setFilterTipoDoc] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${dataSource}_${mode}_default_tipoDoc`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterPlanoFinanceiro, setFilterPlanoFinanceiro] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${dataSource}_${mode}_default_planoFinanceiro`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterTipoBaixa, setFilterTipoBaixa] = useState<Set<string>>(new Set());
  const [filterAno, setFilterAno] = useState(isOverdue ? "all" : String(currentYear));
  const [filterMes, setFilterMes] = useState("all");
  const [filterDia, setFilterDia] = useState<string[]>([]);

  // API date range: always the full selected year.
  // For "pagas/recebidas" mode, fetch extra years back to capture items with old due dates
  // that were paid/received in the selected year.
  // For "a-receber/vencidas" mode, extend endDate to include future parcels.
  // Fixed date range — same as Painel Executivo so they share the same DB cache
  const { startDate, endDate } = useMemo(() => {
    return { startDate: `${currentYear - 10}-01-01`, endDate: `${currentYear + 5}-12-31` };
  }, [currentYear]);
  const [sortField, setSortField] = useState<SortField>(isPagas ? "paymentDate" : "dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [expandedBills, setExpandedBills] = useState<Set<number>>(new Set());
  const [subSort, setSubSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "installmentId", dir: "asc" });
  const perPage = 25;

  const [billNotes, setBillNotes] = useState<Record<number, string | null>>({});
  const [loadingNotes, setLoadingNotes] = useState<Set<number>>(new Set());
  const fetchedNotesRef = React.useRef<Set<number>>(new Set());

  const fetchBillNotes = useCallback(async (billId: number) => {
    if (fetchedNotesRef.current.has(billId)) return;
    fetchedNotesRef.current.add(billId);
    setLoadingNotes((prev) => { const next = new Set(prev); next.add(billId); return next; });
    try {
      const res = await fetch(`/api/sienge/bills?id=${billId}`);
      const data = await res.json();
      setBillNotes((prev) => ({ ...prev, [billId]: data.notes || null }));
    } catch {
      setBillNotes((prev) => ({ ...prev, [billId]: null }));
    } finally {
      setLoadingNotes((prev) => { const next = new Set(prev); next.delete(billId); return next; });
    }
  }, []);

  const toggleBillExpand = useCallback((billId: number) => {
    setExpandedBills((prev) => {
      const wasExpanded = prev.has(billId);
      const next = new Set(prev);
      if (wasExpanded) {
        next.delete(billId);
      } else {
        next.add(billId);
      }
      if (!wasExpanded) {
        setTimeout(() => fetchBillNotes(billId), 0);
      }
      return next;
    });
  }, [fetchBillNotes]);

  const [error, setError] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `${apiEndpoint}?startDate=${startDate}&endDate=${endDate}` +
        (forceRefresh ? "&forceRefresh=true" : "")
      );
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setItems(data.data || []);
      setPage(0);
      setBillNotes({});
      fetchedNotesRef.current = new Set();
    } catch {
      setItems([]);
      setError(true);
      toast.error("Erro ao carregar dados do Sienge", {
        description: "Verifique sua conexao e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, apiEndpoint]);

  // Only fetch on mount. Subsequent fetches are triggered explicitly by the
  // "Buscar" and "Atualizar" buttons so that changing the date inputs does
  // not fire an immediate (and possibly Sienge-hitting) request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    fetch("/api/bill-exclusions")
      .then(res => res.json())
      .then(json => {
        const set = new Set<string>();
        ((json.data || []) as { companyId: number; billId: number }[]).forEach(e => set.add(`${e.companyId}:${e.billId}`));
        setExclusionSet(set);
      })
      .catch(() => {});
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Extract unique values for filters
  const empresaNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.companyName) set.add(item.companyName);
    });
    return Array.from(set).sort();
  }, [items]);

  const centroCustoNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (filterEmpresas.size > 0 && !filterEmpresas.has(item.companyName)) return;
      item.paymentsCategories?.forEach((cat) => {
        if (cat.costCenterName) set.add(cat.costCenterName);
      });
    });
    return Array.from(set).sort();
  }, [items, filterEmpresas]);

  const credorNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const name = getCounterpartName(item);
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [items]);

  const tiposDocumento = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const tipo = item.documentIdentificationId?.trim();
      if (tipo) set.add(tipo);
    });
    return Array.from(set).sort();
  }, [items]);

  const planoFinanceiroNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      item.paymentsCategories?.forEach((cat) => {
        if (cat.financialCategoryName) set.add(cat.financialCategoryName);
      });
    });
    return Array.from(set).sort();
  }, [items]);

  const tiposBaixa = useMemo(() => {
    if (!isIncome) return [];
    const set = new Set<string>();
    items.forEach((item) => {
      (item.payments || []).forEach((p) => {
        if (p.operationTypeName) set.add(p.operationTypeName);
      });
    });
    return Array.from(set).sort();
  }, [items, isIncome]);

  const toggleDia = (dia: string) => {
    setFilterDia((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
    );
    setPage(0);
  };

  // Static year/month lists; day count depends on selected month
  const anosDisponiveis = useMemo(() => {
    if (isPagas) {
      return Array.from({ length: 11 }, (_, i) => String(currentYear - 10 + i));
    }
    // Para a-receber/vencidas: extrair anos dos dados reais
    const years = new Set<string>();
    items.forEach(i => {
      if (i.dueDate) years.add(i.dueDate.substring(0, 4));
    });
    if (years.size === 0) {
      return Array.from({ length: 6 }, (_, i) => String(currentYear + i));
    }
    return Array.from(years).sort();
  }, [currentYear, isPagas, items]);

  const mesesDisponiveis = ["01","02","03","04","05","06","07","08","09","10","11","12"];

  const diasDisponiveis = useMemo(() => {
    if (filterMes === "all") {
      return Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
    }
    const yr = filterAno === "all" ? currentYear : parseInt(filterAno, 10);
    const lastDay = new Date(yr, parseInt(filterMes, 10), 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => String(i + 1).padStart(2, "0"));
  }, [filterMes, filterAno, currentYear]);

  // Filter
  const filtered = useMemo(() => {
    return items.filter((item) => {
      // Exclude bills configured in Configuracoes > Exclusao de Titulos
      if (exclusionSet.size > 0 && exclusionSet.has(`${item.companyId}:${item.billId}`)) return false;

      if (isPagas) {
        if (isIncome) {
          // For income "recebidas" mode: show items that have any receipt (baixa) in the period
          // This includes partial payments (correctedBalanceAmount > 0)
          if (item.originalAmount <= 0) return false;

          const payments = item.payments || [];
          // Must have at least one receipt with a payment date
          const hasReceipts = payments.some(p => p.paymentDate);
          if (!hasReceipts) return false;

          // Filter by year
          if (filterAno !== "all") {
            const hasInYear = payments.some(p =>
              p.paymentDate && p.paymentDate.startsWith(filterAno)
            );
            if (!hasInYear) return false;
          }

          // Filter by month
          if (filterMes !== "all") {
            const hasInMonth = payments.some(p =>
              p.paymentDate &&
              (filterAno === "all" || p.paymentDate.startsWith(filterAno)) &&
              p.paymentDate.substring(5, 7) === filterMes
            );
            if (!hasInMonth) return false;
          }
        } else {
          // For outcome "pagas" mode: must have payments in the selected year
          const hasPaidInYear = (item.payments || []).some(p =>
            p.netAmount > 0 && p.paymentDate &&
            (filterAno === "all" || p.paymentDate.startsWith(filterAno))
          );
          if (!hasPaidInYear) return false;

          // Month filter: by payment date
          if (filterMes !== "all") {
            const hasPayInMonth = (item.payments || []).some(p =>
              p.netAmount > 0 && p.paymentDate &&
              (filterAno === "all" || p.paymentDate.startsWith(filterAno)) &&
              p.paymentDate.substring(5, 7) === filterMes
            );
            if (!hasPayInMonth) return false;
          }
        }
      } else {
        if (item.balanceAmount === 0) return false;

        // Mode filter
        const dueDate = new Date(item.dueDate + "T00:00:00");
        if (isOverdue && dueDate >= today) return false;
        if (!isOverdue && dueDate < today) return false;

        // Year filter
        if (filterAno !== "all" && item.dueDate?.substring(0, 4) !== filterAno)
          return false;

        // Month filter
        if (filterMes !== "all" && item.dueDate?.substring(5, 7) !== filterMes)
          return false;
      }

      if (search) {
        const s = search.toLowerCase();
        const match =
          getCounterpartName(item).toLowerCase().includes(s) ||
          item.companyName?.toLowerCase().includes(s) ||
          item.projectName?.toLowerCase().includes(s) ||
          item.documentNumber?.includes(search);
        if (!match) return false;
      }

      if (filterEmpresas.size > 0 && !filterEmpresas.has(item.companyName))
        return false;

      if (filterCentrosCusto.size > 0) {
        const has = item.paymentsCategories?.some(
          (cat) => filterCentrosCusto.has(cat.costCenterName)
        );
        if (!has) return false;
      }

      if (filterCredores.size > 0 && !filterCredores.has(getCounterpartName(item)))
        return false;

      if (filterTipoDoc.size > 0) {
        const tipo = item.documentIdentificationId?.trim() || "";
        if (!filterTipoDoc.has(tipo)) return false;
      }

      if (filterPlanoFinanceiro.size > 0) {
        const has = item.paymentsCategories?.some(
          (cat) => filterPlanoFinanceiro.has(cat.financialCategoryName)
        );
        if (!has) return false;
      }

      if (filterTipoBaixa.size > 0 && isIncome) {
        const hasType = (item.payments || []).some(p =>
          p.operationTypeName && filterTipoBaixa.has(p.operationTypeName)
        );
        if (!hasType) return false;
      }

      if (filterDia.length > 0) {
        if (isPagas && !isIncome) {
          const hasPayInDay = (item.payments || []).some(p =>
            p.netAmount > 0 && p.paymentDate && filterDia.includes(p.paymentDate.substring(8, 10))
          );
          if (!hasPayInDay) return false;
        } else {
          const dia = item.dueDate?.substring(8, 10);
          if (!dia || !filterDia.includes(dia)) return false;
        }
      }

      return true;
    });
  }, [items, search, filterEmpresas, filterCentrosCusto, filterCredores, filterTipoDoc, filterPlanoFinanceiro, filterTipoBaixa, filterAno, filterMes, filterDia, isOverdue, isPagas, isIncome, today, exclusionSet]);

  // Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "billId": cmp = a.billId - b.billId; break;
        case "dueDate": cmp = (a.dueDate || "").localeCompare(b.dueDate || ""); break;
        case "daysOverdue": cmp = daysDiff(a.dueDate) - daysDiff(b.dueDate); break;
        case "creditorName": cmp = getCounterpartName(a).localeCompare(getCounterpartName(b)); break;
        case "companyName": cmp = (a.companyName || "").localeCompare(b.companyName || ""); break;
        case "projectName": cmp = (a.projectName || "").localeCompare(b.projectName || ""); break;
        case "documentNumber": cmp = (a.documentNumber || "").localeCompare(b.documentNumber || ""); break;
        case "documentType": cmp = (a.documentIdentificationId || "").localeCompare(b.documentIdentificationId || ""); break;
        case "costEstimationSheet": cmp = (getBuildingsCosts(a)[0]?.costEstimationSheetName || "").localeCompare(getBuildingsCosts(b)[0]?.costEstimationSheetName || ""); break;
        case "financialCategory": cmp = (a.paymentsCategories?.[0]?.financialCategoryName || "").localeCompare(b.paymentsCategories?.[0]?.financialCategoryName || ""); break;
        case "originalAmount": cmp = a.originalAmount - b.originalAmount; break;
        case "balanceAmount": cmp = a.correctedBalanceAmount - b.correctedBalanceAmount; break;
        case "paymentDate": cmp = (latestPaymentDate(a, filterAno, filterMes) || "").localeCompare(latestPaymentDate(b, filterAno, filterMes) || ""); break;
        case "paidAmount": cmp = paidTotal(a, filterAno, filterMes) - paidTotal(b, filterAno, filterMes); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir, filterAno, filterMes]);

  // Group parcelas by billId
  const parcelasByBill = useMemo(() => {
    const map = new Map<number, ContasItem[]>();
    sorted.forEach((item) => {
      const list = map.get(item.billId) || [];
      list.push(item);
      map.set(item.billId, list);
    });
    return map;
  }, [sorted]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / perPage);
  const paginatedItems = sorted.slice(page * perPage, (page + 1) * perPage);

  // Calcula encargos (juros 1% a.m. + multa 2%) para inadimplentes
  const calcEncargos = useCallback((item: ContasItem) => {
    if (!isOverdue || !item.dueDate) return 0;
    const due = new Date(item.dueDate + "T00:00:00");
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let dias = Math.max(0, Math.floor((hoje.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    if (dias <= 0) return 0;
    // Ajuste para períodos > 365 dias para alinhar com cálculo do Sienge
    if (dias > 365) dias = dias - 1;
    const saldo = item.correctedBalanceAmount || 0;
    const multa = saldo * 0.02; // 2% multa
    const juros = (saldo + multa) * 0.01 * (dias / 30); // 1% a.m. pro-rata sobre saldo + multa
    return multa + juros;
  }, [isOverdue]);

  const totalAmount = useMemo(
    () => sorted.reduce((sum, item) => sum + (item.originalAmount || 0), 0),
    [sorted]
  );
  const totalBalance = useMemo(
    () => sorted.reduce((sum, item) => sum + (item.correctedBalanceAmount || 0), 0),
    [sorted]
  );
  const totalPaid = useMemo(
    () => sorted.reduce((sum, item) => sum + paidTotal(item, filterAno, filterMes), 0),
    [sorted, filterAno, filterMes]
  );
  const totalComEncargos = useMemo(
    () => isOverdue ? sorted.reduce((sum, item) => sum + (item.correctedBalanceAmount || 0) + calcEncargos(item), 0) : 0,
    [sorted, isOverdue, calcEncargos]
  );

  // Card: Contas a pagar/vencidas hoje
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todayStats = useMemo(() => {
    if (isPagas) {
      if (isIncome) {
        // Income "recebidas": check payments for today
        let valor = 0;
        const billIds = new Set<number>();
        const credorIds = new Set<number>();
        sorted.forEach(item => {
          (item.payments || []).filter(p => p.paymentDate === todayStr && p.netAmount > 0).forEach(p => {
            valor += p.netAmount;
            billIds.add(item.billId);
            credorIds.add(getCounterpartId(item));
          });
        });
        return { valor, titulos: billIds.size, credores: credorIds.size, parcelas: billIds.size };
      }
      // Paid today
      let valor = 0;
      const billIds = new Set<number>();
      const credorIds = new Set<number>();
      sorted.forEach(item => {
        (item.payments || []).filter(p => p.paymentDate === todayStr && p.netAmount > 0).forEach(p => {
          valor += p.netAmount;
          billIds.add(item.billId);
          credorIds.add(getCounterpartId(item));
        });
      });
      return { valor, titulos: billIds.size, credores: credorIds.size, parcelas: billIds.size };
    }
    const todayItems = sorted.filter((item) => item.dueDate === todayStr);
    const valor = todayItems.reduce((s, i) => s + (i.correctedBalanceAmount || 0), 0);
    const titulos = new Set(todayItems.map((i) => i.billId)).size;
    const credores = new Set(todayItems.map((i) => getCounterpartId(i))).size;
    return { valor, titulos, credores, parcelas: todayItems.length };
  }, [sorted, todayStr, isPagas, isIncome]);

  // Card: Contas semana (proximos 7 dias ou ultimos 7 dias)
  const weekStats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (isPagas) {
      // Paid/received last 7 days
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().split("T")[0];
      if (isIncome) {
        // Income: check payments in last 7 days
        let valor = 0;
        const billIds = new Set<number>();
        const credorIds = new Set<number>();
        sorted.forEach(item => {
          (item.payments || []).filter(p =>
            p.netAmount > 0 && p.paymentDate && p.paymentDate >= d7Str && p.paymentDate <= todayStr
          ).forEach(p => {
            valor += p.netAmount;
            billIds.add(item.billId);
            credorIds.add(getCounterpartId(item));
          });
        });
        return { valor, titulos: billIds.size, credores: credorIds.size, parcelas: billIds.size };
      }
      let valor = 0;
      const billIds = new Set<number>();
      const credorIds = new Set<number>();
      sorted.forEach(item => {
        (item.payments || []).filter(p =>
          p.netAmount > 0 && p.paymentDate && p.paymentDate >= d7Str && p.paymentDate <= todayStr
        ).forEach(p => {
          valor += p.netAmount;
          billIds.add(item.billId);
          credorIds.add(getCounterpartId(item));
        });
      });
      return { valor, titulos: billIds.size, credores: credorIds.size, parcelas: billIds.size };
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const limit = new Date(now);
    if (isOverdue) {
      limit.setDate(limit.getDate() - 7);
    } else {
      limit.setDate(limit.getDate() + 7);
    }
    const weekItems = sorted.filter((item) => {
      const d = new Date(item.dueDate + "T00:00:00");
      return isOverdue ? d >= limit && d <= yesterday : d >= tomorrow && d <= limit;
    });
    const valor = weekItems.reduce((s, i) => s + (i.correctedBalanceAmount || 0), 0);
    const titulos = new Set(weekItems.map((i) => i.billId)).size;
    const credores = new Set(weekItems.map((i) => getCounterpartId(i))).size;
    return { valor, titulos, credores, parcelas: weekItems.length };
  }, [sorted, isOverdue, isPagas, isIncome, todayStr]);

  const hasActiveFilters =
    filterEmpresas.size > 0 ||
    filterCentrosCusto.size > 0 ||
    filterCredores.size > 0 ||
    filterTipoDoc.size > 0 ||
    filterTipoBaixa.size > 0 ||
    filterDia.length > 0 ||
    search !== "";

  const clearFilters = () => {
    setFilterEmpresas(new Set());
    setFilterCentrosCusto(new Set());
    setFilterCredores(new Set());
    setFilterTipoDoc(new Set());
    setFilterTipoBaixa(new Set());
    setFilterDia([]);
    setSearch("");
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-white" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-white" />
    );
  };

  const SortableHead = ({
    field,
    children,
    className = "",
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        onClick={() => handleSort(field)}
        className="flex items-center gap-0.5 hover:text-white transition-colors w-full"
      >
        {children}
        <SortIcon field={field} />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          <p className="text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "bg-emerald-500 animate-pulse"}`} />
            <span className={error ? "text-red-500" : "text-slate-400"}>
              {error ? "Sienge offline" : "Sienge conectado"}
            </span>
          </div>
          <Badge variant="secondary" className="text-sm py-1">
            {sorted.length} parcelas
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={`grid gap-4 md:grid-cols-3 ${isOverdue ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <Card className={`border-0 shadow-md overflow-hidden ${isPagas ? "bg-emerald-50/60" : isOverdue ? "bg-red-50/60" : "bg-amber-50/60"}`}>
          <div className={`h-1.5 ${isPagas ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : isOverdue ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-amber-500 to-amber-400"}`} />
          <CardContent className="p-4">
            <div className={`text-xs font-bold uppercase tracking-widest ${isPagas ? "text-emerald-600/80" : isOverdue ? "text-red-600/80" : "text-amber-600/80"}`}>{isPagas ? (isIncome ? "Recebido Hoje" : "Pago Hoje") : isOverdue ? (isIncome ? "Inadimplentes Hoje" : "Vencidas Hoje") : (isIncome ? "A Receber Hoje" : "A Pagar Hoje")}</div>
            <div className={`text-2xl font-black mt-1 ${isPagas ? "text-emerald-700" : isOverdue ? "text-red-700" : "text-amber-700"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(todayStats.valor)}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5 space-x-2">
                <span>{todayStats.titulos} {todayStats.titulos === 1 ? "titulo" : "titulos"}</span>
                <span>·</span>
                <span>{todayStats.credores} {todayStats.credores === 1 ? counterpartLabel.toLowerCase() : counterpartLabelPlural}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-md overflow-hidden ${isPagas ? "bg-teal-50/60" : isOverdue ? "bg-orange-50/60" : "bg-blue-50/60"}`}>
          <div className={`h-1.5 ${isPagas ? "bg-gradient-to-r from-teal-500 to-teal-400" : isOverdue ? "bg-gradient-to-r from-orange-500 to-orange-400" : "bg-gradient-to-r from-blue-500 to-blue-400"}`} />
          <CardContent className="p-4">
            <div className={`text-xs font-bold uppercase tracking-widest ${isPagas ? "text-teal-600/80" : isOverdue ? "text-orange-600/80" : "text-blue-600/80"}`}>{isPagas ? (isIncome ? "Recebido ultimos 7 dias" : "Pago ultimos 7 dias") : isOverdue ? (isIncome ? "Inadimplentes ultimos 7 dias" : "Vencidas ultimos 7 dias") : (isIncome ? "A Receber em 7 dias" : "A Pagar em 7 dias")}</div>
            <div className={`text-2xl font-black mt-1 ${isPagas ? "text-teal-700" : isOverdue ? "text-orange-700" : "text-blue-700"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(weekStats.valor)}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5 space-x-2">
                <span>{weekStats.titulos} {weekStats.titulos === 1 ? "titulo" : "titulos"}</span>
                <span>·</span>
                <span>{weekStats.credores} {weekStats.credores === 1 ? counterpartLabel.toLowerCase() : counterpartLabelPlural}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md overflow-hidden bg-slate-50/60">
          <div className="h-1.5 bg-gradient-to-r from-slate-400 to-slate-300" />
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500/80">Total Parcelas</div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {loading ? <Skeleton className="h-7 w-16" /> : sorted.length}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => i.billId)).size} titulos
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-md overflow-hidden ${isPagas ? "bg-green-50/60" : "bg-indigo-50/60"}`}>
          <div className={`h-1.5 ${isPagas ? "bg-gradient-to-r from-green-500 to-green-400" : "bg-gradient-to-r from-indigo-500 to-indigo-400"}`} />
          <CardContent className="p-4">
            <div className={`text-xs font-bold uppercase tracking-widest ${isPagas ? "text-green-600/80" : "text-indigo-600/80"}`}>{isPagas ? (isIncome ? "Total Recebido" : "Total Pago") : "Valor Original"}</div>
            <div className={`text-2xl font-black mt-1 ${isPagas ? "text-green-700" : "text-indigo-700"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(isPagas ? totalPaid : totalAmount)}
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-md overflow-hidden ${isOverdue ? "bg-red-50/60" : "bg-violet-50/60"}`}>
          <div className={`h-1.5 ${isOverdue ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-violet-500 to-violet-400"}`} />
          <CardContent className="p-4">
            <div className={`text-xs font-bold uppercase tracking-widest ${isOverdue ? "text-red-600/80" : "text-violet-600/80"}`}>{isPagas ? counterpartLabelPlural.charAt(0).toUpperCase() + counterpartLabelPlural.slice(1) : "Saldo Pendente"}</div>
            <div className={`text-2xl font-black mt-1 ${isOverdue ? "text-red-700" : "text-violet-700"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : isPagas
                ? `${new Set(sorted.map((i) => getCounterpartId(i))).size}`
                : formatCurrency(totalBalance)}
            </div>
            {!loading && !isPagas && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => getCounterpartId(i))).size} {counterpartLabelPlural}
              </div>
            )}
            {!loading && isPagas && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => i.companyName)).size} empresas
              </div>
            )}
          </CardContent>
        </Card>
        {isOverdue && (
          <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="text-sm text-slate-500">Total com Encargos</div>
              <div className="text-xl font-bold mt-1 text-orange-600">
                {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(totalComEncargos)}
              </div>
              <div className="text-xs text-slate-400 mt-1.5">
                Juros 1% a.m. + Multa 2%
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters + Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[100px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Ano</label>
                <Select value={filterAno} onValueChange={(v) => { setFilterAno(v); setFilterMes("all"); setFilterDia([]); setPage(0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {anosDisponiveis.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[120px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Mês</label>
                <Select value={filterMes} onValueChange={(v) => { setFilterMes(v); setFilterDia([]); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {mesesDisponiveis.map((m) => <SelectItem key={m} value={m}>{monthNames[parseInt(m, 10) - 1]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[140px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Dia</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal h-10">
                      <span className="flex items-center gap-2 truncate">
                        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                        {filterDia.length === 0
                          ? "Todos"
                          : filterDia.length === 1
                          ? `Dia ${parseInt(filterDia[0], 10)}`
                          : `${filterDia.length} dias`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2" align="start">
                    <div className="grid grid-cols-7 gap-1">
                      {diasDisponiveis.map((dia) => (
                        <button
                          key={dia}
                          type="button"
                          onClick={() => toggleDia(dia)}
                          className={`h-8 w-8 text-xs rounded-md font-mono transition-colors ${
                            filterDia.includes(dia)
                              ? "bg-blue-500 text-white font-bold"
                              : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          {parseInt(dia, 10)}
                        </button>
                      ))}
                    </div>
                    {filterDia.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs h-7"
                          onClick={() => setFilterDia([])}
                        >
                          Limpar seleção
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={() => fetchData()} disabled={loading} size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Filter className="h-4 w-4 mr-1" />}
                Buscar
              </Button>
              <Button onClick={() => fetchData(true)} disabled={loading} size="sm" variant="outline">
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Busca geral</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Buscar..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-10" />
                </div>
              </div>

              <div className="min-w-[200px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Empresa</label>
                <MultiSelectFilter
                  label="Empresa"
                  icon={<Building2 className="h-4 w-4 text-slate-400" />}
                  allOptions={empresaNames}
                  selected={filterEmpresas}
                  onToggle={(name) => { setFilterEmpresas(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                  onSelectAll={() => { setFilterEmpresas(new Set(empresaNames)); setPage(0); }}
                  onClear={() => { setFilterEmpresas(new Set()); setPage(0); }}
                  onSaveDefault={() => { localStorage.setItem(`contas_${dataSource}_${mode}_default_empresas`, JSON.stringify([...filterEmpresas])); toast.success("Padrao de empresas salvo!"); }}
                />
              </div>

              <div className="min-w-[220px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Centro de Custo</label>
                <MultiSelectFilter
                  label="Centro de Custo"
                  icon={<FolderOpen className="h-4 w-4 text-slate-400" />}
                  allOptions={centroCustoNames}
                  selected={filterCentrosCusto}
                  onToggle={(name) => { setFilterCentrosCusto(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                  onSelectAll={() => { setFilterCentrosCusto(new Set(centroCustoNames)); setPage(0); }}
                  onClear={() => { setFilterCentrosCusto(new Set()); setPage(0); }}
                  onSaveDefault={() => { localStorage.setItem(`contas_${dataSource}_${mode}_default_centrosCusto`, JSON.stringify([...filterCentrosCusto])); toast.success("Padrao de centros de custo salvo!"); }}
                />
              </div>

              <div className="min-w-[220px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">{counterpartLabel}</label>
                <MultiSelectFilter
                  label={counterpartLabel}
                  icon={<Users className="h-4 w-4 text-slate-400" />}
                  allOptions={credorNames}
                  selected={filterCredores}
                  onToggle={(name) => { setFilterCredores(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                  onSelectAll={() => { setFilterCredores(new Set(credorNames)); setPage(0); }}
                  onClear={() => { setFilterCredores(new Set()); setPage(0); }}
                  onSaveDefault={() => { localStorage.setItem(`contas_${dataSource}_${mode}_default_credores`, JSON.stringify([...filterCredores])); toast.success(`Padrao de ${counterpartLabelPlural} salvo!`); }}
                />
              </div>

              <div className="min-w-[180px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo Documento</label>
                <MultiSelectFilter
                  label="Tipo Doc"
                  icon={<FileText className="h-4 w-4 text-slate-400" />}
                  allOptions={tiposDocumento}
                  selected={filterTipoDoc}
                  onToggle={(name) => { setFilterTipoDoc(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                  onSelectAll={() => { setFilterTipoDoc(new Set(tiposDocumento)); setPage(0); }}
                  onClear={() => { setFilterTipoDoc(new Set()); setPage(0); }}
                  onSaveDefault={() => { localStorage.setItem(`contas_${dataSource}_${mode}_default_tipoDoc`, JSON.stringify([...filterTipoDoc])); toast.success("Padrao de tipo documento salvo!"); }}
                />
              </div>

              {!isIncome && planoFinanceiroNames.length > 0 && (
                <div className="min-w-[220px]">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Plano Financeiro</label>
                  <MultiSelectFilter
                    label="Plano Financeiro"
                    icon={<FolderOpen className="h-4 w-4 text-slate-400" />}
                    allOptions={planoFinanceiroNames}
                    selected={filterPlanoFinanceiro}
                    onToggle={(name) => { setFilterPlanoFinanceiro(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                    onSelectAll={() => { setFilterPlanoFinanceiro(new Set(planoFinanceiroNames)); setPage(0); }}
                    onClear={() => { setFilterPlanoFinanceiro(new Set()); setPage(0); }}
                    onSaveDefault={() => { localStorage.setItem(`contas_${dataSource}_${mode}_default_planoFinanceiro`, JSON.stringify([...filterPlanoFinanceiro])); toast.success("Padrao de plano financeiro salvo!"); }}
                  />
                </div>
              )}

              {isIncome && tiposBaixa.length > 0 && (
                <div className="min-w-[180px]">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo de Baixa</label>
                  <MultiSelectFilter
                    label="Tipo Baixa"
                    icon={<ArrowDown className="h-4 w-4 text-slate-400" />}
                    allOptions={tiposBaixa}
                    selected={filterTipoBaixa}
                    onToggle={(name) => { setFilterTipoBaixa(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                    onSelectAll={() => { setFilterTipoBaixa(new Set(tiposBaixa)); setPage(0); }}
                    onClear={() => { setFilterTipoBaixa(new Set()); setPage(0); }}
                  />
                </div>
              )}

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-slate-700">
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div>
            <Table containerClassName="overflow-visible">
              <TableHeader className="bg-slate-800 text-slate-100 sticky -top-4 md:-top-6 z-20 shadow-md [&_th]:text-slate-200">
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead className="min-w-[50px] text-xs">Parc.</TableHead>
                  <SortableHead field="dueDate" className="min-w-[100px]">Vencimento</SortableHead>
                  {isPagas && (
                    <SortableHead field="paymentDate" className="min-w-[100px]">Dt. Pagamento</SortableHead>
                  )}
                  {isOverdue && (
                    <SortableHead field="daysOverdue" className="min-w-[80px]">Dias Atraso</SortableHead>
                  )}
                  <SortableHead field="creditorName" className="min-w-[200px]">{counterpartLabel}</SortableHead>
                  <SortableHead field="companyName" className="min-w-[150px]">Empresa</SortableHead>
                  {!isIncome && (
                    <SortableHead field="costEstimationSheet" className="min-w-[180px]">Item Orcamento</SortableHead>
                  )}
                  {!isIncome && (
                    <SortableHead field="financialCategory" className="min-w-[180px]">Plano Financeiro</SortableHead>
                  )}
                  <SortableHead field="billId" className="min-w-[80px]">Titulo</SortableHead>
                  <SortableHead field="documentType" className="min-w-[80px]">Tipo Doc.</SortableHead>
                  {isIncome && <TableHead className="min-w-[80px] text-xs font-semibold">Índice</TableHead>}
                  <SortableHead field="originalAmount" className="text-right min-w-[120px]">Valor Original</SortableHead>
                  {isPagas ? (
                    <SortableHead field="paidAmount" className="text-right min-w-[120px]">{isIncome ? "Valor Recebido" : "Valor Pago"}</SortableHead>
                  ) : (
                    <>
                      {isOverdue && (
                        <>
                          <SortableHead field="balanceAmount" className="text-right min-w-[120px]">Saldo Atual</SortableHead>
                          <SortableHead field="daysOverdue" className="text-right min-w-[60px]">Dias</SortableHead>
                          <TableHead className="text-right min-w-[110px] text-xs font-semibold">Acréscimo</TableHead>
                          <TableHead className="text-right min-w-[100px] text-xs font-semibold">Desconto</TableHead>
                        </>
                      )}
                      <TableHead className="text-right min-w-[110px] text-xs font-semibold">Correção</TableHead>
                      <TableHead className="text-right min-w-[70px] text-xs font-semibold">%</TableHead>
                      {isOverdue ? (
                        <TableHead className="text-right min-w-[120px] text-xs font-semibold">Total</TableHead>
                      ) : (
                        <SortableHead field="balanceAmount" className="text-right min-w-[120px]">Saldo</SortableHead>
                      )}
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: (isPagas ? (isIncome ? 10 : 11) : isOverdue ? (isIncome ? 12 : 13) : (isIncome ? 11 : 12)) + (isIncome ? 1 : 0) + (isOverdue ? 4 : 0) }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : (() => {
                      const seenExpandedBills = new Set<number>();
                      return paginatedItems.map((item, idx) => {
                      const days = daysDiff(item.dueDate);
                      const billParcelas = parcelasByBill.get(item.billId) || [];
                      const totalParcelas = billParcelas.length;
                      const isExpanded = expandedBills.has(item.billId);
                      const isFirstOfBill = !seenExpandedBills.has(item.billId);
                      if (isExpanded) seenExpandedBills.add(item.billId);
                      const showExpandedPanel = isExpanded && isFirstOfBill;
                      const incomeExtra = isIncome ? 1 : 0; // +1 for Índice column
                      const overdueExtra = isOverdue ? 4 : 0; // +4 for Saldo Atual, Dias, Acréscimo, Desconto columns
                      const baseCount = (isPagas ? (isIncome ? 10 : 11) : isOverdue ? (isIncome ? 12 : 13) : (isIncome ? 11 : 12)) + incomeExtra + overdueExtra;
                      const colCount = baseCount;
                      return (
                        <React.Fragment key={`${item.billId}-${item.installmentId}-${idx}`}>
                          <TableRow
                            className={`cursor-pointer transition-colors ${isExpanded ? "bg-blue-100 border-l-4 border-blue-500 hover:bg-blue-100" : "hover:bg-slate-50 border-l-4 border-transparent"}`}
                            onClick={() => toggleBillExpand(item.billId)}
                          >
                            <TableCell className="w-[40px] px-2">
                              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180 text-blue-600" : "text-slate-400"}`} />
                            </TableCell>
                            <TableCell className="text-sm">
                              {totalParcelas > 1 ? (
                                <Badge variant="secondary" className="text-xs font-mono">{totalParcelas}x</Badge>
                              ) : (
                                <span className="text-slate-400 text-xs">1x</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{formatDate(item.dueDate)}</TableCell>
                            {isPagas && (
                              <TableCell className="font-mono text-sm text-emerald-600">{formatDate(latestPaymentDate(item, filterAno, filterMes) || item.dueDate)}</TableCell>
                            )}
                            {isOverdue && (
                              <TableCell>
                                <Badge variant="destructive" className="text-xs font-mono">{Math.abs(days)}d</Badge>
                              </TableCell>
                            )}
                            <TableCell className={`max-w-[250px] truncate ${isExpanded ? "font-bold text-blue-900" : "font-medium"}`} title={getCounterpartName(item)}>{getCounterpartName(item)}</TableCell>
                            <TableCell className="text-sm max-w-[180px] truncate" title={item.companyName}>{item.companyName}</TableCell>
                            {!isIncome && (
                              <TableCell className="text-sm max-w-[200px] truncate" title={getBuildingsCosts(item).map((bc) => bc.costEstimationSheetName).filter(Boolean).join(", ") || "-"}>
                                {getBuildingsCosts(item)[0]?.costEstimationSheetName || "-"}
                                {getBuildingsCosts(item).length > 1 && (
                                  <Badge variant="secondary" className="text-[10px] ml-1">+{getBuildingsCosts(item).length - 1}</Badge>
                                )}
                              </TableCell>
                            )}
                            {!isIncome && (
                              <TableCell className="text-sm max-w-[200px] truncate" title={item.paymentsCategories?.map(c => c.financialCategoryName).filter(Boolean).join(", ") || "-"}>
                                {item.paymentsCategories?.[0]?.financialCategoryName || "-"}
                                {(item.paymentsCategories?.length || 0) > 1 && (
                                  <Badge variant="secondary" className="text-[10px] ml-1">+{(item.paymentsCategories?.length || 0) - 1}</Badge>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="font-mono text-sm">{item.billId}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-xs font-mono">{item.documentIdentificationId?.trim() || "-"}</Badge>
                            </TableCell>
                            {isIncome && (
                              <TableCell className="text-xs">
                                <Badge variant="secondary" className="text-[10px]">
                                  {("indexerName" in item && (item as SiengeIncome).indexerName) || "—"}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell className="text-right font-mono text-sm">{formatCurrency(item.originalAmount)}</TableCell>
                            {isPagas ? (
                              <TableCell className="text-right font-mono text-sm font-medium text-emerald-600">
                                {formatCurrency(paidTotal(item, filterAno, filterMes))}
                              </TableCell>
                            ) : (
                              <>
                                {isOverdue && (() => {
                                  const daysOver = Math.abs(daysDiff(item.dueDate));
                                  const encargos = calcEncargos(item);
                                  return (
                                    <>
                                      <TableCell className="text-right font-mono text-sm font-medium text-slate-800">
                                        {formatCurrency(item.correctedBalanceAmount)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-slate-600">
                                        {daysOver}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-red-600">
                                        {formatCurrency(encargos)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-sm text-slate-500">
                                        {formatCurrency(item.discountAmount || 0)}
                                      </TableCell>
                                    </>
                                  );
                                })()}
                                <TableCell className="text-right font-mono text-sm text-amber-600">
                                  {formatCurrency(item.correctedBalanceAmount - item.balanceAmount)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs text-amber-600">
                                  {item.balanceAmount > 0
                                    ? `${(((item.correctedBalanceAmount - item.balanceAmount) / item.balanceAmount) * 100).toFixed(1)}%`
                                    : "-"}
                                </TableCell>
                                {isOverdue ? (
                                  <TableCell className="text-right font-mono text-sm font-medium text-red-600">
                                    {formatCurrency(item.correctedBalanceAmount + calcEncargos(item))}
                                  </TableCell>
                                ) : (
                                  <TableCell className="text-right font-mono text-sm font-medium text-slate-800">
                                    {formatCurrency(item.correctedBalanceAmount)}
                                  </TableCell>
                                )}
                              </>
                            )}
                          </TableRow>
                          {showExpandedPanel && (
                            <TableRow className="bg-blue-50/60 border-l-4 border-blue-500 border-b-2 border-b-blue-200">
                              <TableCell colSpan={colCount} className="p-0">
                                <div className="px-8 py-4 border-l-4 border-blue-500 ml-0 bg-blue-50/80">
                                  {loadingNotes.has(item.billId) ? (
                                    <div className="mb-3 text-sm flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                      <span className="text-slate-400">Carregando observacoes...</span>
                                    </div>
                                  ) : billNotes[item.billId] ? (
                                    <div className="mb-3 text-sm">
                                      <span className="font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Observacoes:</span>
                                      <span className="ml-2 text-slate-600">{billNotes[item.billId]}</span>
                                    </div>
                                  ) : null}
                                  {isPagas && (item.payments || []).length > 0 && (
                                    <>
                                      <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                                        Pagamentos do Titulo {item.billId} — {getCounterpartName(item)}
                                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">{(item.payments || []).filter(p => p.netAmount > 0).length} pagamentos</Badge>
                                        <span className="text-slate-400">|</span>
                                        <span className="font-mono">Total: {formatCurrency(paidTotal(item))}</span>
                                      </div>
                                      <Table>
                                        <TableHeader className="bg-emerald-100/50">
                                          <TableRow className="border-b border-emerald-200/50">
                                            <TableHead className="text-xs h-8 py-1">Dt. Pagamento</TableHead>
                                            <TableHead className="text-xs h-8 py-1">Tipo Operacao</TableHead>
                                            <TableHead className="text-xs text-right h-8 py-1">Valor Liquido</TableHead>
                                            <TableHead className="text-xs text-right h-8 py-1">Juros</TableHead>
                                            <TableHead className="text-xs text-right h-8 py-1">Multa</TableHead>
                                            <TableHead className="text-xs text-right h-8 py-1">Desconto</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {(item.payments || []).filter(p => p.netAmount > 0).map((p, pi) => (
                                            <TableRow key={`pay-${item.billId}-${pi}`} className="border-b border-emerald-100/50">
                                              <TableCell className="font-mono text-xs py-1.5">{formatDate(p.paymentDate)}</TableCell>
                                              <TableCell className="text-xs py-1.5">{p.operationTypeName || "-"}</TableCell>
                                              <TableCell className="text-right font-mono text-xs py-1.5 font-medium text-emerald-600">{formatCurrency(p.netAmount)}</TableCell>
                                              <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(p.interestAmount || 0)}</TableCell>
                                              <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(p.fineAmount || 0)}</TableCell>
                                              <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(p.discountAmount || 0)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </>
                                  )}
                                  {!isPagas && totalParcelas > 1 && (() => {
                                    const sortedParcelas = [...billParcelas].sort((a, b) => {
                                      let cmp = 0;
                                      switch (subSort.field) {
                                        case "installmentId": cmp = a.installmentId - b.installmentId; break;
                                        case "dueDate": cmp = (a.dueDate || "").localeCompare(b.dueDate || ""); break;
                                        case "daysOverdue": cmp = daysDiff(a.dueDate) - daysDiff(b.dueDate); break;
                                        case "issueDate": cmp = (a.issueDate || "").localeCompare(b.issueDate || ""); break;
                                        case "originalAmount": cmp = a.originalAmount - b.originalAmount; break;
                                        case "correction": cmp = (a.correctedBalanceAmount - a.balanceAmount) - (b.correctedBalanceAmount - b.balanceAmount); break;
                                        case "correctionPct": {
                                          const pctA = a.balanceAmount > 0 ? (a.correctedBalanceAmount - a.balanceAmount) / a.balanceAmount : 0;
                                          const pctB = b.balanceAmount > 0 ? (b.correctedBalanceAmount - b.balanceAmount) / b.balanceAmount : 0;
                                          cmp = pctA - pctB; break;
                                        }
                                        case "balanceAmount": cmp = a.correctedBalanceAmount - b.correctedBalanceAmount; break;
                                        default: cmp = 0;
                                      }
                                      return subSort.dir === "asc" ? cmp : -cmp;
                                    });
                                    const SubSortHead = ({ field, children, className = "" }: { field: string; children: React.ReactNode; className?: string }) => (
                                      <TableHead
                                        className={`text-xs h-8 py-1 cursor-pointer select-none hover:bg-blue-200/50 ${className}`}
                                        onClick={() => setSubSort(prev => prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" })}
                                      >
                                        <span className="flex items-center gap-1 whitespace-nowrap">
                                          {children}
                                          {subSort.field === field ? (
                                            subSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                          ) : (
                                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                                          )}
                                        </span>
                                      </TableHead>
                                    );
                                    return (
                                    <>
                                      <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                                        Parcelas do Titulo {item.billId} — {getCounterpartName(item)}
                                        <Badge variant="secondary" className="text-xs">{totalParcelas} parcelas</Badge>
                                        <span className="text-slate-400">|</span>
                                        <span className="font-mono">Total: {formatCurrency(billParcelas.reduce((s, p) => s + (p.correctedBalanceAmount || 0), 0))}</span>
                                      </div>
                                      <Table>
                                        <TableHeader className="bg-blue-100/50">
                                          <TableRow className="border-b border-blue-200/50">
                                            <SubSortHead field="installmentId">Parcela</SubSortHead>
                                            <SubSortHead field="dueDate">Vencimento</SubSortHead>
                                            {isOverdue && <SubSortHead field="daysOverdue">Dias Atraso</SubSortHead>}
                                            <SubSortHead field="issueDate">Emissao</SubSortHead>
                                            <SubSortHead field="originalAmount" className="text-right">Valor Original</SubSortHead>
                                            <SubSortHead field="correction" className="text-right">Correção</SubSortHead>
                                            <SubSortHead field="correctionPct" className="text-right">%</SubSortHead>
                                            <SubSortHead field="balanceAmount" className="text-right">Saldo</SubSortHead>
                                            <TableHead className="text-xs h-8 py-1">Status</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {sortedParcelas.map((parcela) => {
                                            const pDays = daysDiff(parcela.dueDate);
                                            const isPaidItem = parcela.balanceAmount === 0;
                                            const correcao = parcela.correctedBalanceAmount - parcela.balanceAmount;
                                            const correcaoPct = parcela.balanceAmount > 0 ? (correcao / parcela.balanceAmount) * 100 : 0;
                                            return (
                                              <TableRow key={`sub-${parcela.billId}-${parcela.installmentId}`} className="border-b border-blue-100/50">
                                                <TableCell className="font-mono text-xs py-1.5">{parcela.installmentId}</TableCell>
                                                <TableCell className="font-mono text-xs py-1.5">{formatDate(parcela.dueDate)}</TableCell>
                                                {isOverdue && (
                                                  <TableCell className="text-xs py-1.5">
                                                    <Badge variant="destructive" className="text-[10px] font-mono">{Math.abs(pDays)}d</Badge>
                                                  </TableCell>
                                                )}
                                                <TableCell className="font-mono text-xs py-1.5">{formatDate(parcela.issueDate)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(parcela.originalAmount)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs py-1.5 text-amber-600">
                                                  {formatCurrency(correcao)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs py-1.5 text-amber-600">
                                                  {isPaidItem ? "-" : `${correcaoPct.toFixed(1)}%`}
                                                </TableCell>
                                                <TableCell className={`text-right font-mono text-xs py-1.5 font-medium ${isPaidItem ? "text-green-600" : isOverdue ? "text-red-600" : "text-slate-800"}`}>
                                                  {formatCurrency(parcela.correctedBalanceAmount)}
                                                </TableCell>
                                                <TableCell className="text-xs py-1.5">
                                                  {isPaidItem ? (
                                                    <Badge className="bg-green-100 text-green-700 text-[10px]">Pago</Badge>
                                                  ) : parcela.payments && parcela.payments.length > 0 ? (
                                                    <Badge className="bg-amber-100 text-amber-700 text-[10px]">Parcial</Badge>
                                                  ) : (
                                                    <Badge variant="outline" className="text-[10px]">Aberto</Badge>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </>
                                    );
                                  })()}
                                  {!loadingNotes.has(item.billId) && !billNotes[item.billId] && (
                                    <div className="text-xs text-slate-400">Nenhuma observacao registrada para este titulo.</div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    });
                    })()}
                {!loading && error && (
                  <TableRow>
                    <TableCell colSpan={isPagas ? (isIncome ? 10 : 11) : isOverdue ? (isIncome ? 12 : 13) : (isIncome ? 11 : 12)} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-red-50 rounded-full">
                          <AlertCircle className="h-8 w-8 text-red-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">Erro ao carregar dados</p>
                          <p className="text-sm text-slate-400 mt-1">Nao foi possivel conectar ao Sienge.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => fetchData()} className="mt-2">
                          Tentar novamente
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !error && paginatedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isPagas ? (isIncome ? 10 : 11) : isOverdue ? (isIncome ? 12 : 13) : (isIncome ? 11 : 12)} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-slate-100 rounded-full">
                          <FileText className="h-8 w-8 text-slate-300" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-500">Nenhuma parcela encontrada</p>
                          <p className="text-sm text-slate-400 mt-1">Ajuste os filtros ou o periodo de busca.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (() => {
            const start = page * perPage + 1;
            const end = Math.min((page + 1) * perPage, sorted.length);
            // Build page numbers: show first, last, current ±2, with ellipsis
            const pages: (number | "...")[] = [];
            for (let i = 0; i < totalPages; i++) {
              if (i === 0 || i === totalPages - 1 || (i >= page - 2 && i <= page + 2)) {
                pages.push(i);
              } else if (pages[pages.length - 1] !== "...") {
                pages.push("...");
              }
            }
            return (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <p className="text-sm text-slate-500">
                  Mostrando {start} - {end} de {sorted.length.toLocaleString("pt-BR")} registros
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)} className="text-xs">
                    Primeira
                  </Button>
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} className="text-xs">
                    Anterior
                  </Button>
                  {pages.map((p, i) =>
                    p === "..." ? (
                      <span key={`e${i}`} className="px-1 text-slate-400 text-sm">...</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(p)}
                        className={`text-xs min-w-[32px] ${p === page ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                      >
                        {p + 1}
                      </Button>
                    )
                  )}
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)} className="text-xs">
                    Proxima
                  </Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(totalPages - 1)} className="text-xs">
                    Ultima
                  </Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
