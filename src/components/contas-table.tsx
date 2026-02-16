"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { SiengeOutcome } from "@/types/sienge";

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
  | "balanceAmount";

type SortDir = "asc" | "desc";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function daysDiff(dateStr: string) {
  const due = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const monthNames = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface ContasTableProps {
  mode: "a-vencer" | "vencidas";
  title: string;
  subtitle: string;
}

export function ContasTable({ mode, title, subtitle }: ContasTableProps) {
  const isOverdue = mode === "vencidas";

  const currentYear = new Date().getFullYear();

  const [items, setItems] = useState<SiengeOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterCentroCusto, setFilterCentroCusto] = useState("all");
  const [filterCredor, setFilterCredor] = useState("all");
  const [filterTipoDoc, setFilterTipoDoc] = useState<string[]>([]);
  const [filterAno, setFilterAno] = useState("all");
  const [filterMes, setFilterMes] = useState("all");
  const [chartYear, setChartYear] = useState(String(currentYear));
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>(isOverdue ? "asc" : "asc");
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sienge/outcome?startDate=${startDate}&endDate=${endDate}`
      );
      const data = await res.json();
      setItems(data.data || []);
      setPage(0);
      setBillNotes({});
      fetchedNotesRef.current = new Set();
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Extract unique values for filters
  const empresas = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((item) => {
      if (item.companyId && item.companyName)
        map.set(item.companyId, item.companyName);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const centrosCusto = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((item) => {
      if (filterEmpresa !== "all" && String(item.companyId) !== filterEmpresa) return;
      item.paymentsCategories?.forEach((cat) => {
        if (cat.costCenterId && cat.costCenterName)
          map.set(cat.costCenterId, cat.costCenterName);
      });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, filterEmpresa]);

  const credores = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((item) => {
      if (item.creditorId && item.creditorName)
        map.set(item.creditorId, item.creditorName);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const tiposDocumento = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const tipo = item.documentIdentificationId?.trim();
      if (tipo) set.add(tipo);
    });
    return Array.from(set).sort();
  }, [items]);

  const toggleTipoDoc = (tipo: string) => {
    setFilterTipoDoc((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]
    );
    setPage(0);
  };

  // Available years/months from mode-filtered items
  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (!item.dueDate || item.balanceAmount === 0) return;
      const dueDate = new Date(item.dueDate + "T00:00:00");
      if (isOverdue && dueDate >= today) return;
      if (!isOverdue && dueDate < today) return;
      set.add(item.dueDate.substring(0, 4));
    });
    return Array.from(set).sort();
  }, [items, isOverdue, today]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (!item.dueDate || item.balanceAmount === 0) return;
      const dueDate = new Date(item.dueDate + "T00:00:00");
      if (isOverdue && dueDate >= today) return;
      if (!isOverdue && dueDate < today) return;
      if (filterAno !== "all" && item.dueDate.substring(0, 4) !== filterAno) return;
      set.add(item.dueDate.substring(5, 7));
    });
    return Array.from(set).sort();
  }, [items, isOverdue, today, filterAno]);

  // Filter
  const filtered = useMemo(() => {
    return items.filter((item) => {
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

      if (search) {
        const s = search.toLowerCase();
        const match =
          item.creditorName?.toLowerCase().includes(s) ||
          item.companyName?.toLowerCase().includes(s) ||
          item.projectName?.toLowerCase().includes(s) ||
          item.documentNumber?.includes(search);
        if (!match) return false;
      }

      if (filterEmpresa !== "all" && String(item.companyId) !== filterEmpresa)
        return false;

      if (filterCentroCusto !== "all") {
        const has = item.paymentsCategories?.some(
          (cat) => String(cat.costCenterId) === filterCentroCusto
        );
        if (!has) return false;
      }

      if (filterCredor !== "all" && String(item.creditorId) !== filterCredor)
        return false;

      if (filterTipoDoc.length > 0) {
        const tipo = item.documentIdentificationId?.trim() || "";
        if (!filterTipoDoc.includes(tipo)) return false;
      }

      return true;
    });
  }, [items, search, filterEmpresa, filterCentroCusto, filterCredor, filterTipoDoc, filterAno, filterMes, isOverdue, today]);

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
        case "dueDate": cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); break;
        case "daysOverdue": cmp = daysDiff(a.dueDate) - daysDiff(b.dueDate); break;
        case "creditorName": cmp = (a.creditorName || "").localeCompare(b.creditorName || ""); break;
        case "companyName": cmp = (a.companyName || "").localeCompare(b.companyName || ""); break;
        case "projectName": cmp = (a.projectName || "").localeCompare(b.projectName || ""); break;
        case "documentNumber": cmp = (a.documentNumber || "").localeCompare(b.documentNumber || ""); break;
        case "documentType": cmp = (a.documentIdentificationId || "").localeCompare(b.documentIdentificationId || ""); break;
        case "costEstimationSheet": cmp = (a.buildingsCosts?.[0]?.costEstimationSheetName || "").localeCompare(b.buildingsCosts?.[0]?.costEstimationSheetName || ""); break;
        case "originalAmount": cmp = a.originalAmount - b.originalAmount; break;
        case "balanceAmount": cmp = a.balanceAmount - b.balanceAmount; break;
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

  // Card: Contas a pagar/vencidas hoje
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todayStats = useMemo(() => {
    const todayItems = sorted.filter((item) => item.dueDate === todayStr);
    const valor = todayItems.reduce((s, i) => s + (i.balanceAmount || 0), 0);
    const titulos = new Set(todayItems.map((i) => i.billId)).size;
    const credores = new Set(todayItems.map((i) => i.creditorId)).size;
    return { valor, titulos, credores, parcelas: todayItems.length };
  }, [sorted, todayStr]);

  // Card: Contas semana (proximos 7 dias ou ultimos 7 dias)
  const weekStats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
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
  }, [sorted, isOverdue]);

  // Chart
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    filtered.forEach((item) => {
      if (item.dueDate) years.add(item.dueDate.substring(0, 4));
    });
    return Array.from(years).sort();
  }, [filtered]);

  const chartData = useMemo(() => {
    const valByMonth = new Array(12).fill(0);

    filtered.forEach((item) => {
      if (!item.dueDate || !item.dueDate.startsWith(chartYear)) return;
      const month = parseInt(item.dueDate.substring(5, 7), 10) - 1;
      valByMonth[month] += item.balanceAmount || 0;
    });

    const data = monthNames.map((name, i) => {
      const valor = Math.round(valByMonth[i] * 100) / 100;
      const prev = i > 0 ? Math.round(valByMonth[i - 1] * 100) / 100 : 0;
      const variacao = i === 0 || prev === 0 ? null : Math.round(((valor - prev) / prev) * 1000) / 10;
      return { mes: name, valor, variacao };
    });

    const nonZeroValues = data.filter((d) => d.valor > 0).map((d) => d.valor);
    const maxVal = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) : 0;
    const minVal = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;

    return data.map((d) => ({
      ...d,
      isMax: d.valor > 0 && d.valor === maxVal,
      isMin: d.valor > 0 && d.valor === minVal && maxVal !== minVal,
    }));
  }, [filtered, chartYear]);

  const hasActiveFilters =
    filterEmpresa !== "all" ||
    filterCentroCusto !== "all" ||
    filterCredor !== "all" ||
    filterTipoDoc.length > 0 ||
    filterAno !== "all" ||
    filterMes !== "all" ||
    search !== "";

  const clearFilters = () => {
    setFilterEmpresa("all");
    setFilterCentroCusto("all");
    setFilterCredor("all");
    setFilterTipoDoc([]);
    setFilterAno("all");
    setFilterMes("all");
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

  const barColor = isOverdue ? "#ef4444" : "#3b82f6";


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          <p className="text-slate-500 mt-1">{subtitle}</p>
        </div>
        <Badge variant="secondary" className="text-sm py-1">
          {sorted.length} parcelas
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card className={`border-0 shadow-sm border-l-4 ${isOverdue ? "border-l-red-500" : "border-l-amber-500"}`}>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">{isOverdue ? "Vencidas Hoje" : "A Pagar Hoje"}</div>
            <div className={`text-xl font-bold mt-1 ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
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
        <Card className={`border-0 shadow-sm border-l-4 ${isOverdue ? "border-l-orange-400" : "border-l-blue-400"}`}>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">{isOverdue ? "Vencidas ultimos 7 dias" : "A Pagar em 7 dias"}</div>
            <div className={`text-xl font-bold mt-1 ${isOverdue ? "text-orange-600" : "text-blue-600"}`}>
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
            <div className="text-sm text-slate-500">Valor Original</div>
            <div className="text-xl font-bold text-blue-600 mt-1">
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(totalAmount)}
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm ${isOverdue ? "border-l-4 border-l-red-500" : ""}`}>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Saldo Pendente</div>
            <div className={`text-xl font-bold mt-1 ${isOverdue ? "text-red-600" : "text-slate-800"}`}>
              {loading ? <Skeleton className="h-7 w-32" /> : formatCurrency(totalBalance)}
            </div>
            {!loading && (
              <div className="text-xs text-slate-400 mt-1.5">
                {new Set(sorted.map((i) => i.creditorId)).size} credores
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {!loading && sorted.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                {isOverdue ? "Vencidas por Mes" : "A Vencer por Mes"}
              </h2>
              <Select value={chartYear} onValueChange={setChartYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={chartData} barGap={2} margin={{ top: 60, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(v: number) =>
                    v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <RechartsTooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-3 text-sm">
                        <p className="font-semibold text-slate-700">{d.mes}</p>
                        <p className="text-slate-600 mt-1">{formatCurrency(d.valor)}</p>
                        {d.variacao !== null && (
                          <p className={`mt-1 font-medium ${d.variacao >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {d.variacao >= 0 ? "+" : ""}{d.variacao}% vs mes anterior
                          </p>
                        )}
                        {d.isMax && <p className="mt-1 text-amber-600 font-medium">Maior valor do ano</p>}
                        {d.isMin && <p className="mt-1 text-emerald-600 font-medium">Menor valor do ano</p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="valor" name="Saldo (R$)" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isMax
                          ? (isOverdue ? "#dc2626" : "#f59e0b")
                          : entry.isMin
                          ? "#10b981"
                          : barColor
                      }
                      stroke={entry.isMax || entry.isMin ? "#fff" : "none"}
                      strokeWidth={entry.isMax || entry.isMin ? 2 : 0}
                    />
                  ))}
                  <LabelList
                    dataKey="valor"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ x, y, width, value }: any) => {
                      if (!value || value === 0) return null;
                      const label =
                        value >= 1000000
                          ? `${(value / 1000000).toFixed(1)}M`
                          : value >= 1000
                          ? `${(value / 1000).toFixed(0)}k`
                          : String(value);
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 8}
                          textAnchor="middle"
                          fill="#475569"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {label}
                        </text>
                      );
                    }}
                  />
                  <LabelList
                    dataKey="variacao"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ x, y, width, value }: any) => {
                      if (value === null || value === undefined) return null;
                      const color = value >= 0 ? "#22c55e" : "#ef4444";
                      const text = `${value >= 0 ? "+" : ""}${value}%`;
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 24}
                          textAnchor="middle"
                          fill={color}
                          fontSize={10}
                          fontWeight={600}
                        >
                          {text}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: isOverdue ? "#dc2626" : "#f59e0b" }} />
                <span>Maior valor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span>Menor valor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: barColor }} />
                <span>Demais meses</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Data Inicio</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Data Fim</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
              <div className="min-w-[120px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Ano</label>
                <Select value={filterAno} onValueChange={(v) => { setFilterAno(v); setFilterMes("all"); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {anosDisponiveis.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[120px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Mes</label>
                <Select value={filterMes} onValueChange={(v) => { setFilterMes(v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {mesesDisponiveis.map((m) => <SelectItem key={m} value={m}>{monthNames[parseInt(m, 10) - 1]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={fetchData} disabled={loading} size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Filter className="h-4 w-4 mr-1" />}
                Buscar
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
                <Select value={filterEmpresa} onValueChange={(v) => { setFilterEmpresa(v); setFilterCentroCusto("all"); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Centro de Custo</label>
                <Select value={filterCentroCusto} onValueChange={(v) => { setFilterCentroCusto(v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {centrosCusto.map((cc) => <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Credor</label>
                <Select value={filterCredor} onValueChange={(v) => { setFilterCredor(v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {credores.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[180px]">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo Documento</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal h-10">
                      <span className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        {filterTipoDoc.length === 0 ? "Todos" : filterTipoDoc.length === 1 ? filterTipoDoc[0] : `${filterTipoDoc.length} selecionados`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="p-2 border-b flex gap-1">
                      <Button variant="ghost" size="sm" className="flex-1 justify-center text-xs h-8" onClick={() => { setFilterTipoDoc([...tiposDocumento]); setPage(0); }}>
                        Selecionar todos
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 justify-center text-xs h-8" onClick={() => { setFilterTipoDoc([]); setPage(0); }}>
                        Limpar
                      </Button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                      {tiposDocumento.map((tipo) => (
                        <label key={tipo} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-sm">
                          <Checkbox checked={filterTipoDoc.includes(tipo)} onCheckedChange={() => toggleTipoDoc(tipo)} />
                          <span className="font-mono">{tipo}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
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
                  <SortableHead field="billId" className="min-w-[80px]">Titulo</SortableHead>
                  <TableHead className="min-w-[50px] text-xs">Parc.</TableHead>
                  <SortableHead field="dueDate" className="min-w-[100px]">Vencimento</SortableHead>
                  {isOverdue && (
                    <SortableHead field="daysOverdue" className="min-w-[80px]">Dias Atraso</SortableHead>
                  )}
                  <SortableHead field="creditorName" className="min-w-[200px]">Credor</SortableHead>
                  <SortableHead field="companyName" className="min-w-[150px]">Empresa</SortableHead>
                  <SortableHead field="costEstimationSheet" className="min-w-[180px]">Item Orcamento</SortableHead>
                  <SortableHead field="documentNumber" className="min-w-[80px]">Doc.</SortableHead>
                  <SortableHead field="documentType" className="min-w-[80px]">Tipo Doc.</SortableHead>
                  <SortableHead field="originalAmount" className="text-right min-w-[120px]">Valor Original</SortableHead>
                  <SortableHead field="balanceAmount" className="text-right min-w-[120px]">Saldo</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: isOverdue ? 12 : 11 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : paginatedItems.map((item, idx) => {
                      const days = daysDiff(item.dueDate);
                      const billParcelas = parcelasByBill.get(item.billId) || [];
                      const totalParcelas = billParcelas.length;
                      const isExpanded = expandedBills.has(item.billId);
                      const colCount = isOverdue ? 12 : 11;
                      return (
                        <React.Fragment key={`${item.billId}-${item.installmentId}-${idx}`}>
                          <TableRow
                            className={`hover:bg-slate-50 cursor-pointer ${isExpanded ? "bg-blue-50/50" : ""}`}
                            onClick={() => toggleBillExpand(item.billId)}
                          >
                            <TableCell className="w-[40px] px-2">
                              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.billId}</TableCell>
                            <TableCell className="text-sm">
                              {totalParcelas > 1 ? (
                                <Badge variant="secondary" className="text-xs font-mono">{totalParcelas}x</Badge>
                              ) : (
                                <span className="text-slate-400 text-xs">1x</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{formatDate(item.dueDate)}</TableCell>
                            {isOverdue && (
                              <TableCell>
                                <Badge variant="destructive" className="text-xs font-mono">{Math.abs(days)}d</Badge>
                              </TableCell>
                            )}
                            <TableCell className="font-medium max-w-[250px] truncate" title={item.creditorName}>{item.creditorName}</TableCell>
                            <TableCell className="text-sm max-w-[180px] truncate" title={item.companyName}>{item.companyName}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate" title={item.buildingsCosts?.map((bc) => bc.costEstimationSheetName).filter(Boolean).join(", ") || "-"}>
                              {item.buildingsCosts?.[0]?.costEstimationSheetName || "-"}
                              {item.buildingsCosts && item.buildingsCosts.length > 1 && (
                                <Badge variant="secondary" className="text-[10px] ml-1">+{item.buildingsCosts.length - 1}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.documentNumber || "-"}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-xs font-mono">{item.documentIdentificationId?.trim() || "-"}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatCurrency(item.originalAmount)}</TableCell>
                            <TableCell className={`text-right font-mono text-sm font-medium ${isOverdue ? "text-red-600" : "text-slate-800"}`}>
                              {formatCurrency(item.balanceAmount)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="bg-blue-50/30">
                              <TableCell colSpan={colCount} className="p-0">
                                <div className="px-8 py-3 border-l-4 border-blue-400 ml-4">
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
                                  {totalParcelas > 1 && (
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
                                            const isPaid = parcela.balanceAmount === 0;
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
                                                <TableCell className={`text-right font-mono text-xs py-1.5 font-medium ${isPaid ? "text-green-600" : isOverdue ? "text-red-600" : "text-slate-800"}`}>
                                                  {formatCurrency(parcela.balanceAmount)}
                                                </TableCell>
                                                <TableCell className="text-xs py-1.5">
                                                  {isPaid ? (
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
                                  {!loadingNotes.has(item.billId) && !billNotes[item.billId] && totalParcelas <= 1 && (
                                    <div className="text-xs text-slate-400">Nenhuma observacao registrada para este titulo.</div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                {!loading && paginatedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isOverdue ? 12 : 11} className="text-center py-8 text-slate-500">
                      Nenhuma parcela encontrada
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
