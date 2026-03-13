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
  ChevronLeft,
  ChevronRight,
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
import { SiengeOutcome } from "@/types/sienge";
import { toast } from "sonner";

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

function latestPaymentDate(item: SiengeOutcome): string {
  const dates = (item.payments || []).filter(p => p.paymentDate && p.netAmount > 0).map(p => p.paymentDate);
  if (dates.length === 0) return "";
  return dates.sort().reverse()[0];
}

function paidTotal(item: SiengeOutcome, yearFilter?: string): number {
  return (item.payments || [])
    .filter(p => p.netAmount > 0 && (!yearFilter || (p.paymentDate && p.paymentDate.startsWith(yearFilter))))
    .reduce((s, p) => s + p.netAmount, 0);
}

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
}

export function ContasTable({ mode, title, subtitle }: ContasTableProps) {
  const isOverdue = mode === "vencidas";
  const isPagas = mode === "pagas";

  const currentYear = new Date().getFullYear();

  const [items, setItems] = useState<SiengeOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEmpresas, setFilterEmpresas] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${mode}_default_empresas`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterCentrosCusto, setFilterCentrosCusto] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${mode}_default_centrosCusto`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterCredores, setFilterCredores] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${mode}_default_credores`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterTipoDoc, setFilterTipoDoc] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`contas_${mode}_default_tipoDoc`);
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>();
  });
  const [filterAno, setFilterAno] = useState(String(currentYear));
  const [filterMes, setFilterMes] = useState("all");
  const [filterDia, setFilterDia] = useState<string[]>([]);

  // API date range: always the full selected year.
  // For "pagas" mode, fetch 2 years back to capture items with old due dates paid in selected year.
  const { startDate, endDate } = useMemo(() => {
    const yr = filterAno === "all" ? currentYear : parseInt(filterAno, 10);
    const start = isPagas ? yr - 2 : yr;
    return { startDate: `${start}-01-01`, endDate: `${yr}-12-31` };
  }, [filterAno, currentYear, isPagas]);
  const [sortField, setSortField] = useState<SortField>(isPagas ? "paymentDate" : "dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [expandedBills, setExpandedBills] = useState<Set<number>>(new Set());
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
        `/api/sienge/outcome?startDate=${startDate}&endDate=${endDate}` +
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
  }, [startDate, endDate]);

  // Only fetch on mount. Subsequent fetches are triggered explicitly by the
  // "Buscar" and "Atualizar" buttons so that changing the date inputs does
  // not fire an immediate (and possibly Sienge-hitting) request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

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
      if (item.creditorName) set.add(item.creditorName);
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

  const toggleDia = (dia: string) => {
    setFilterDia((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
    );
    setPage(0);
  };

  // Static year/month lists; day count depends on selected month
  const anosDisponiveis = useMemo(
    () => isPagas
      ? Array.from({ length: 9 }, (_, i) => String(currentYear - 8 + i))
      : Array.from({ length: 5 }, (_, i) => String(currentYear - 2 + i)),
    [currentYear, isPagas]
  );

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
      if (isPagas) {
        // For "pagas" mode: must have payments in the selected year
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
          item.creditorName?.toLowerCase().includes(s) ||
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

      if (filterCredores.size > 0 && !filterCredores.has(item.creditorName))
        return false;

      if (filterTipoDoc.size > 0) {
        const tipo = item.documentIdentificationId?.trim() || "";
        if (!filterTipoDoc.has(tipo)) return false;
      }

      if (filterDia.length > 0) {
        if (isPagas) {
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
  }, [items, search, filterEmpresas, filterCentrosCusto, filterCredores, filterTipoDoc, filterAno, filterMes, filterDia, isOverdue, isPagas, today]);

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
        case "creditorName": cmp = (a.creditorName || "").localeCompare(b.creditorName || ""); break;
        case "companyName": cmp = (a.companyName || "").localeCompare(b.companyName || ""); break;
        case "projectName": cmp = (a.projectName || "").localeCompare(b.projectName || ""); break;
        case "documentNumber": cmp = (a.documentNumber || "").localeCompare(b.documentNumber || ""); break;
        case "documentType": cmp = (a.documentIdentificationId || "").localeCompare(b.documentIdentificationId || ""); break;
        case "costEstimationSheet": cmp = (a.buildingsCosts?.[0]?.costEstimationSheetName || "").localeCompare(b.buildingsCosts?.[0]?.costEstimationSheetName || ""); break;
        case "originalAmount": cmp = a.originalAmount - b.originalAmount; break;
        case "balanceAmount": cmp = a.balanceAmount - b.balanceAmount; break;
        case "paymentDate": cmp = (latestPaymentDate(a) || "").localeCompare(latestPaymentDate(b) || ""); break;
        case "paidAmount": cmp = paidTotal(a) - paidTotal(b); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  // Group parcelas by billId
  const parcelasByBill = useMemo(() => {
    const map = new Map<number, SiengeOutcome[]>();
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

  const totalAmount = useMemo(
    () => sorted.reduce((sum, item) => sum + (item.originalAmount || 0), 0),
    [sorted]
  );
  const totalBalance = useMemo(
    () => sorted.reduce((sum, item) => sum + (item.balanceAmount || 0), 0),
    [sorted]
  );
  const totalPaid = useMemo(
    () => sorted.reduce((sum, item) => sum + paidTotal(item, filterAno === "all" ? undefined : filterAno), 0),
    [sorted, filterAno]
  );

  // Card: Contas a pagar/vencidas hoje
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todayStats = useMemo(() => {
    if (isPagas) {
      // Paid today
      let valor = 0;
      const billIds = new Set<number>();
      const credorIds = new Set<number>();
      sorted.forEach(item => {
        (item.payments || []).filter(p => p.paymentDate === todayStr && p.netAmount > 0).forEach(p => {
          valor += p.netAmount;
          billIds.add(item.billId);
          credorIds.add(item.creditorId);
        });
      });
      return { valor, titulos: billIds.size, credores: credorIds.size, parcelas: billIds.size };
    }
    const todayItems = sorted.filter((item) => item.dueDate === todayStr);
    const valor = todayItems.reduce((s, i) => s + (i.balanceAmount || 0), 0);
    const titulos = new Set(todayItems.map((i) => i.billId)).size;
    const credores = new Set(todayItems.map((i) => i.creditorId)).size;
    return { valor, titulos, credores, parcelas: todayItems.length };
  }, [sorted, todayStr, isPagas]);

  // Card: Contas semana (proximos 7 dias ou ultimos 7 dias)
  const weekStats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (isPagas) {
      // Paid last 7 days
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().split("T")[0];
      let valor = 0;
      const billIds = new Set<number>();
      const credorIds = new Set<number>();
      sorted.forEach(item => {
        (item.payments || []).filter(p =>
          p.netAmount > 0 && p.paymentDate && p.paymentDate >= d7Str && p.paymentDate <= todayStr
        ).forEach(p => {
          valor += p.netAmount;
          billIds.add(item.billId);
          credorIds.add(item.creditorId);
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
    const valor = weekItems.reduce((s, i) => s + (i.balanceAmount || 0), 0);
    const titulos = new Set(weekItems.map((i) => i.billId)).size;
    const credores = new Set(weekItems.map((i) => i.creditorId)).size;
    return { valor, titulos, credores, parcelas: weekItems.length };
  }, [sorted, isOverdue, isPagas, todayStr]);

  const hasActiveFilters =
    filterEmpresas.size > 0 ||
    filterCentrosCusto.size > 0 ||
    filterCredores.size > 0 ||
    filterTipoDoc.size > 0 ||
    filterDia.length > 0 ||
    search !== "";

  const clearFilters = () => {
    setFilterEmpresas(new Set());
    setFilterCentrosCusto(new Set());
    setFilterCredores(new Set());
    setFilterTipoDoc(new Set());
    setFilterDia([]);
    setSearch("");
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-blue-600" />
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
        className="flex items-center gap-0.5 hover:text-blue-600 transition-colors w-full"
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
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card className={`border-0 shadow-sm border-l-4 ${isPagas ? "border-l-emerald-500" : isOverdue ? "border-l-red-500" : "border-l-amber-500"}`}>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">{isPagas ? "Pago Hoje" : isOverdue ? "Vencidas Hoje" : "A Pagar Hoje"}</div>
            <div className={`text-xl font-bold mt-1 ${isPagas ? "text-emerald-600" : isOverdue ? "text-red-600" : "text-amber-600"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(todayStats.valor)}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5 space-x-2">
                <span>{todayStats.titulos} {todayStats.titulos === 1 ? "titulo" : "titulos"}</span>
                <span>•</span>
                <span>{todayStats.credores} {todayStats.credores === 1 ? "credor" : "credores"}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm border-l-4 ${isPagas ? "border-l-teal-400" : isOverdue ? "border-l-orange-400" : "border-l-blue-400"}`}>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">{isPagas ? "Pago ultimos 7 dias" : isOverdue ? "Vencidas ultimos 7 dias" : "A Pagar em 7 dias"}</div>
            <div className={`text-xl font-bold mt-1 ${isPagas ? "text-teal-600" : isOverdue ? "text-orange-600" : "text-blue-600"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(weekStats.valor)}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5 space-x-2">
                <span>{weekStats.titulos} {weekStats.titulos === 1 ? "titulo" : "titulos"}</span>
                <span>•</span>
                <span>{weekStats.credores} {weekStats.credores === 1 ? "credor" : "credores"}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Total Parcelas</div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {loading ? <Skeleton className="h-7 w-16" /> : sorted.length}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => i.billId)).size} titulos
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">{isPagas ? "Total Pago" : "Valor Original"}</div>
            <div className={`text-xl font-bold mt-1 ${isPagas ? "text-emerald-600" : "text-blue-600"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(isPagas ? totalPaid : totalAmount)}
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${isOverdue ? "border-l-4 border-l-red-500" : ""}`}>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">{isPagas ? "Credores" : "Saldo Pendente"}</div>
            <div className={`text-xl font-bold mt-1 ${isOverdue ? "text-red-600" : "text-slate-800"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : isPagas
                ? `${new Set(sorted.map((i) => i.creditorId)).size}`
                : formatCurrency(totalBalance)}
            </div>
            {!loading && !isPagas && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => i.creditorId)).size} credores
              </div>
            )}
            {!loading && isPagas && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => i.companyName)).size} empresas
              </div>
            )}
          </CardContent>
        </Card>
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
                  onSaveDefault={() => { localStorage.setItem(`contas_${mode}_default_empresas`, JSON.stringify([...filterEmpresas])); toast.success("Padrao de empresas salvo!"); }}
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
                  onSaveDefault={() => { localStorage.setItem(`contas_${mode}_default_centrosCusto`, JSON.stringify([...filterCentrosCusto])); toast.success("Padrao de centros de custo salvo!"); }}
                />
              </div>

              <div className="min-w-[220px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Credor</label>
                <MultiSelectFilter
                  label="Credor"
                  icon={<Users className="h-4 w-4 text-slate-400" />}
                  allOptions={credorNames}
                  selected={filterCredores}
                  onToggle={(name) => { setFilterCredores(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); setPage(0); }}
                  onSelectAll={() => { setFilterCredores(new Set(credorNames)); setPage(0); }}
                  onClear={() => { setFilterCredores(new Set()); setPage(0); }}
                  onSaveDefault={() => { localStorage.setItem(`contas_${mode}_default_credores`, JSON.stringify([...filterCredores])); toast.success("Padrao de credores salvo!"); }}
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
                  onSaveDefault={() => { localStorage.setItem(`contas_${mode}_default_tipoDoc`, JSON.stringify([...filterTipoDoc])); toast.success("Padrao de tipo documento salvo!"); }}
                />
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-slate-700">
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
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
                  <SortableHead field="creditorName" className="min-w-[200px]">Credor</SortableHead>
                  <SortableHead field="companyName" className="min-w-[150px]">Empresa</SortableHead>
                  <SortableHead field="costEstimationSheet" className="min-w-[180px]">Item Orcamento</SortableHead>
                  <SortableHead field="billId" className="min-w-[80px]">Titulo</SortableHead>
                  <SortableHead field="documentType" className="min-w-[80px]">Tipo Doc.</SortableHead>
                  <SortableHead field="originalAmount" className="text-right min-w-[120px]">Valor Original</SortableHead>
                  {isPagas ? (
                    <SortableHead field="paidAmount" className="text-right min-w-[120px]">Valor Pago</SortableHead>
                  ) : (
                    <SortableHead field="balanceAmount" className="text-right min-w-[120px]">Saldo</SortableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: isPagas ? 11 : isOverdue ? 11 : 10 }).map((_, j) => (
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
                      const colCount = isPagas ? 11 : isOverdue ? 11 : 10;
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
                              <TableCell className="font-mono text-sm text-emerald-600">{formatDate(latestPaymentDate(item))}</TableCell>
                            )}
                            {isOverdue && (
                              <TableCell>
                                <Badge variant="destructive" className="text-xs font-mono">{Math.abs(days)}d</Badge>
                              </TableCell>
                            )}
                            <TableCell className={`max-w-[250px] truncate ${isExpanded ? "font-bold text-blue-900" : "font-medium"}`} title={item.creditorName}>{item.creditorName}</TableCell>
                            <TableCell className="text-sm max-w-[180px] truncate" title={item.companyName}>{item.companyName}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate" title={item.buildingsCosts?.map((bc) => bc.costEstimationSheetName).filter(Boolean).join(", ") || "-"}>
                              {item.buildingsCosts?.[0]?.costEstimationSheetName || "-"}
                              {item.buildingsCosts && item.buildingsCosts.length > 1 && (
                                <Badge variant="secondary" className="text-[10px] ml-1">+{item.buildingsCosts.length - 1}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.billId}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-xs font-mono">{item.documentIdentificationId?.trim() || "-"}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatCurrency(item.originalAmount)}</TableCell>
                            {isPagas ? (
                              <TableCell className="text-right font-mono text-sm font-medium text-emerald-600">
                                {formatCurrency(paidTotal(item, filterAno === "all" ? undefined : filterAno))}
                              </TableCell>
                            ) : (
                              <TableCell className={`text-right font-mono text-sm font-medium ${isOverdue ? "text-red-600" : "text-slate-800"}`}>
                                {formatCurrency(item.balanceAmount)}
                              </TableCell>
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
                                        Pagamentos do Titulo {item.billId} — {item.creditorName}
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
                                  {!isPagas && totalParcelas > 1 && (
                                    <>
                                      <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                                        Parcelas do Titulo {item.billId} — {item.creditorName}
                                        <Badge variant="secondary" className="text-xs">{totalParcelas} parcelas</Badge>
                                        <span className="text-slate-400">|</span>
                                        <span className="font-mono">Total: {formatCurrency(billParcelas.reduce((s, p) => s + (p.balanceAmount || 0), 0))}</span>
                                      </div>
                                      <Table>
                                        <TableHeader className="bg-blue-100/50">
                                          <TableRow className="border-b border-blue-200/50">
                                            <TableHead className="text-xs h-8 py-1">Parcela</TableHead>
                                            <TableHead className="text-xs h-8 py-1">Vencimento</TableHead>
                                            {isOverdue && <TableHead className="text-xs h-8 py-1">Dias Atraso</TableHead>}
                                            <TableHead className="text-xs h-8 py-1">Emissao</TableHead>
                                            <TableHead className="text-xs text-right h-8 py-1">Valor Original</TableHead>
                                            <TableHead className="text-xs text-right h-8 py-1">Saldo</TableHead>
                                            <TableHead className="text-xs h-8 py-1">Status</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {billParcelas.map((parcela) => {
                                            const pDays = daysDiff(parcela.dueDate);
                                            const isPaidItem = parcela.balanceAmount === 0;
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
                                                <TableCell className={`text-right font-mono text-xs py-1.5 font-medium ${isPaidItem ? "text-green-600" : isOverdue ? "text-red-600" : "text-slate-800"}`}>
                                                  {formatCurrency(parcela.balanceAmount)}
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
                                  )}
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
                    <TableCell colSpan={isPagas ? 11 : isOverdue ? 11 : 10} className="text-center py-12">
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
                    <TableCell colSpan={isPagas ? 11 : isOverdue ? 11 : 10} className="text-center py-12">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-slate-500">
                Pagina {page + 1} de {totalPages} ({sorted.length} parcelas)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                  Proximo <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
