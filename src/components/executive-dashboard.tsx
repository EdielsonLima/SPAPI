"use client";

import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// Select removed - year filter now uses MultiSelectFilter
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Loader2,
  FileText,
  Building2,
  CalendarClock,
  X,
  Search,
  Save,
  Users,
  Banknote,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ruler,
  FileDown,
  BarChart3,
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
import { SiengeOutcome, SiengeBankMovement, SiengeIncome } from "@/types/sienge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency, formatCompactCurrency, formatDate, MONTH_LABELS } from "@/lib/dashboard-utils";
import { generateContasPagarPDF } from "@/lib/pdf-contas-pagar";
import { DreTab } from "@/components/dre-tab";

type Section = "cp" | "cr";
type MainTab = "a-pagar" | "pagas" | "atrasadas" | "a-receber" | "recebidas" | "inadimplencia" | "orcamento" | "dre";
type ChartView = "mensal" | "anual";

// === Reusable Multi-Select Filter ===
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

  const filtered = useMemo(() => {
    if (!search) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(n => getLabel(n).toLowerCase().includes(q) || n.toLowerCase().includes(q));
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
        {/* Select All */}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
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
          <span className={`font-semibold tabular-nums ${pct >= 0 ? "text-red-500" : "text-emerald-500"}`}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

export function ExecutiveDashboard() {
  const currentYear = new Date().getFullYear();
  const [section, setSection] = useState<Section>("cp");
  const [selectedYears, setSelectedYears] = useState<Set<string>>(() => {
    const years: string[] = [];
    for (let y = currentYear - 10; y <= currentYear; y++) years.push(String(y));
    return new Set(years);
  });
  const [selectedDuePeriods, setSelectedDuePeriods] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<MainTab>("a-pagar");
  const [items, setItems] = useState<SiengeOutcome[]>([]);
  const [incomeItems, setIncomeItems] = useState<SiengeIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedCp, setLastUpdatedCp] = useState<string | null>(null);
  const [lastUpdatedCr, setLastUpdatedCr] = useState<string | null>(null);
  const [cubData, setCubData] = useState<{ currentValue: number; currentMonth: string; monthlyVariation: number; yearlyAccumulated: number } | null>(null);
  const [companySettings, setCompanySettings] = useState<{ companyId: number; companyName: string; areaM2: number; factor: number; status: string }[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [chartView, setChartView] = useState<ChartView>("mensal");
  const [showDelinquentTable, setShowDelinquentTable] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [delinquentSort, setDelinquentSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "totalOverdue", dir: "desc" });
  const [showOverdueTable, setShowOverdueTable] = useState(false);
  const [expandedCreditors, setExpandedCreditors] = useState<Set<string>>(new Set());
  const [overdueSort, setOverdueSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "totalOverdue", dir: "desc" });
  const [selectedDocNumbers, setSelectedDocNumbers] = useState<Set<string>>(new Set());
  const [selectedOpTypes, setSelectedOpTypes] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard_default_opTypes");
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set(["Pagamento"]);
  });
  const [bankFees, setBankFees] = useState<SiengeBankMovement[]>([]);
  const [allBankMovements, setAllBankMovements] = useState<SiengeBankMovement[]>([]);
  const [exclusionSet, setExclusionSet] = useState<Set<string>>(new Set());


  const availableYears = useMemo(() => {
    const arr: string[] = [];
    if (activeTab === "pagas" || activeTab === "atrasadas" || activeTab === "recebidas" || activeTab === "inadimplencia" || activeTab === "dre") {
      for (let y = currentYear - 10; y <= currentYear; y++) arr.push(String(y));
    } else {
      // Contas a Pagar / a Receber: mostra ano atual em diante
      for (let y = currentYear; y <= currentYear + 5; y++) arr.push(String(y));
    }
    return arr;
  }, [currentYear, activeTab]);

  const MONTH_OPTIONS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const MONTH_NAMES: Record<string, string> = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
    "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
    "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
  };

  // === Exclui itens inconsistentes para bater com relatório Sienge ===
  const consistentItems = useMemo(() =>
    items.filter(i =>
      i.consistencyStatus !== 'N' &&
      !(exclusionSet.size > 0 && exclusionSet.has(`${i.companyId}:${i.billId}`))
    ), [items, exclusionSet]);

  const consistentIncome = useMemo(() =>
    incomeItems.filter(i =>
      !(exclusionSet.size > 0 && exclusionSet.has(`${i.companyId}:${i.billId}`))
    ), [incomeItems, exclusionSet]);

  // Active data source based on section
  const activeItems = section === "cr" ? consistentIncome : consistentItems;

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    activeItems.forEach(i => {
      if (i.dueDate) months.add(i.dueDate.substring(5, 7));
    });
    return MONTH_OPTIONS.filter(m => months.has(m));
  }, [activeItems]);

  // Fixed date range for data fetching — never changes based on filters
  const dataLoadedRef = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const startDate = `${currentYear - 10}-01-01`;
    const endDate = `${currentYear + 5}-12-31`;
    const refreshParam = forceRefresh ? "&forceRefresh=true" : "";

    if (forceRefresh) setRefreshing(true);
    else if (!dataLoadedRef.current) setLoading(true);

    try {
      const [outcomeRes, bmRes, incomeRes] = await Promise.all([
        fetch(`/api/sienge/outcome?startDate=${startDate}&endDate=${endDate}${refreshParam}`),
        fetch(`/api/sienge/bank-movements?startDate=${startDate}&endDate=${endDate}${refreshParam}`),
        fetch(`/api/sienge/income?startDate=${startDate}&endDate=${endDate}${refreshParam}`),
      ]);

      if (!outcomeRes.ok) throw new Error("Outcome API error");
      const outcomeData = await outcomeRes.json();
      setItems(outcomeData.data || []);
      if (outcomeData.cachedAt) setLastUpdatedCp(outcomeData.cachedAt);

      if (bmRes.ok) {
        const bmData = await bmRes.json();
        const allBm: SiengeBankMovement[] = bmData.data || [];
        setAllBankMovements(allBm);
        const fees = allBm.filter(bm =>
          (bm.financialCategories || []).some(fc =>
            fc.financialCategoryName?.toLowerCase().includes("taxa") &&
            fc.financialCategoryName?.toLowerCase().includes("banc")
          )
        );
        setBankFees(fees);
      }

      if (!incomeRes.ok) throw new Error("Income API error");
      const incomeData = await incomeRes.json();
      setIncomeItems(incomeData.data || []);
      if (incomeData.cachedAt) setLastUpdatedCr(incomeData.cachedAt);

      dataLoadedRef.current = true;
    } catch {
      toast.error("Erro ao carregar dados do painel executivo");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  // Fetch CUB data and company settings on mount
  useEffect(() => {
    fetch("/api/cub")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.currentValue) setCubData(data); })
      .catch(() => {});
    fetch("/api/company-settings")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data) setCompanySettings(data.data); })
      .catch(() => {});
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Due period filter options
  const DUE_PERIOD_OPTIONS = ["hoje", "7dias", "15dias", "30dias"];
  const DUE_PERIOD_LABELS: Record<string, string> = {
    "hoje": "Vence Hoje",
    "7dias": "Vence em 7 dias",
    "15dias": "Vence em 15 dias",
    "30dias": "Vence em 30 dias",
  };

  const duePeriodMaxDate = useMemo(() => {
    if (selectedDuePeriods.size === 0) return null;
    const offsets: Record<string, number> = { "hoje": 0, "7dias": 7, "15dias": 15, "30dias": 30 };
    let maxOffset = 0;
    selectedDuePeriods.forEach(p => {
      if ((offsets[p] ?? 0) > maxOffset) maxOffset = offsets[p];
    });
    const d = new Date();
    d.setDate(d.getDate() + maxOffset);
    return d.toISOString().split("T")[0];
  }, [selectedDuePeriods]);

  // === Filter options ===
  const allCompanyNames = useMemo(() => {
    const names = new Set<string>();
    activeItems.forEach(i => names.add(i.companyName));
    return Array.from(names).sort();
  }, [activeItems]);

  // Empresas administrativas/holding excluídas por padrão (não são obras)
  const isExcludedCompany = (name: string) => {
    const upper = name.toUpperCase();
    return upper.includes("HOLDING") || upper.includes("ADMINISTRADORA") ||
      upper.includes("CONSTRUTORA") || upper.includes("EMPREENDIMENTOS") ||
      upper.includes("GALPÃO") || upper.includes("GALPAO");
  };

  const defaultCompanies = useCallback(() =>
    new Set(allCompanyNames.filter(n => !isExcludedCompany(n))),
    [allCompanyNames]
  );

  // Auto-initialize company filter from localStorage or excluding admin/holding companies
  const companiesInitialized = useRef(false);
  useEffect(() => {
    if (allCompanyNames.length > 0 && !companiesInitialized.current) {
      companiesInitialized.current = true;
      const saved = localStorage.getItem("dashboard_default_companies");
      if (saved) {
        const savedSet = new Set<string>(JSON.parse(saved));
        // Only use saved if the companies still exist in data
        const valid = new Set([...savedSet].filter(c => allCompanyNames.includes(c)));
        if (valid.size > 0) {
          setSelectedCompanies(valid);
          return;
        }
      }
      const defaults = defaultCompanies();
      if (defaults.size < allCompanyNames.length) {
        setSelectedCompanies(defaults);
      }
    }
  }, [allCompanyNames, defaultCompanies]);

  const isExcludedDocType = (t: string) => t.toUpperCase().startsWith("PREVISÃO") || t.toUpperCase().startsWith("PREVISAO");

  const allDocTypes = useMemo(() => {
    const types = new Set<string>();
    activeItems.forEach(i => {
      if (i.documentIdentificationName) types.add(i.documentIdentificationName);
    });
    return Array.from(types).sort();
  }, [activeItems]);

  // Auto-initialize docType filter from localStorage or excluding previsão types
  const docTypesInitialized = useRef(false);
  useEffect(() => {
    if (allDocTypes.length > 0 && !docTypesInitialized.current) {
      docTypesInitialized.current = true;
      const saved = localStorage.getItem("dashboard_default_docTypes");
      if (saved) {
        const savedSet = new Set<string>(JSON.parse(saved));
        const valid = new Set([...savedSet].filter(t => allDocTypes.includes(t)));
        if (valid.size > 0) {
          setSelectedDocTypes(valid);
          return;
        }
      }
      const defaults = allDocTypes.filter(t => !isExcludedDocType(t));
      setSelectedDocTypes(new Set(defaults));
    }
  }, [allDocTypes]);

  // === Toggle helpers ===
  const toggleInSet = useCallback((setter: React.Dispatch<React.SetStateAction<Set<string>>>, name: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Valor efetivo: saldo corrigido menos impostos retidos (para bater com relatório Sienge)
  const effectiveAmount = (i: SiengeOutcome | SiengeIncome) => i.correctedBalanceAmount - (i.taxAmount || 0);

  // Soma de pagamentos filtrada por tipo de operação e ano do pagamento
  const paidSum = useCallback((i: SiengeOutcome | SiengeIncome) =>
    (i.payments || [])
      .filter(p =>
        (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
        p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
      )
      .reduce((s, p) => s + p.netAmount, 0),
    [selectedOpTypes, selectedYears]);

  // Soma de recebimentos filtrada apenas por ano (opType do CP não se aplica ao CR)
  const receivedSum = useCallback((i: SiengeIncome) =>
    (i.payments || [])
      .filter(p =>
        p.netAmount > 0 &&
        p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
      )
      .reduce((s, p) => s + p.netAmount, 0),
    [selectedYears]);

  // Tipos de operação disponíveis nos dados
  const allOpTypes = useMemo(() => {
    const types = new Set<string>();
    activeItems.forEach(i =>
      (i.payments || []).forEach(p => { if (p.operationTypeName) types.add(p.operationTypeName); })
    );
    return Array.from(types).sort();
  }, [activeItems]);

  // Números de documento disponíveis nos dados de income (CR)
  const allDocNumbers = useMemo(() => {
    const nums = new Set<string>();
    consistentIncome.forEach(i => {
      if (i.documentNumber) nums.add(i.documentNumber);
    });
    return Array.from(nums).sort();
  }, [consistentIncome]);

  // === Apply filters to items (works for both Outcome and Income) ===
  const applyFilters = useCallback(<T extends { companyName: string; documentIdentificationName: string; dueDate: string }>(list: T[]): T[] => {
    let result = list;
    if (selectedCompanies.size > 0) {
      result = result.filter(i => selectedCompanies.has(i.companyName));
    }
    if (selectedDocTypes.size > 0) {
      result = result.filter(i => selectedDocTypes.has(i.documentIdentificationName));
    }
    if (selectedYears.size > 0) {
      result = result.filter(i => i.dueDate && selectedYears.has(i.dueDate.substring(0, 4)));
    }
    if (selectedMonths.size > 0) {
      result = result.filter(i => i.dueDate && selectedMonths.has(i.dueDate.substring(5, 7)));
    }
    if (selectedDays.size > 0) {
      result = result.filter(i => i.dueDate && selectedDays.has(i.dueDate.substring(8, 10)));
    }
    if (duePeriodMaxDate) {
      result = result.filter(i => i.dueDate && i.dueDate <= duePeriodMaxDate);
    }
    return result;
  }, [selectedCompanies, selectedDocTypes, selectedYears, selectedMonths, selectedDays, duePeriodMaxDate]);

  // === Filtered item sets ===
  const itemsAPagar = useMemo(() =>
    consistentItems.filter(i => i.correctedBalanceAmount > 0 && i.dueDate >= todayStr), [consistentItems, todayStr]);

  const itemsAtrasadas = useMemo(() =>
    consistentItems.filter(i => i.correctedBalanceAmount > 0 && i.dueDate < todayStr), [consistentItems, todayStr]);

  const itemsPagas = useMemo(() =>
    consistentItems.filter(i =>
      (i.payments || []).some(p =>
        p.netAmount > 0 &&
        (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
        p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
      )
    ), [consistentItems, selectedOpTypes, selectedYears]);

  // === CR Filtered item sets ===
  const itemsAReceber = useMemo(() =>
    consistentIncome.filter(i => i.correctedBalanceAmount > 0 && i.dueDate >= todayStr), [consistentIncome, todayStr]);

  const itemsInadimplencia = useMemo(() =>
    consistentIncome.filter(i => i.correctedBalanceAmount > 0 && i.dueDate < todayStr), [consistentIncome, todayStr]);

  const itemsRecebidas = useMemo(() =>
    consistentIncome.filter(i =>
      i.originalAmount > 0 && (i.payments || []).some(p =>
        p.netAmount > 0 &&
        p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
      )
    ), [consistentIncome, selectedYears]);

  // Items filtered by company + doc type for KPIs and charts
  const filteredAPagar = useMemo(() => applyFilters(itemsAPagar), [itemsAPagar, applyFilters]);
  const filteredAtrasadas = useMemo(() => applyFilters(itemsAtrasadas), [itemsAtrasadas, applyFilters]);
  const filteredPagas = useMemo(() => applyFilters(itemsPagas), [itemsPagas, applyFilters]);

  const filteredAReceber = useMemo(() => {
    let result = applyFilters(itemsAReceber);
    if (selectedDocNumbers.size > 0) result = result.filter(i => selectedDocNumbers.has(i.documentNumber));
    return result;
  }, [itemsAReceber, applyFilters, selectedDocNumbers]);
  const filteredInadimplencia = useMemo(() => {
    let result = applyFilters(itemsInadimplencia);
    if (selectedDocNumbers.size > 0) result = result.filter(i => selectedDocNumbers.has(i.documentNumber));
    return result;
  }, [itemsInadimplencia, applyFilters, selectedDocNumbers]);
  // Recebidas: filtro alinhado com a página Contas Recebidas (contas-table)
  // NÃO aplica selectedDocTypes (PREVISÃO etc.) nem filtra por dueDate year
  // O filtro de ano/mês já é aplicado via paymentDate em itemsRecebidas e receivedSum
  const filteredRecebidas = useMemo(() => {
    let result = itemsRecebidas;
    if (selectedCompanies.size > 0) {
      result = result.filter(i => selectedCompanies.has(i.companyName));
    }
    if (selectedDocNumbers.size > 0) {
      result = result.filter(i => selectedDocNumbers.has(i.documentNumber));
    }
    return result;
  }, [itemsRecebidas, selectedCompanies, selectedDocNumbers]);

  // === Budget vs Actual (Orçado vs Realizado) ===
  const budgetData = useMemo(() => {
    if (!cubData || companySettings.length === 0) return [];
    const cubValue = cubData.currentValue;

    return companySettings.filter(cs => selectedCompanies.size === 0 || selectedCompanies.has(cs.companyName)).map(cs => {
      const budget = cs.areaM2 * cs.factor * cubValue;

      // Sum payments for this company using valor líquido (netAmount - taxAmount)
      // to match Sienge "Contas Pagas Sintético" Líquido column
      let realized = 0;
      consistentItems.forEach(item => {
        if (item.companyName === cs.companyName) {
          (item.payments || []).forEach(p => {
            const liquidoValue = p.netAmount - (p.taxAmount || 0);
            if (
              liquidoValue > 0 &&
              p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
            ) {
              realized += liquidoValue;
            }
          });
        }
      });

      const toRealize = budget - realized;
      const percentReal = budget > 0 ? (realized / budget) * 100 : 0;
      const companyStatus: "Ativa" | "Finalizada" = cs.status === "finalizada" ? "Finalizada" : "Ativa";

      return {
        companyId: cs.companyId,
        companyName: cs.companyName,
        factor: cs.factor,
        areaM2: cs.areaM2,
        budget,
        realized,
        toRealize,
        percentReal: Math.round(percentReal * 100) / 100,
        status: companyStatus,
      };
    }).sort((a, b) => {
      // Finalized always at the bottom
      if (a.status !== b.status) return a.status === "Finalizada" ? 1 : -1;
      return b.budget - a.budget;
    });
  }, [cubData, companySettings, consistentItems, selectedYears, selectedCompanies]);

  const budgetTotals = useMemo(() => {
    const activeRows = budgetData.filter(r => r.status === "Ativa");
    const totalBudget = budgetData.reduce((s, r) => s + r.budget, 0);
    const totalRealized = budgetData.reduce((s, r) => s + r.realized, 0);
    const totalToRealize = activeRows.reduce((s, r) => s + Math.max(0, r.toRealize), 0);
    return { totalBudget, totalRealized, totalToRealize };
  }, [budgetData]);

  // Calcula encargos (multa + juros) para itens inadimplentes - mesma fórmula de contas-table.tsx
  const calcEncargos = (item: SiengeIncome) => {
    if (!item.dueDate) return 0;
    const due = new Date(item.dueDate + "T00:00:00");
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let dias = Math.max(0, Math.floor((hoje.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    if (dias <= 0) return 0;
    if (dias > 365) dias = dias - 1;
    const saldo = item.correctedBalanceAmount || 0;
    const multa = saldo * 0.02;
    const juros = (saldo + multa) * 0.01 * (dias / 30);
    return multa + juros;
  };

  // === Delinquents grouped by client ===
  interface DelinquentClient {
    clientName: string;
    clientId: number;
    totalOverdue: number;
    installments: number;
    oldestDueDate: string;
    maxDaysOverdue: number;
    projects: string[];
    companies: string[];
    items: SiengeIncome[];
  }

  const delinquentsByClient = useMemo(() => {
    const map = new Map<string, DelinquentClient>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filteredInadimplencia.forEach(item => {
      const key = item.clientName || `Cliente ${item.clientId}`;
      const dueDate = new Date(item.dueDate + "T00:00:00");
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (!map.has(key)) {
        map.set(key, {
          clientName: key,
          clientId: item.clientId,
          totalOverdue: 0,
          installments: 0,
          oldestDueDate: item.dueDate,
          maxDaysOverdue: daysOverdue,
          projects: [],
          companies: [],
          items: [],
        });
      }

      const client = map.get(key)!;
      client.totalOverdue += item.correctedBalanceAmount + calcEncargos(item);
      client.installments += 1;
      client.items.push(item);

      if (item.dueDate < client.oldestDueDate) client.oldestDueDate = item.dueDate;
      if (daysOverdue > client.maxDaysOverdue) client.maxDaysOverdue = daysOverdue;
      if (item.projectName && !client.projects.includes(item.projectName)) client.projects.push(item.projectName);
      if (item.companyName && !client.companies.includes(item.companyName)) client.companies.push(item.companyName);
    });

    const list = Array.from(map.values());

    // Sort
    const { field, dir } = delinquentSort;
    list.sort((a, b) => {
      let cmp = 0;
      if (field === "clientName") cmp = a.clientName.localeCompare(b.clientName);
      else if (field === "installments") cmp = a.installments - b.installments;
      else if (field === "maxDaysOverdue") cmp = a.maxDaysOverdue - b.maxDaysOverdue;
      else if (field === "projects") cmp = (a.projects[0] || "").localeCompare(b.projects[0] || "");
      else cmp = a.totalOverdue - b.totalOverdue;
      return dir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [filteredInadimplencia, delinquentSort]);

  const daysDiff = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  // === Overdue grouped by creditor (CP) ===
  interface OverdueCreditor {
    creditorName: string;
    creditorId: number;
    totalOverdue: number;
    installments: number;
    oldestDueDate: string;
    maxDaysOverdue: number;
    projects: string[];
    companies: string[];
    items: SiengeOutcome[];
  }

  const overdueByCreditor = useMemo(() => {
    const map = new Map<string, OverdueCreditor>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filteredAtrasadas.forEach(item => {
      const key = item.creditorName || `Credor ${item.creditorId}`;
      const dueDate = new Date(item.dueDate + "T00:00:00");
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (!map.has(key)) {
        map.set(key, {
          creditorName: key,
          creditorId: item.creditorId,
          totalOverdue: 0,
          installments: 0,
          oldestDueDate: item.dueDate,
          maxDaysOverdue: daysOverdue,
          projects: [],
          companies: [],
          items: [],
        });
      }

      const creditor = map.get(key)!;
      creditor.totalOverdue += effectiveAmount(item);
      creditor.installments += 1;
      creditor.items.push(item);

      if (item.dueDate < creditor.oldestDueDate) creditor.oldestDueDate = item.dueDate;
      if (daysOverdue > creditor.maxDaysOverdue) creditor.maxDaysOverdue = daysOverdue;
      if (item.projectName && !creditor.projects.includes(item.projectName)) creditor.projects.push(item.projectName);
      if (item.companyName && !creditor.companies.includes(item.companyName)) creditor.companies.push(item.companyName);
    });

    const list = Array.from(map.values());

    const { field, dir } = overdueSort;
    list.sort((a, b) => {
      let cmp = 0;
      if (field === "creditorName") cmp = a.creditorName.localeCompare(b.creditorName);
      else if (field === "installments") cmp = a.installments - b.installments;
      else if (field === "maxDaysOverdue") cmp = a.maxDaysOverdue - b.maxDaysOverdue;
      else if (field === "companies") cmp = (a.companies[0] || "").localeCompare(b.companies[0] || "");
      else cmp = a.totalOverdue - b.totalOverdue;
      return dir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [filteredAtrasadas, overdueSort]);

  // Tarifas bancárias filtradas por ano e empresa selecionados
  const filteredBankFees = useMemo(() => {
    let result = bankFees.filter(bm =>
      bm.bankMovementDate && selectedYears.has(bm.bankMovementDate.substring(0, 4))
    );
    if (selectedCompanies.size > 0) {
      result = result.filter(bm => selectedCompanies.has(bm.companyName));
    }
    return result;
  }, [bankFees, selectedYears, selectedCompanies]);

  const totalBankFees = useMemo(() =>
    filteredBankFees.reduce((s, bm) => s + Math.abs(bm.bankMovementAmount), 0),
    [filteredBankFees]);

  // === KPIs (use filtered data) ===
  const totalAPagar = useMemo(() =>
    filteredAPagar.reduce((s, i) => s + effectiveAmount(i), 0), [filteredAPagar]);

  const totalAtrasado = useMemo(() =>
    filteredAtrasadas.reduce((s, i) => s + effectiveAmount(i), 0), [filteredAtrasadas]);

  const totalPago = useMemo(() =>
    filteredPagas.reduce((s, i) => s + paidSum(i), 0) + totalBankFees, [filteredPagas, paidSum, totalBankFees]);

  const previsaoHoje = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    return filteredAPagar
      .filter(i => i.dueDate === todayStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAPagar]);

  const previsao7dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const futureStr = d.toISOString().split("T")[0];
    return filteredAPagar
      .filter(i => i.dueDate <= futureStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAPagar]);

  const previsao15dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    const futureStr = d.toISOString().split("T")[0];
    return filteredAPagar
      .filter(i => i.dueDate <= futureStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAPagar]);

  const previsao30dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const futureStr = d.toISOString().split("T")[0];
    return filteredAPagar
      .filter(i => i.dueDate <= futureStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAPagar]);

  // Pagamentos realizados hoje
  const pagoHoje = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    return filteredPagas.reduce((s, i) =>
      s + (i.payments || [])
        .filter(p =>
          p.paymentDate === hoje &&
          (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName))
        )
        .reduce((ps, p) => ps + p.netAmount, 0)
    , 0);
  }, [filteredPagas, selectedOpTypes]);

  // Pagamentos realizados nos últimos 7 dias
  const pago7dias = useMemo(() => {
    const hoje = new Date();
    const d7 = new Date(hoje);
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().split("T")[0];
    const hojeStr = hoje.toISOString().split("T")[0];
    return filteredPagas.reduce((s, i) =>
      s + (i.payments || [])
        .filter(p =>
          p.paymentDate && p.paymentDate >= d7Str && p.paymentDate <= hojeStr &&
          (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName))
        )
        .reduce((ps, p) => ps + p.netAmount, 0)
    , 0);
  }, [filteredPagas, selectedOpTypes]);

  const trends = { pagoDelta: null as number | null, aPagarDelta: null as number | null };

  // === CR KPIs ===
  const totalAReceber = useMemo(() =>
    filteredAReceber.reduce((s, i) => s + effectiveAmount(i), 0), [filteredAReceber]);

  const totalInadimplencia = useMemo(() =>
    filteredInadimplencia.reduce((s, i) => s + effectiveAmount(i) + calcEncargos(i), 0), [filteredInadimplencia]);

  // Carteira total (saldo corrigido bruto) para cálculo de % inadimplência
  const carteiraTotal = useMemo(() =>
    [...filteredAReceber, ...filteredInadimplencia].reduce((s, i) => s + (i.correctedBalanceAmount || 0), 0),
    [filteredAReceber, filteredInadimplencia]);
  const saldoInadimplenciaBruto = useMemo(() =>
    filteredInadimplencia.reduce((s, i) => s + (i.correctedBalanceAmount || 0), 0), [filteredInadimplencia]);

  const totalRecebido = useMemo(() =>
    filteredRecebidas.reduce((s, i) => s + receivedSum(i), 0), [filteredRecebidas, receivedSum]);

  const receberHoje = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    return filteredAReceber
      .filter(i => i.dueDate === hoje)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAReceber]);

  const receber7dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const futureStr = d.toISOString().split("T")[0];
    return filteredAReceber
      .filter(i => i.dueDate <= futureStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAReceber]);

  const receber15dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    const futureStr = d.toISOString().split("T")[0];
    return filteredAReceber
      .filter(i => i.dueDate <= futureStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAReceber]);

  const receber30dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const futureStr = d.toISOString().split("T")[0];
    return filteredAReceber
      .filter(i => i.dueDate <= futureStr)
      .reduce((s, i) => s + effectiveAmount(i), 0);
  }, [filteredAReceber]);

  const recebidoHoje = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    return filteredRecebidas.reduce((s, i) => {
      return s + (i.payments || [])
        .filter(p => p.paymentDate === hoje && p.netAmount > 0)
        .reduce((ps, p) => ps + p.netAmount, 0);
    }, 0);
  }, [filteredRecebidas]);

  const recebido7dias = useMemo(() => {
    const hoje = new Date();
    const d7 = new Date(hoje);
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().split("T")[0];
    const hojeStr = hoje.toISOString().split("T")[0];
    return filteredRecebidas.reduce((s, i) => {
      return s + (i.payments || [])
        .filter(p => p.paymentDate >= d7Str && p.paymentDate <= hojeStr && p.netAmount > 0)
        .reduce((ps, p) => ps + p.netAmount, 0);
    }, 0);
  }, [filteredRecebidas]);

  // === Chart helpers ===
  function buildCompanyChart(sourceItems: (SiengeOutcome | SiengeIncome)[], field: "balance" | "paid" | "received") {
    const map = new Map<string, number>();
    sourceItems.forEach(item => {
      const val = field === "balance"
        ? effectiveAmount(item)
        : field === "received"
          ? receivedSum(item as SiengeIncome)
          : paidSum(item);
      if (val > 0) {
        map.set(item.companyName, (map.get(item.companyName) || 0) + val);
      }
    });
    // Adiciona tarifas bancárias ao gráfico de empresas
    if (field === "paid") {
      filteredBankFees.forEach(bm => {
        const amt = Math.abs(bm.bankMovementAmount);
        if (amt > 0) {
          map.set(bm.companyName, (map.get(bm.companyName) || 0) + amt);
        }
      });
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name: name.length > 20 ? name.substring(0, 20) + "..." : name,
        fullName: name,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }

  function buildMonthlyChart(filteredItems: (SiengeOutcome | SiengeIncome)[], field: "balance" | "paid" | "received", skipPastMonths = false) {
    const currentMonth = new Date().getMonth(); // 0-indexed
    if (field === "paid") {
      // Agrupa pagamentos por paymentDate (data real do pagamento), filtrando pelo ano selecionado
      const monthTotals = new Map<number, number>();
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
            p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
          )
          .forEach(p => {
            const m = new Date(p.paymentDate + "T00:00:00").getMonth();
            monthTotals.set(m, (monthTotals.get(m) || 0) + p.netAmount);
          });
      });
      // Adiciona tarifas bancárias por mês
      filteredBankFees.forEach(bm => {
        const m = new Date(bm.bankMovementDate + "T00:00:00").getMonth();
        monthTotals.set(m, (monthTotals.get(m) || 0) + Math.abs(bm.bankMovementAmount));
      });
      return MONTH_LABELS.map((label, idx) => {
        const value = monthTotals.get(idx) || 0;
        if (value === 0 && idx > currentMonth) return null; // Não mostra meses futuros sem dados
        return { month: label, value };
      }).filter(Boolean) as { month: string; value: number }[];
    }
    if (field === "received") {
      // Agrupa recebimentos por paymentDate e soma netAmount (igual à página Contas Recebidas)
      const monthTotals = new Map<number, number>();
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            p.netAmount > 0 &&
            p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
          )
          .forEach(p => {
            const m = new Date(p.paymentDate + "T00:00:00").getMonth();
            monthTotals.set(m, (monthTotals.get(m) || 0) + p.netAmount);
          });
      });
      return MONTH_LABELS.map((label, idx) => {
        const value = monthTotals.get(idx) || 0;
        if (value === 0 && idx > currentMonth) return null;
        return { month: label, value };
      }).filter(Boolean) as { month: string; value: number }[];
    }
    return MONTH_LABELS.map((label, idx) => {
      if (skipPastMonths && selectedYears.has(String(currentYear)) && selectedYears.size === 1 && idx < currentMonth) return null;
      const monthItems = filteredItems.filter(i => {
        const d = new Date(i.dueDate + "T00:00:00");
        return d.getMonth() === idx;
      });
      const value = monthItems.reduce((s, i) => s + effectiveAmount(i), 0);
      return { month: label, value };
    }).filter(Boolean) as { month: string; value: number }[];
  }

  function buildAnnualChart(filteredItems: (SiengeOutcome | SiengeIncome)[], field: "balance" | "paid" | "received") {
    if (field === "paid") {
      // Agrupa pagamentos por ano do paymentDate, filtrando pelo ano selecionado
      const yearMap = new Map<number, number>();
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
            p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
          )
          .forEach(p => {
            const y = new Date(p.paymentDate + "T00:00:00").getFullYear();
            yearMap.set(y, (yearMap.get(y) || 0) + p.netAmount);
          });
      });
      // Adiciona tarifas bancárias por ano
      filteredBankFees.forEach(bm => {
        const y = new Date(bm.bankMovementDate + "T00:00:00").getFullYear();
        yearMap.set(y, (yearMap.get(y) || 0) + Math.abs(bm.bankMovementAmount));
      });
      return Array.from(yearMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, value]) => ({ month: String(year), value }));
    }
    if (field === "received") {
      const yearMap = new Map<number, number>();
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            p.netAmount > 0 &&
            p.paymentDate && selectedYears.has(p.paymentDate.substring(0, 4))
          )
          .forEach(p => {
            const y = new Date(p.paymentDate + "T00:00:00").getFullYear();
            yearMap.set(y, (yearMap.get(y) || 0) + p.netAmount);
          });
      });
      return Array.from(yearMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, value]) => ({ month: String(year), value }));
    }
    const yearMap = new Map<number, number>();
    filteredItems.forEach(item => {
      const y = new Date(item.dueDate + "T00:00:00").getFullYear();
      yearMap.set(y, (yearMap.get(y) || 0) + effectiveAmount(item));
    });
    return Array.from(yearMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, value]) => ({ month: String(year), value }));
  }

  // === Tab-specific data ===
  const tabData = useMemo(() => {
    if (activeTab === "a-pagar") {
      return {
        companyChart: buildCompanyChart(filteredAPagar, "balance"),
        monthly: buildMonthlyChart(filteredAPagar, "balance", true),
        annual: buildAnnualChart(filteredAPagar, "balance"),
        color: "hsl(217, 91%, 60%)",
        label: "A Pagar",
      };
    } else if (activeTab === "pagas") {
      return {
        companyChart: buildCompanyChart(filteredPagas, "paid"),
        monthly: buildMonthlyChart(filteredPagas, "paid"),
        annual: buildAnnualChart(filteredPagas, "paid"),
        color: "hsl(160, 60%, 45%)",
        label: "Pago",
      };
    } else if (activeTab === "atrasadas") {
      return {
        companyChart: buildCompanyChart(filteredAtrasadas, "balance"),
        monthly: buildMonthlyChart(filteredAtrasadas, "balance"),
        annual: buildAnnualChart(filteredAtrasadas, "balance"),
        color: "hsl(0, 84%, 60%)",
        label: "Atrasado",
      };
    } else if (activeTab === "a-receber") {
      return {
        companyChart: buildCompanyChart(filteredAReceber, "balance"),
        monthly: buildMonthlyChart(filteredAReceber, "balance", true),
        annual: buildAnnualChart(filteredAReceber, "balance"),
        color: "hsl(142, 71%, 45%)",
        label: "A Receber",
      };
    } else if (activeTab === "recebidas") {
      return {
        companyChart: buildCompanyChart(filteredRecebidas, "received"),
        monthly: buildMonthlyChart(filteredRecebidas, "received"),
        annual: buildAnnualChart(filteredRecebidas, "received"),
        color: "hsl(199, 89%, 48%)",
        label: "Recebido",
      };
    } else {
      // inadimplencia
      return {
        companyChart: buildCompanyChart(filteredInadimplencia, "balance"),
        monthly: buildMonthlyChart(filteredInadimplencia, "balance"),
        annual: buildAnnualChart(filteredInadimplencia, "balance"),
        color: "hsl(25, 95%, 53%)",
        label: "Inadimplente",
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items, incomeItems, todayStr, selectedCompanies, selectedDocTypes, selectedMonths, selectedDays, duePeriodMaxDate, selectedOpTypes, filteredBankFees]);

  // === Loading State ===
  if (loading) {
    return (
      <div className="space-y-8 p-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64 bg-slate-200" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-28 bg-slate-200" />
            <Skeleton className="h-10 w-64 bg-slate-200" />
          </div>
        </div>
        {/* Loading indicator */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl shadow-sm border border-slate-100">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-slate-600">Carregando dados do painel...</span>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl bg-slate-200" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-[420px] rounded-xl bg-slate-200" />
          <Skeleton className="h-[420px] rounded-xl lg:col-span-2 bg-slate-200" />
        </div>
      </div>
    );
  }

  // === KPI configs per tab ===
  const kpiConfigs: Record<MainTab, Array<{
    label: string;
    value: string;
    subtitle?: string;
    icon: React.ReactNode;
    iconBg: string;
    gradient: string;
    trend?: number | null;
    trendLabel?: string;
    onClick?: () => void;
  }>> = {
    "a-pagar": [
      {
        label: "Total a Pagar",
        value: formatCurrency(totalAPagar),
        subtitle: `${filteredAPagar.length} parcelas`,
        icon: <Clock className="h-7 w-7 text-blue-500" />,
        iconBg: "bg-blue-50",
        gradient: "from-blue-500 to-blue-600",
        trend: trends.aPagarDelta,
        trendLabel: "vs ano anterior",
      },
      {
        label: "Vence Hoje",
        value: formatCurrency(previsaoHoje),
        subtitle: (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} - ${filteredAPagar.filter(i => i.dueDate === d.toISOString().split("T")[0]).length} parcelas`; })(),
        icon: <AlertTriangle className="h-7 w-7 text-red-500" />,
        iconBg: "bg-red-50",
        gradient: "from-red-500 to-red-600",
      },
      {
        label: "Vence em 7 dias",
        value: formatCurrency(previsao7dias),
        subtitle: (() => { const h = new Date(); const f = new Date(); f.setDate(f.getDate()+7); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")} a ${String(f.getDate()).padStart(2,"0")}/${String(f.getMonth()+1).padStart(2,"0")}/${f.getFullYear()}`; })(),
        icon: <CalendarClock className="h-7 w-7 text-amber-500" />,
        iconBg: "bg-amber-50",
        gradient: "from-amber-500 to-amber-600",
      },
      {
        label: "Vence em 15 dias",
        value: formatCurrency(previsao15dias),
        subtitle: (() => { const h = new Date(); const f = new Date(); f.setDate(f.getDate()+15); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")} a ${String(f.getDate()).padStart(2,"0")}/${String(f.getMonth()+1).padStart(2,"0")}/${f.getFullYear()}`; })(),
        icon: <CalendarClock className="h-7 w-7 text-orange-500" />,
        iconBg: "bg-orange-50",
        gradient: "from-orange-500 to-orange-600",
      },
      {
        label: "Vence em 30 dias",
        value: formatCurrency(previsao30dias),
        subtitle: (() => { const h = new Date(); const f = new Date(); f.setDate(f.getDate()+30); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")} a ${String(f.getDate()).padStart(2,"0")}/${String(f.getMonth()+1).padStart(2,"0")}/${f.getFullYear()}`; })(),
        icon: <TrendingDown className="h-7 w-7 text-violet-500" />,
        iconBg: "bg-violet-50",
        gradient: "from-violet-500 to-violet-600",
      },
    ],
    "pagas": [
      {
        label: "Total Pago",
        value: formatCurrency(totalPago),
        subtitle: `${filteredPagas.length} titulos${totalBankFees > 0 ? ` + ${filteredBankFees.length} tarifas` : ""}`,
        icon: <CheckCircle className="h-7 w-7 text-emerald-500" />,
        iconBg: "bg-emerald-50",
        gradient: "from-emerald-500 to-emerald-600",
        trend: trends.pagoDelta,
        trendLabel: "vs ano anterior",
      },
      {
        label: "Pago Hoje",
        value: formatCurrency(pagoHoje),
        icon: <CalendarClock className="h-7 w-7 text-teal-500" />,
        iconBg: "bg-teal-50",
        gradient: "from-teal-500 to-teal-600",
      },
      {
        label: "Pago Ultimos 7 dias",
        value: formatCurrency(pago7dias),
        icon: <Clock className="h-7 w-7 text-blue-500" />,
        iconBg: "bg-blue-50",
        gradient: "from-blue-500 to-blue-600",
      },
      {
        label: "Empresas",
        value: String(new Set(filteredPagas.map(i => i.companyName)).size),
        subtitle: "com pagamentos",
        icon: <Building2 className="h-7 w-7 text-slate-500" />,
        iconBg: "bg-slate-100",
        gradient: "from-slate-500 to-slate-600",
      },
      {
        label: "Credores",
        value: String(new Set(filteredPagas.map(i => i.creditorName)).size),
        subtitle: "distintos",
        icon: <FileText className="h-7 w-7 text-blue-500" />,
        iconBg: "bg-blue-50",
        gradient: "from-blue-500 to-blue-600",
      },
    ],
    "atrasadas": [
      {
        label: "Total Atrasado",
        value: formatCurrency(totalAtrasado),
        subtitle: `${filteredAtrasadas.length} parcelas`,
        icon: <AlertTriangle className="h-7 w-7 text-red-500" />,
        iconBg: "bg-red-50",
        gradient: "from-red-500 to-red-600",
      },
      {
        label: "Empresas",
        value: String(new Set(filteredAtrasadas.map(i => i.companyName)).size),
        subtitle: "com atrasos",
        icon: <Building2 className="h-7 w-7 text-red-400" />,
        iconBg: "bg-red-50",
        gradient: "from-red-400 to-red-500",
      },
      {
        label: "Credores",
        value: String(new Set(filteredAtrasadas.map(i => i.creditorName)).size),
        subtitle: showOverdueTable ? "clique para fechar" : "clique para detalhar",
        icon: <FileText className="h-7 w-7 text-orange-500" />,
        iconBg: "bg-orange-50",
        gradient: "from-orange-500 to-orange-600",
        onClick: () => { setShowOverdueTable(v => !v); setExpandedCreditors(new Set()); },
      },
    ],
    "a-receber": [
      {
        label: "Total a Receber",
        value: formatCurrency(totalAReceber),
        subtitle: `${filteredAReceber.length} parcelas`,
        icon: <Banknote className="h-7 w-7 text-emerald-500" />,
        iconBg: "bg-emerald-50",
        gradient: "from-emerald-500 to-emerald-600",
      },
      {
        label: "Vence Hoje",
        value: formatCurrency(receberHoje),
        subtitle: (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} - ${filteredAReceber.filter(i => i.dueDate === d.toISOString().split("T")[0]).length} parcelas`; })(),
        icon: <AlertTriangle className="h-7 w-7 text-amber-500" />,
        iconBg: "bg-amber-50",
        gradient: "from-amber-500 to-amber-600",
      },
      {
        label: "Vence em 7 dias",
        value: formatCurrency(receber7dias),
        subtitle: (() => { const h = new Date(); const f = new Date(); f.setDate(f.getDate()+7); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")} a ${String(f.getDate()).padStart(2,"0")}/${String(f.getMonth()+1).padStart(2,"0")}/${f.getFullYear()}`; })(),
        icon: <CalendarClock className="h-7 w-7 text-teal-500" />,
        iconBg: "bg-teal-50",
        gradient: "from-teal-500 to-teal-600",
      },
      {
        label: "Vence em 15 dias",
        value: formatCurrency(receber15dias),
        subtitle: (() => { const h = new Date(); const f = new Date(); f.setDate(f.getDate()+15); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")} a ${String(f.getDate()).padStart(2,"0")}/${String(f.getMonth()+1).padStart(2,"0")}/${f.getFullYear()}`; })(),
        icon: <CalendarClock className="h-7 w-7 text-cyan-500" />,
        iconBg: "bg-cyan-50",
        gradient: "from-cyan-500 to-cyan-600",
      },
      {
        label: "Vence em 30 dias",
        value: formatCurrency(receber30dias),
        subtitle: (() => { const h = new Date(); const f = new Date(); f.setDate(f.getDate()+30); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")} a ${String(f.getDate()).padStart(2,"0")}/${String(f.getMonth()+1).padStart(2,"0")}/${f.getFullYear()}`; })(),
        icon: <TrendingUp className="h-7 w-7 text-green-500" />,
        iconBg: "bg-green-50",
        gradient: "from-green-500 to-green-600",
      },
    ],
    "recebidas": [
      {
        label: "Total Recebido",
        value: formatCurrency(totalRecebido),
        subtitle: `${filteredRecebidas.length} titulos`,
        icon: <CheckCircle className="h-7 w-7 text-sky-500" />,
        iconBg: "bg-sky-50",
        gradient: "from-sky-500 to-sky-600",
      },
      {
        label: "Recebido Hoje",
        value: formatCurrency(recebidoHoje),
        icon: <CalendarClock className="h-7 w-7 text-teal-500" />,
        iconBg: "bg-teal-50",
        gradient: "from-teal-500 to-teal-600",
      },
      {
        label: "Recebido Ultimos 7 dias",
        value: formatCurrency(recebido7dias),
        icon: <Clock className="h-7 w-7 text-blue-500" />,
        iconBg: "bg-blue-50",
        gradient: "from-blue-500 to-blue-600",
      },
      {
        label: "Empresas",
        value: String(new Set(filteredRecebidas.map(i => i.companyName)).size),
        subtitle: "com recebimentos",
        icon: <Building2 className="h-7 w-7 text-slate-500" />,
        iconBg: "bg-slate-100",
        gradient: "from-slate-500 to-slate-600",
      },
      {
        label: "Clientes",
        value: String(new Set(filteredRecebidas.map(i => i.clientName)).size),
        subtitle: "distintos",
        icon: <Users className="h-7 w-7 text-sky-500" />,
        iconBg: "bg-sky-50",
        gradient: "from-sky-500 to-sky-600",
      },
    ],
    "inadimplencia": [
      {
        label: "Total Inadimplente",
        value: formatCurrency(totalInadimplencia),
        subtitle: `${filteredInadimplencia.length} parcelas`,
        icon: <AlertTriangle className="h-7 w-7 text-orange-500" />,
        iconBg: "bg-orange-50",
        gradient: "from-orange-500 to-orange-600",
      },
      {
        label: "Empresas",
        value: String(new Set(filteredInadimplencia.map(i => i.companyName)).size),
        subtitle: "com inadimplencia",
        icon: <Building2 className="h-7 w-7 text-orange-400" />,
        iconBg: "bg-orange-50",
        gradient: "from-orange-400 to-orange-500",
      },
      {
        label: "% Inadimplência",
        value: carteiraTotal > 0
          ? ((saldoInadimplenciaBruto / carteiraTotal) * 100).toFixed(1) + "%"
          : "0%",
        subtitle: "do total a receber",
        icon: <TrendingDown className="h-7 w-7 text-red-400" />,
        iconBg: "bg-red-50",
        gradient: "from-red-400 to-red-500",
      },
      {
        label: "Clientes",
        value: String(new Set(filteredInadimplencia.map(i => i.clientName)).size),
        subtitle: showDelinquentTable ? "clique para fechar" : "clique para detalhar",
        icon: <Users className="h-7 w-7 text-red-500" />,
        iconBg: "bg-red-50",
        gradient: "from-red-500 to-red-600",
        onClick: () => { setShowDelinquentTable(v => !v); setExpandedClients(new Set()); },
      },
    ],
    orcamento: [],
    dre: [],
  };

  const kpis = kpiConfigs[activeTab];
  const { companyChart, monthly, annual, color, label: seriesLabel } = tabData;
  const chartDataRaw = chartView === "anual" ? annual : monthly;
  const chartData = chartDataRaw.map((item, idx) => {
    const prev = idx > 0 ? chartDataRaw[idx - 1].value : 0;
    const pct = prev > 0 ? ((item.value - prev) / prev) * 100 : null;
    return { ...item, pct };
  });

  const barColorFn = (idx: number) => {
    if (activeTab === "a-pagar") return `hsl(217, 91%, ${55 + idx * 3}%)`;
    if (activeTab === "pagas") return `hsl(160, 60%, ${40 + idx * 3}%)`;
    if (activeTab === "atrasadas") return `hsl(0, 84%, ${50 + idx * 3}%)`;
    if (activeTab === "a-receber") return `hsl(142, 71%, ${40 + idx * 3}%)`;
    if (activeTab === "recebidas") return `hsl(199, 89%, ${43 + idx * 3}%)`;
    return `hsl(25, 95%, ${48 + idx * 3}%)`;
  };



  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Painel Executivo</h1>
            <p className="text-slate-500 mt-1">Visao consolidada das contas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            const ts = section === "cp" ? lastUpdatedCp : lastUpdatedCr;
            if (!ts) return null;
            const d = new Date(ts);
            const formatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            return <span className="text-xs text-slate-400">Atualizado em {formatted}</span>;
          })()}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="gap-2"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Section Toggle (CP / CR) + Main Tabs + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Section Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => {
                if (section !== "cp") {
                  setSection("cp");
                  setActiveTab("a-pagar");
                  setSelectedCompanies(new Set());
                  setSelectedDocTypes(new Set());
                  setSelectedMonths(new Set());
                  setSelectedDays(new Set());
                  setSelectedDuePeriods(new Set());
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                section === "cp"
                  ? "bg-white text-red-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              CP
            </button>
            <button
              onClick={() => {
                if (section !== "cr") {
                  setSection("cr");
                  setActiveTab("a-receber");
                  setSelectedCompanies(new Set());
                  setSelectedDocTypes(new Set());
                  setSelectedMonths(new Set());
                  setSelectedDays(new Set());
                  setSelectedDuePeriods(new Set());
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                section === "cr"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" />
              CR
            </button>
            <button
              onClick={() => {
                setSection("cp");
                setActiveTab("orcamento");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "orcamento"
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Ruler className="h-3.5 w-3.5" />
              Orçamento
            </button>
            <button
              onClick={() => {
                setSection("cp");
                setActiveTab("dre");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "dre"
                  ? "bg-white text-teal-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              DRE
            </button>
          </div>

          {/* Tabs */}
          {activeTab !== "orcamento" && activeTab !== "dre" && <Tabs value={activeTab} onValueChange={v => {
            const tab = v as MainTab;
            setActiveTab(tab);
            // Only reset time-based filters, keep company, docType and year selections stable
            setSelectedMonths(new Set());
            setSelectedDays(new Set());
            setSelectedDuePeriods(new Set());
          }}>
            <TabsList className="h-12 bg-transparent p-0 gap-1">
              {section === "cp" ? (
                <>
                  <TabsTrigger value="a-pagar" className={`gap-2 px-5 h-10 rounded-none border-b-[3px] transition-all ${activeTab === "a-pagar" ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold shadow-sm" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                    <Clock className="h-4 w-4" />
                    Contas a Pagar
                  </TabsTrigger>
                  <TabsTrigger value="pagas" className={`gap-2 px-5 h-10 rounded-none border-b-[3px] transition-all ${activeTab === "pagas" ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold shadow-sm" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                    <CheckCircle className="h-4 w-4" />
                    Contas Pagas
                  </TabsTrigger>
                  <TabsTrigger value="atrasadas" className={`gap-2 px-5 h-10 rounded-none border-b-[3px] transition-all ${activeTab === "atrasadas" ? "border-red-500 bg-red-50 text-red-700 font-semibold shadow-sm" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                    <AlertTriangle className="h-4 w-4" />
                    Contas em Atraso
                    {itemsAtrasadas.length > 0 && (
                      <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {itemsAtrasadas.length}
                      </span>
                    )}
                  </TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="a-receber" className={`gap-2 px-5 h-10 rounded-none border-b-[3px] transition-all ${activeTab === "a-receber" ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold shadow-sm" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                    <Banknote className="h-4 w-4" />
                    Contas a Receber
                  </TabsTrigger>
                  <TabsTrigger value="recebidas" className={`gap-2 px-5 h-10 rounded-none border-b-[3px] transition-all ${activeTab === "recebidas" ? "border-sky-500 bg-sky-50 text-sky-700 font-semibold shadow-sm" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                    <CheckCircle className="h-4 w-4" />
                    Contas Recebidas
                  </TabsTrigger>
                  <TabsTrigger value="inadimplencia" className={`gap-2 px-5 h-10 rounded-none border-b-[3px] transition-all ${activeTab === "inadimplencia" ? "border-orange-500 bg-orange-50 text-orange-700 font-semibold shadow-sm" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                    <AlertTriangle className="h-4 w-4" />
                    Inadimplencia
                    {itemsInadimplencia.length > 0 && (
                      <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {itemsInadimplencia.length}
                      </span>
                    )}
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </Tabs>}
        </div>

        {/* Filters */}
        {activeTab === "orcamento" && <div className="flex items-center gap-2">
          <MultiSelectFilter
            label="Empresas"
            icon={<Building2 className="h-4 w-4" />}
            allOptions={allCompanyNames}
            selected={selectedCompanies}
            onToggle={(name) => toggleInSet(setSelectedCompanies, name)}
            onSelectAll={() => setSelectedCompanies(new Set(allCompanyNames))}
            onClear={() => setSelectedCompanies(defaultCompanies())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_companies", JSON.stringify([...selectedCompanies]));
              toast.success("Padrao de empresas salvo!");
            }}
          />
          {allOpTypes.length > 0 && (
            <MultiSelectFilter
              label="Tipo Operação"
              icon={<CheckCircle className="h-4 w-4" />}
              allOptions={allOpTypes}
              selected={selectedOpTypes}
              onToggle={(name) => toggleInSet(setSelectedOpTypes, name)}
              onSelectAll={() => setSelectedOpTypes(new Set(allOpTypes))}
              onClear={() => setSelectedOpTypes(new Set())}
              activeColor="emerald"
              onSaveDefault={() => {
                localStorage.setItem("dashboard_default_opTypes", JSON.stringify([...selectedOpTypes]));
                toast.success("Padrao de operacoes salvo!");
              }}
            />
          )}
        </div>}
        {activeTab === "dre" && <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Empresas"
            icon={<Building2 className="h-4 w-4" />}
            allOptions={allCompanyNames}
            selected={selectedCompanies}
            onToggle={(name) => toggleInSet(setSelectedCompanies, name)}
            onSelectAll={() => setSelectedCompanies(new Set(allCompanyNames))}
            onClear={() => setSelectedCompanies(defaultCompanies())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_companies", JSON.stringify([...selectedCompanies]));
              toast.success("Padrao de empresas salvo!");
            }}
          />
          <MultiSelectFilter
            label="Anos"
            icon={<CalendarClock className="h-4 w-4" />}
            allOptions={availableYears}
            selected={selectedYears}
            onToggle={(y) => toggleInSet(setSelectedYears, y)}
            onSelectAll={() => setSelectedYears(new Set(availableYears))}
            onClear={() => setSelectedYears(new Set())}
            activeColor="violet"
          />
          <MultiSelectFilter
            label="Meses"
            icon={<CalendarClock className="h-4 w-4" />}
            allOptions={MONTH_OPTIONS}
            selected={selectedMonths}
            onToggle={(m) => toggleInSet(setSelectedMonths, m)}
            onSelectAll={() => setSelectedMonths(new Set(MONTH_OPTIONS))}
            onClear={() => setSelectedMonths(new Set())}
            activeColor="amber"
            labelFn={(m) => MONTH_NAMES[m] || m}
          />
        </div>}
        {activeTab !== "orcamento" && activeTab !== "dre" && <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Empresas"
            icon={<Building2 className="h-4 w-4" />}
            allOptions={allCompanyNames}
            selected={selectedCompanies}
            onToggle={(name) => toggleInSet(setSelectedCompanies, name)}
            onSelectAll={() => setSelectedCompanies(new Set(allCompanyNames))}
            onClear={() => setSelectedCompanies(defaultCompanies())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_companies", JSON.stringify([...selectedCompanies]));
              toast.success("Padrao de empresas salvo!");
            }}
          />
          {(activeTab === "pagas" || activeTab === "recebidas") && allOpTypes.length > 0 && (
            <MultiSelectFilter
              label="Tipo Operação"
              icon={<CheckCircle className="h-4 w-4" />}
              allOptions={allOpTypes}
              selected={selectedOpTypes}
              onToggle={(name) => toggleInSet(setSelectedOpTypes, name)}
              onSelectAll={() => setSelectedOpTypes(new Set(allOpTypes))}
              onClear={() => setSelectedOpTypes(new Set())}
              activeColor="emerald"
              onSaveDefault={() => {
                localStorage.setItem("dashboard_default_opTypes", JSON.stringify([...selectedOpTypes]));
                toast.success("Padrao de operacoes salvo!");
              }}
            />
          )}
          {(activeTab === "recebidas" || activeTab === "a-receber" || activeTab === "inadimplencia") && allDocNumbers.length > 0 && (
            <MultiSelectFilter
              label="Nº Documento"
              icon={<FileText className="h-4 w-4" />}
              allOptions={allDocNumbers}
              selected={selectedDocNumbers}
              onToggle={(name) => toggleInSet(setSelectedDocNumbers, name)}
              onSelectAll={() => setSelectedDocNumbers(new Set(allDocNumbers))}
              onClear={() => setSelectedDocNumbers(new Set())}
              activeColor="cyan"
              onSaveDefault={() => {
                localStorage.setItem("dashboard_default_docNumbers", JSON.stringify([...selectedDocNumbers]));
                toast.success("Padrao de numero documento salvo!");
              }}
            />
          )}
          <MultiSelectFilter
            label="Tipo Doc."
            icon={<FileText className="h-4 w-4" />}
            allOptions={allDocTypes}
            selected={selectedDocTypes}
            onToggle={(name) => toggleInSet(setSelectedDocTypes, name)}
            onSelectAll={() => setSelectedDocTypes(new Set(allDocTypes))}
            onClear={() => setSelectedDocTypes(new Set())}
            activeColor="violet"
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_docTypes", JSON.stringify([...selectedDocTypes]));
              toast.success("Padrao de tipo documento salvo!");
            }}
          />
          {/* Time filters for all tabs */}
          <MultiSelectFilter
            label="Anos"
            icon={<CalendarClock className="h-4 w-4" />}
            allOptions={availableYears}
            selected={selectedYears}
            onToggle={(y) => toggleInSet(setSelectedYears, y)}
            onSelectAll={() => setSelectedYears(new Set(availableYears))}
            onClear={() => {
              const defaultYrs: string[] = [];
              for (let y = currentYear - 10; y <= currentYear; y++) defaultYrs.push(String(y));
              setSelectedYears(new Set(defaultYrs));
            }}
            activeColor="blue"
          />
          <MultiSelectFilter
            label="Meses"
            icon={<CalendarClock className="h-4 w-4" />}
            allOptions={availableMonths}
            selected={selectedMonths}
            onToggle={(m) => toggleInSet(setSelectedMonths, m)}
            onSelectAll={() => setSelectedMonths(new Set(availableMonths))}
            onClear={() => setSelectedMonths(new Set())}
            activeColor="blue"
            labelFn={(v) => MONTH_NAMES[v] || v}
          />
          {(activeTab === "a-pagar" || activeTab === "a-receber") && (
            <MultiSelectFilter
              label="Vencimento"
              icon={<Clock className="h-4 w-4" />}
              allOptions={DUE_PERIOD_OPTIONS}
              selected={selectedDuePeriods}
              onToggle={(p) => toggleInSet(setSelectedDuePeriods, p)}
              onSelectAll={() => setSelectedDuePeriods(new Set(DUE_PERIOD_OPTIONS))}
              onClear={() => setSelectedDuePeriods(new Set())}
              activeColor="violet"
              labelFn={(v) => DUE_PERIOD_LABELS[v] || v}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const savedCo = localStorage.getItem("dashboard_default_companies");
              setSelectedCompanies(savedCo ? new Set(JSON.parse(savedCo)) : defaultCompanies());
              const savedDoc = localStorage.getItem("dashboard_default_docTypes");
              setSelectedDocTypes(savedDoc ? new Set(JSON.parse(savedDoc)) : new Set(allDocTypes.filter(t => !isExcludedDocType(t))));
              setSelectedMonths(new Set());
              setSelectedDays(new Set());
              setSelectedDuePeriods(new Set());
              setSelectedDocNumbers(new Set());
              const savedOp = localStorage.getItem("dashboard_default_opTypes");
              setSelectedOpTypes(savedOp ? new Set(JSON.parse(savedOp)) : new Set(["Pagamento"]));
              const defaultYrs: string[] = [];
              for (let y = currentYear - 10; y <= currentYear; y++) defaultYrs.push(String(y));
              setSelectedYears(new Set(defaultYrs));
            }}
            className="text-slate-400 px-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>}
      </div>

      {/* Budget Tab Content */}
      {activeTab === "orcamento" && (
        <div className="space-y-6">
          {/* CUB Info Bar */}
          {cubData && (
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 text-white rounded-lg px-4 py-2 text-center">
                <p className="text-xs text-slate-400">Valor CUB mês atual</p>
                <p className="text-lg font-bold">{formatCurrency(cubData.currentValue)}</p>
              </div>
              <div className="bg-slate-800 text-white rounded-lg px-4 py-2 text-center">
                <p className="text-xs text-slate-400">Variação CUB mês atual</p>
                <p className="text-lg font-bold">{cubData.monthlyVariation.toFixed(2)}%</p>
              </div>
              <div className="bg-slate-800 text-white rounded-lg px-4 py-2 text-center">
                <p className="text-xs text-slate-400">Var Acum. {currentYear}</p>
                <p className="text-lg font-bold">{cubData.yearlyAccumulated.toFixed(2)}%</p>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-600" />
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Orçamento</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(budgetTotals.totalBudget)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-600" />
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Realizado</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(budgetTotals.totalRealized)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-600" />
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">A Realizar</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(budgetTotals.totalToRealize)}</p>
                <p className="text-xs text-slate-400 mt-1">Valor não contabiliza obras finalizadas e saldos negativos</p>
              </CardContent>
            </Card>
          </div>

          {/* Budget Table */}
          <Card className="border-0 shadow-sm">
            <CardContent className="px-0 pb-0 pt-0">
              {budgetData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Ruler className="h-12 w-12 mb-3 text-slate-300" />
                  <p className="text-sm font-medium">Nenhum empreendimento configurado</p>
                  <p className="text-xs mt-1">Configure os empreendimentos em Configuracoes → Empreendimentos</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow>
                        <TableHead className="font-semibold">Empreendimento</TableHead>
                        <TableHead className="text-center font-semibold w-20">Fator</TableHead>
                        <TableHead className="text-right font-semibold">Orçamento</TableHead>
                        <TableHead className="text-right font-semibold">Realizado</TableHead>
                        <TableHead className="text-right font-semibold">À Realizar</TableHead>
                        <TableHead className="text-center font-semibold w-24">% Real</TableHead>
                        <TableHead className="text-center font-semibold w-24">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetData.map((row) => (
                        <TableRow key={row.companyId} className={`${row.status === "Finalizada" ? "bg-slate-100/80 hover:bg-slate-100 text-slate-400" : "hover:bg-slate-50"}`}>
                          <TableCell className="font-medium">{row.companyName}</TableCell>
                          <TableCell className="text-center text-slate-500">{row.factor.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(row.budget)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(row.realized)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${row.toRealize < 0 ? "text-red-600" : ""}`}>
                            {row.toRealize < 0 && <TrendingDown className="inline h-3 w-3 mr-1" />}
                            {formatCurrency(row.toRealize)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-sm font-semibold ${row.percentReal >= 100 ? "text-emerald-600" : row.percentReal >= 70 ? "text-amber-600" : "text-blue-600"}`}>
                              {row.percentReal.toFixed(2)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={row.status === "Ativa" ? "default" : "secondary"} className={row.status === "Ativa" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-200 text-slate-600"}>
                              {row.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* PDF Export Button */}
      {activeTab === "a-pagar" && filteredAPagar.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-slate-600 hover:text-blue-600 hover:border-blue-300"
            onClick={() => {
              const now = new Date();
              const fmtNow = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
              let periodLabel = "Todas as contas a pagar";
              if (selectedDuePeriods.size > 0) {
                const labels: string[] = [];
                if (selectedDuePeriods.has("hoje")) labels.push("Hoje");
                if (selectedDuePeriods.has("7dias")) labels.push("7 dias");
                if (selectedDuePeriods.has("15dias")) labels.push("15 dias");
                if (selectedDuePeriods.has("30dias")) labels.push("30 dias");
                periodLabel = `Vencimento: ${labels.join(", ")}`;
              }
              generateContasPagarPDF({
                items: filteredAPagar,
                totalAPagar,
                periodLabel,
                companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "Empresa",
                generatedAt: fmtNow,
              });
            }}
          >
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      {activeTab !== "orcamento" && activeTab !== "dre" && (<><div className={`grid gap-5 md:grid-cols-2 lg:grid-cols-${kpis.length}`}>
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className={`border-0 shadow-sm overflow-hidden relative group hover:shadow-md transition-all duration-300 ${kpi.onClick ? "cursor-pointer" : ""} ${kpi.onClick && (showDelinquentTable || showOverdueTable) ? "ring-2 ring-red-400 ring-offset-1" : ""}`}
            onClick={kpi.onClick}
          >
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${kpi.gradient}`} />
            <CardContent className="pt-6 pb-5 px-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {kpi.label}
                  </p>
                  <p className="text-lg lg:text-xl xl:text-2xl font-bold text-slate-800 mt-2 tabular-nums truncate">
                    {kpi.value}
                  </p>
                  {kpi.subtitle && (
                    <p className="text-xs text-slate-400 mt-1">{kpi.subtitle}</p>
                  )}
                  {kpi.trend != null && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <div
                        className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          kpi.trend >= 0
                            ? "text-emerald-600 bg-emerald-50"
                            : "text-red-600 bg-red-50"
                        }`}
                      >
                        {kpi.trend >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {kpi.trend >= 0 ? "+" : ""}{kpi.trend.toFixed(1)}%
                      </div>
                      <span className="text-[11px] text-slate-400">{kpi.trendLabel}</span>
                    </div>
                  )}
                </div>
                <div className={`p-3 rounded-2xl ${kpi.iconBg} shrink-0 ml-3`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 2: Company + Monthly */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Company Breakdown */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-800">Por Empresa</CardTitle>
                <CardDescription className="text-slate-400">
                  {seriesLabel} por empresa/obra
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {companyChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(480, companyChart.length * 44)}>
                <BarChart
                  data={companyChart}
                  layout="vertical"
                  margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={formatCompactCurrency}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [formatCurrency(Number(value)), seriesLabel]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  >
                    {companyChart.map((entry, idx) => (
                      <Cell key={idx} fill={barColorFn(idx)} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: unknown) => formatCurrency(Number(v))}
                      style={{ fontSize: 11, fill: "#475569", fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[480px] text-slate-400 text-sm">
                Sem dados para o periodo selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly/Annual Evolution */}
        <Card className="border-0 shadow-sm lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-800">
                  {chartView === "mensal" ? "Evolucao Mensal" : "Evolucao Anual"}
                  {(selectedCompanies.size !== defaultCompanies().size || [...selectedCompanies].some(n => isExcludedCompany(n)) || selectedMonths.size > 0 || selectedDays.size > 0 || selectedDuePeriods.size > 0 || [...selectedDocTypes].some(t => isExcludedDocType(t)) || selectedDocTypes.size !== allDocTypes.filter(t => !isExcludedDocType(t)).length) && (
                    <span className="text-sm font-normal text-blue-500 ml-2">
                      (filtrado)
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {seriesLabel} por {chartView === "mensal" ? "mes" : "ano"}
                </CardDescription>
              </div>
              <Tabs value={chartView} onValueChange={v => setChartView(v as ChartView)}>
                <TabsList className="h-8">
                  <TabsTrigger value="mensal" className="text-xs px-3 h-7">Mensal</TabsTrigger>
                  <TabsTrigger value="anual" className="text-xs px-3 h-7">Anual</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={480}>
              <BarChart data={chartData} margin={{ top: 35, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatCompactCurrency}
                  width={80}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name={seriesLabel} fill={color} radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={(props: any) => {
                      const { x, y, width, value, index } = props;
                      if (!value || Number(value) <= 0) return null;
                      const item = chartData[index!];
                      const pct = item?.pct;
                      const cx = (x || 0) + (width || 0) / 2;
                      return (
                        <g>
                          <text x={cx} y={(y || 0) - 14} textAnchor="middle" fontSize={11} fill="#475569" fontWeight={600}>
                            {formatCompactCurrency(Number(value))}
                          </text>
                          {pct !== null && pct !== undefined && (
                            <text x={cx} y={(y || 0) - 2} textAnchor="middle" fontSize={9} fill={pct >= 0 ? "#dc2626" : "#16a34a"} fontWeight={500}>
                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                            </text>
                          )}
                        </g>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Table (CP - Contas em Atraso) */}
      {showOverdueTable && activeTab === "atrasadas" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-800">Detalhamento de Contas em Atraso</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  {overdueByCreditor.length} credores - {filteredAtrasadas.length} parcelas em atraso
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowOverdueTable(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-10" />
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700"
                      onClick={() => setOverdueSort(s => ({ field: "creditorName", dir: s.field === "creditorName" && s.dir === "asc" ? "desc" : "asc" }))}
                    >
                      <div className="flex items-center gap-1">
                        Credor
                        {overdueSort.field === "creditorName" ? (overdueSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700 text-center"
                      onClick={() => setOverdueSort(s => ({ field: "installments", dir: s.field === "installments" && s.dir === "desc" ? "asc" : "desc" }))}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Parcelas
                        {overdueSort.field === "installments" ? (overdueSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700 text-center"
                      onClick={() => setOverdueSort(s => ({ field: "maxDaysOverdue", dir: s.field === "maxDaysOverdue" && s.dir === "desc" ? "asc" : "desc" }))}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Maior Atraso
                        {overdueSort.field === "maxDaysOverdue" ? (overdueSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700"
                      onClick={() => setOverdueSort(s => ({ field: "companies", dir: s.field === "companies" && s.dir === "asc" ? "desc" : "asc" }))}
                    >
                      <div className="flex items-center gap-1">
                        Empresas
                        {overdueSort.field === "companies" ? (overdueSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700 text-right"
                      onClick={() => setOverdueSort(s => ({ field: "totalOverdue", dir: s.field === "totalOverdue" && s.dir === "desc" ? "asc" : "desc" }))}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Total em Atraso
                        {overdueSort.field === "totalOverdue" ? (overdueSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueByCreditor.map((creditor) => {
                    const isExpanded = expandedCreditors.has(creditor.creditorName);
                    return (
                      <React.Fragment key={creditor.creditorName}>
                        <TableRow
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => {
                            setExpandedCreditors(prev => {
                              const next = new Set(prev);
                              if (next.has(creditor.creditorName)) next.delete(creditor.creditorName);
                              else next.add(creditor.creditorName);
                              return next;
                            });
                          }}
                        >
                          <TableCell className="w-10 pl-4">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </TableCell>
                          <TableCell className="font-medium text-slate-800">
                            {creditor.creditorName}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-red-50 text-red-700 font-semibold">
                              {creditor.installments}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive" className="font-semibold">
                              {creditor.maxDaysOverdue} dias
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {creditor.companies.map(c => (
                                <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{c}</span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-red-600 tabular-nums">
                            {formatCurrency(creditor.totalOverdue)}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-slate-50/50">
                            <TableCell colSpan={6} className="p-0">
                              <div className="px-8 py-3">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-slate-400 uppercase tracking-wider">
                                      <th className="text-left py-2 font-semibold">Titulo</th>
                                      <th className="text-left py-2 font-semibold">Documento</th>
                                      <th className="text-left py-2 font-semibold">Vencimento</th>
                                      <th className="text-center py-2 font-semibold">Dias Atraso</th>
                                      <th className="text-right py-2 font-semibold">Valor Original</th>
                                      <th className="text-right py-2 font-semibold">Saldo</th>
                                      <th className="text-left py-2 font-semibold">Empresa</th>
                                      <th className="text-left py-2 font-semibold">Projeto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {creditor.items
                                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                                      .map((item, idx) => (
                                        <tr key={`${item.billId}-${item.installmentId}-${idx}`} className="border-t border-slate-100">
                                          <td className="py-2 text-slate-600">{item.billId}/{item.installmentId}</td>
                                          <td className="py-2 text-slate-600">{item.documentNumber || "-"}</td>
                                          <td className="py-2 text-slate-600">{formatDate(item.dueDate)}</td>
                                          <td className="py-2 text-center">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                              daysDiff(item.dueDate) > 90 ? "bg-red-100 text-red-700" :
                                              daysDiff(item.dueDate) > 30 ? "bg-orange-100 text-orange-700" :
                                              "bg-yellow-100 text-yellow-700"
                                            }`}>
                                              {daysDiff(item.dueDate)}d
                                            </span>
                                          </td>
                                          <td className="py-2 text-right tabular-nums text-slate-600">{formatCurrency(item.originalAmount)}</td>
                                          <td className="py-2 text-right tabular-nums font-semibold text-red-600">{formatCurrency(effectiveAmount(item))}</td>
                                          <td className="py-2 text-slate-600 text-xs">{item.companyName}</td>
                                          <td className="py-2 text-slate-600 text-xs">{item.projectName}</td>
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
            {/* Footer totals */}
            <div className="flex items-center justify-between px-6 pt-4 mt-2 border-t border-slate-100">
              <div className="flex gap-6 text-sm text-slate-500">
                <span><strong className="text-slate-700">{overdueByCreditor.length}</strong> credores</span>
                <span><strong className="text-slate-700">{filteredAtrasadas.length}</strong> parcelas</span>
              </div>
              <div className="text-sm font-bold text-red-600">
                Total: {formatCurrency(filteredAtrasadas.reduce((s, i) => s + effectiveAmount(i), 0))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delinquent Table */}
      {showDelinquentTable && activeTab === "inadimplencia" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-800">Detalhamento de Inadimplencia</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  {delinquentsByClient.length} clientes inadimplentes - {filteredInadimplencia.length} parcelas em atraso
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowDelinquentTable(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-10" />
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700"
                      onClick={() => setDelinquentSort(s => ({ field: "clientName", dir: s.field === "clientName" && s.dir === "asc" ? "desc" : "asc" }))}
                    >
                      <div className="flex items-center gap-1">
                        Cliente
                        {delinquentSort.field === "clientName" ? (delinquentSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700 text-center"
                      onClick={() => setDelinquentSort(s => ({ field: "installments", dir: s.field === "installments" && s.dir === "desc" ? "asc" : "desc" }))}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Parcelas
                        {delinquentSort.field === "installments" ? (delinquentSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700 text-center"
                      onClick={() => setDelinquentSort(s => ({ field: "maxDaysOverdue", dir: s.field === "maxDaysOverdue" && s.dir === "desc" ? "asc" : "desc" }))}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Maior Atraso
                        {delinquentSort.field === "maxDaysOverdue" ? (delinquentSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700"
                      onClick={() => setDelinquentSort(s => ({ field: "projects", dir: s.field === "projects" && s.dir === "asc" ? "desc" : "asc" }))}
                    >
                      <div className="flex items-center gap-1">
                        Empreendimentos
                        {delinquentSort.field === "projects" ? (delinquentSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-slate-700 text-right"
                      onClick={() => setDelinquentSort(s => ({ field: "totalOverdue", dir: s.field === "totalOverdue" && s.dir === "desc" ? "asc" : "desc" }))}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Total Inadimplente
                        {delinquentSort.field === "totalOverdue" ? (delinquentSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delinquentsByClient.map((client) => {
                    const isExpanded = expandedClients.has(client.clientName);
                    return (
                      <React.Fragment key={client.clientName}>
                        <TableRow
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => {
                            setExpandedClients(prev => {
                              const next = new Set(prev);
                              if (next.has(client.clientName)) next.delete(client.clientName);
                              else next.add(client.clientName);
                              return next;
                            });
                          }}
                        >
                          <TableCell className="w-10 pl-4">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </TableCell>
                          <TableCell className="font-medium text-slate-800">
                            {client.clientName}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-semibold">
                              {client.installments}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive" className="font-semibold">
                              {client.maxDaysOverdue} dias
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {client.projects.map(p => (
                                <span key={p} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p}</span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-red-600 tabular-nums">
                            {formatCurrency(client.totalOverdue)}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-slate-50/50">
                            <TableCell colSpan={8} className="p-0">
                              <div className="px-8 py-3">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-slate-400 uppercase tracking-wider">
                                      <th className="text-left py-2 font-semibold">Titulo</th>
                                      <th className="text-left py-2 font-semibold">Documento</th>
                                      <th className="text-left py-2 font-semibold">Vencimento</th>
                                      <th className="text-center py-2 font-semibold">Dias Atraso</th>
                                      <th className="text-right py-2 font-semibold">Valor Original</th>
                                      <th className="text-right py-2 font-semibold">Saldo Atual</th>
                                      <th className="text-right py-2 font-semibold">Acréscimo</th>
                                      <th className="text-right py-2 font-semibold">Desconto</th>
                                      <th className="text-right py-2 font-semibold">Total</th>
                                      <th className="text-left py-2 font-semibold">Empresa</th>
                                      <th className="text-left py-2 font-semibold">Empreendimento</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {client.items
                                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                                      .map((item, idx) => (
                                        <tr key={`${item.billId}-${item.installmentId}-${idx}`} className="border-t border-slate-100">
                                          <td className="py-2 text-slate-600">{item.billId}/{item.installmentId}</td>
                                          <td className="py-2 text-slate-600">{item.documentNumber || "-"}</td>
                                          <td className="py-2 text-slate-600">{formatDate(item.dueDate)}</td>
                                          <td className="py-2 text-center">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                              daysDiff(item.dueDate) > 90 ? "bg-red-100 text-red-700" :
                                              daysDiff(item.dueDate) > 30 ? "bg-orange-100 text-orange-700" :
                                              "bg-yellow-100 text-yellow-700"
                                            }`}>
                                              {daysDiff(item.dueDate)}d
                                            </span>
                                          </td>
                                          <td className="py-2 text-right tabular-nums text-slate-600">{formatCurrency(item.originalAmount)}</td>
                                          <td className="py-2 text-right tabular-nums text-slate-800">{formatCurrency(item.correctedBalanceAmount)}</td>
                                          <td className="py-2 text-right tabular-nums text-red-600">{formatCurrency(calcEncargos(item))}</td>
                                          <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(item.discountAmount || 0)}</td>
                                          <td className="py-2 text-right tabular-nums font-semibold text-red-600">{formatCurrency(item.correctedBalanceAmount + calcEncargos(item))}</td>
                                          <td className="py-2 text-slate-600 text-xs">{item.companyName}</td>
                                          <td className="py-2 text-slate-600 text-xs">{item.projectName}</td>
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
            {/* Footer totals */}
            <div className="flex items-center justify-between px-6 pt-4 mt-2 border-t border-slate-100">
              <div className="flex gap-6 text-sm text-slate-500">
                <span><strong className="text-slate-700">{delinquentsByClient.length}</strong> clientes</span>
                <span><strong className="text-slate-700">{filteredInadimplencia.length}</strong> parcelas</span>
              </div>
              <div className="text-sm font-bold text-red-600">
                Total: {formatCurrency(filteredInadimplencia.reduce((s, i) => s + i.correctedBalanceAmount + calcEncargos(i), 0))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </>)}

      {/* DRE Tab */}
      {activeTab === "dre" && (
        <DreTab
          outcomeItems={consistentItems}
          incomeItems={consistentIncome}
          bankFees={allBankMovements}
          selectedYears={selectedYears}
          selectedMonths={selectedMonths}
          selectedCompanies={selectedCompanies}
        />
      )}

    </div>
  );
}
