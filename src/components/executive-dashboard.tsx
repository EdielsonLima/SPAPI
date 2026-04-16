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
  Handshake,
  LayoutGrid,
  Landmark,
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
  AreaChart,
  Area,
  ComposedChart,
  Line,
} from "recharts";
import { SiengeOutcome, SiengeBankMovement, SiengeIncome, SiengeSalesContract } from "@/types/sienge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency, formatCompactCurrency, formatDate, MONTH_LABELS } from "@/lib/dashboard-utils";
import { generateContasPagarPDF } from "@/lib/pdf-contas-pagar";
import { DreTab } from "@/components/dre-tab";

type Section = "cp" | "cr";
type MainTab = "visao-geral" | "a-pagar" | "pagas" | "atrasadas" | "a-receber" | "recebidas" | "inadimplencia" | "orcamento" | "comercial" | "dre" | "saldos" | "resumo";

// Each tab group has its own saved company filter
function getTabGroup(tab: MainTab): string {
  switch (tab) {
    case "a-pagar": case "pagas": case "atrasadas": return "cp";
    case "a-receber": case "recebidas": case "inadimplencia": return "cr";
    case "visao-geral": return "visao-geral";
    case "resumo": return "resumo";
    default: return tab;
  }
}
function companyStorageKey(tab: MainTab): string {
  return `dashboard_companies_${getTabGroup(tab)}`;
}
type ChartView = "mensal" | "anual" | "diario";

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
  subtitleFn,
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
  subtitleFn?: (value: string) => string;
  onSaveDefault?: () => void;
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
          <span className={`font-semibold tabular-nums ${pct >= 0 ? "text-red-500 dark:text-red-300/70" : "text-emerald-500 dark:text-emerald-400"}`}>
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
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard_default_years");
      if (saved) return new Set(JSON.parse(saved));
    }
    const years: string[] = [];
    for (let y = currentYear - 10; y <= currentYear; y++) years.push(String(y));
    return new Set(years);
  });
  const [selectedDuePeriods, setSelectedDuePeriods] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<MainTab>("visao-geral");
  const [items, setItems] = useState<SiengeOutcome[]>([]);
  const [incomeItems, setIncomeItems] = useState<SiengeIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedCp, setLastUpdatedCp] = useState<string | null>(null);
  const [lastUpdatedCr, setLastUpdatedCr] = useState<string | null>(null);
  const [salesContracts, setSalesContracts] = useState<SiengeSalesContract[]>([]);
  const [apiUnits, setApiUnits] = useState<{ enterpriseName: string; companyName: string; name: string; propertyType: string; commercialStock: string; floor: string; contractNumber: string; privateArea: number }[]>([]);
  const [cubData, setCubData] = useState<{ currentValue: number; currentMonth: string; monthlyVariation: number; yearlyAccumulated: number } | null>(null);
  const [companySettings, setCompanySettings] = useState<{ companyId: number; companyName: string; areaM2: number; factor: number; status: string }[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  // Per-tab company filter: save/restore when switching tabs
  const perTabCompanies = useRef<Record<string, Set<string>>>({});
  const switchTab = useCallback((newTab: MainTab) => {
    // Save current tab's companies
    perTabCompanies.current[getTabGroup(activeTab)] = new Set(selectedCompanies);
    // Load new tab's companies
    const saved = perTabCompanies.current[getTabGroup(newTab)];
    if (saved) {
      setSelectedCompanies(saved);
    } else {
      // Try localStorage
      const lsKey = companyStorageKey(newTab);
      const ls = typeof window !== "undefined" ? localStorage.getItem(lsKey) : null;
      if (ls) {
        setSelectedCompanies(new Set(JSON.parse(ls)));
      } else {
        // Fall back to default (no filter)
        setSelectedCompanies(new Set());
      }
    }
    setActiveTab(newTab);
  }, [activeTab, selectedCompanies]);
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [chartView, setChartView] = useState<ChartView>("mensal");
  const [showDelinquentTable, setShowDelinquentTable] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [delinquentSort, setDelinquentSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "totalOverdue", dir: "desc" });
  const [showOverdueTable, setShowOverdueTable] = useState(false);
  const [expandedCreditors, setExpandedCreditors] = useState<Set<string>>(new Set());
  const [expandedComercial, setExpandedComercial] = useState<Set<string>>(new Set());
  const [comercialSort, setComercialSort] = useState<{ field: "name" | "contracts" | "totalValue" | "ticket" | "pct"; dir: "asc" | "desc" }>({ field: "totalValue", dir: "desc" });
  const [comercialSubTab, setComercialSubTab] = useState<"vendas" | "unidades" | "quadro">("vendas");
  const [selectedUnitStatuses, setSelectedUnitStatuses] = useState<Set<string>>(new Set());
  const [selectedUnitEnterprises, setSelectedUnitEnterprises] = useState<Set<string>>(new Set());
  const [selectedUnitTypes, setSelectedUnitTypes] = useState<Set<string>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedUnitCustomers, setSelectedUnitCustomers] = useState<Set<string>>(new Set());
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
  const [allBankMovementsFull, setAllBankMovementsFull] = useState<SiengeBankMovement[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ bankAccountId: number; bankAccountDescription: string; bankCode: string; bankName: string; agencyNumber: string; accountNumber: string; companyId: number; companyName: string; currentBalance: number; isInDimBanco?: boolean }[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
  const [expandedBankCompanies, setExpandedBankCompanies] = useState<Set<string>>(new Set());
  const [selectedBankAccounts, setSelectedBankAccounts] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard_saldos_accounts");
      if (saved) return new Set(JSON.parse(saved));
    }
    return new Set<string>(); // empty = all selected (will be initialized after fetch)
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bankAccountsInitialized, setBankAccountsInitialized] = useState(false);
  const [dailyBalances, setDailyBalances] = useState<Record<string, { accountId: string; amount: number }[]> | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [saldosMonth, setSaldosMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [saldosCompareMonth, setSaldosCompareMonth] = useState<string | null>(null);
  const [compareBalances, setCompareBalances] = useState<Record<string, { accountId: string; amount: number }[]> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [fluxoPeriodo, setFluxoPeriodo] = useState(30);
  const [resumoSort, setResumoSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "totalRecebido", dir: "desc" });
  const [resumoTipoOp, setResumoTipoOp] = useState<Set<string>>(new Set());
  const [resumoTipoOpInit, setResumoTipoOpInit] = useState(false);
  const [resumoTipoOpRec, setResumoTipoOpRec] = useState<Set<string>>(new Set());
  const [resumoTipoOpRecInit, setResumoTipoOpRecInit] = useState(false);
  const [fluxoView, setFluxoView] = useState<"projetado" | "entradas-saidas">("projetado");
  const [exclusionSet, setExclusionSet] = useState<Set<string>>(new Set());


  const availableYears = useMemo(() => {
    const arr: string[] = [];
    if (activeTab === "pagas" || activeTab === "atrasadas" || activeTab === "recebidas" || activeTab === "inadimplencia" || activeTab === "dre" || activeTab === "comercial" || activeTab === "resumo") {
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
      // Sales contracts fetch runs independently — never blocks main data
      fetch(`/api/sienge/sales-contracts${refreshParam ? "?forceRefresh=true" : ""}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setSalesContracts(data.data || []); })
        .catch(() => {});

      // Units fetch runs independently — real unit data from Sienge
      fetch(`/api/sienge/units${refreshParam ? "?forceRefresh=true" : ""}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setApiUnits(data.data || []); })
        .catch(() => {});

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

      // Fetch ALL bank movements (including linked to outcomes/incomes) for DRE Level 3 enrichment
      fetch(`/api/sienge/bank-movements?startDate=${startDate}&endDate=${endDate}&detachedOnly=N${refreshParam}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setAllBankMovementsFull(data.data || []); })
        .catch(() => {});

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

  // Fetch bank accounts when saldos tab is active
  const bankAccountsLoaded = useRef(false);
  useEffect(() => {
    if ((activeTab !== "saldos" && activeTab !== "visao-geral") || bankAccountsLoaded.current) return;
    bankAccountsLoaded.current = true;
    setLoadingBankAccounts(true);
    fetch("/api/sienge/bank-accounts")
      .then(res => res.json())
      .then(json => {
        if (json.data && json.data.length > 0) {
          setBankAccounts(json.data);
          // Initialize selected accounts if not saved before
          const saved = localStorage.getItem("dashboard_saldos_accounts");
          if (!saved) {
            // Default: select only accounts that are in DimBanco (valid accounts)
            const validNums = new Set<string>(
              json.data
                .filter((a: { isInDimBanco?: boolean }) => a.isInDimBanco)
                .map((a: { bankAccountId: string }) => String(a.bankAccountId))
            );
            setSelectedBankAccounts(validNums);
            // Auto-save so it persists
            localStorage.setItem("dashboard_saldos_accounts", JSON.stringify(Array.from(validNums)));
          }
          setBankAccountsInitialized(true);
        } else if (json.error) {
          console.error("Bank accounts API error:", json.error, json.details);
          toast.error("Erro na API de saldos: " + (json.details || json.error));
          bankAccountsLoaded.current = false; // allow retry
        }
      })
      .catch((err) => {
        toast.error("Erro ao carregar saldos bancarios");
        console.error(err);
        bankAccountsLoaded.current = false;
      })
      .finally(() => setLoadingBankAccounts(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Fetch daily balances for chart (re-fetches when month changes)
  useEffect(() => {
    if (activeTab !== "saldos") return;
    setLoadingDaily(true);
    setDailyBalances(null);
    fetch(`/api/sienge/bank-accounts?daily=true&month=${saldosMonth === "last7" ? "last7" : saldosMonth}`)
      .then(res => res.json())
      .then(json => {
        if (json.dailyBalances) setDailyBalances(json.dailyBalances);
      })
      .catch(() => {})
      .finally(() => setLoadingDaily(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, saldosMonth]);

  // Fetch compare month data
  useEffect(() => {
    if (!saldosCompareMonth || activeTab !== "saldos") {
      setCompareBalances(null);
      return;
    }
    setLoadingCompare(true);
    fetch(`/api/sienge/bank-accounts?daily=true&month=${saldosCompareMonth}`)
      .then(res => res.json())
      .then(json => { if (json.dailyBalances) setCompareBalances(json.dailyBalances); })
      .catch(() => {})
      .finally(() => setLoadingCompare(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldosCompareMonth, activeTab]);

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
      // Try per-tab key first, then legacy global key
      const perTabKey = companyStorageKey(activeTab);
      const saved = localStorage.getItem(perTabKey) || localStorage.getItem("dashboard_default_companies");
      if (saved) {
        const savedSet = new Set<string>(JSON.parse(saved));
        const valid = new Set([...savedSet].filter(c => allCompanyNames.includes(c)));
        if (valid.size > 0) {
          setSelectedCompanies(valid);
          perTabCompanies.current[getTabGroup(activeTab)] = valid;
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
  // ▼▼▼ VALIDATED 2026-04-02 — Budget vs Realizado — DO NOT MODIFY without explicit user request ▼▼▼
  // Realizado = sum of netAmount for ALL non-previsão payments (all years)
  // netAmount from API = Valor baixa - Desconto (líquido, without subtracting tax)
  // Must match "Contas Pagas" page with Ano=Todos for each company
  // Orçado = areaM2 * factor * cubValue
  // NOTE: No year filter — budget sums ALL payments regardless of selectedYears
  const budgetData = useMemo(() => {
    if (!cubData || companySettings.length === 0) return [];
    const cubValue = cubData.currentValue;

    return companySettings.filter(cs => selectedCompanies.size === 0 || selectedCompanies.has(cs.companyName)).map(cs => {
      const budget = cs.areaM2 * cs.factor * cubValue;

      // Sum ALL payments for this company using valor líquido (netAmount)
      // Same logic as contas-table paidTotal: filter netAmount > 0, sum netAmount
      // Always excludes previsão documents (hardcoded, not dependent on filter state)
      // No year filter: budget represents total cost to date (matches Contas Pagas with Ano=Todos)
      let realized = 0;
      consistentItems.forEach(item => {
        if (item.companyName !== cs.companyName) return;
        const docName = (item.documentIdentificationName || "").toUpperCase();
        if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) return;
        (item.payments || []).forEach(p => {
          if (p.netAmount !== 0 && p.paymentDate) {
            realized += p.netAmount;
          }
        });
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
  }, [cubData, companySettings, consistentItems, selectedCompanies]);
  // ▲▲▲ END VALIDATED — Budget vs Realizado ▲▲▲

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

  // Daily chart: requires exactly 1 year + 1 month selected. Groups by day-of-month (01-NN).
  function buildDailyChart(filteredItems: (SiengeOutcome | SiengeIncome)[], field: "balance" | "paid" | "received"): { month: string; value: number }[] {
    if (selectedYears.size !== 1 || selectedMonths.size !== 1) return [];
    const yearStr = [...selectedYears][0];
    const monthStr = [...selectedMonths][0]; // "01".."12"
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const dayTotals = new Map<number, number>();

    if (field === "paid") {
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
            p.paymentDate && p.paymentDate.startsWith(`${yearStr}-${monthStr}`)
          )
          .forEach(p => {
            const d = Number(p.paymentDate.substring(8, 10));
            dayTotals.set(d, (dayTotals.get(d) || 0) + p.netAmount);
          });
      });
      filteredBankFees.forEach(bm => {
        if (bm.bankMovementDate && bm.bankMovementDate.startsWith(`${yearStr}-${monthStr}`)) {
          const d = Number(bm.bankMovementDate.substring(8, 10));
          dayTotals.set(d, (dayTotals.get(d) || 0) + Math.abs(bm.bankMovementAmount));
        }
      });
    } else if (field === "received") {
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            p.netAmount > 0 &&
            p.paymentDate && p.paymentDate.startsWith(`${yearStr}-${monthStr}`)
          )
          .forEach(p => {
            const d = Number(p.paymentDate.substring(8, 10));
            dayTotals.set(d, (dayTotals.get(d) || 0) + p.netAmount);
          });
      });
    } else {
      filteredItems.forEach(i => {
        if (i.dueDate && i.dueDate.startsWith(`${yearStr}-${monthStr}`)) {
          const d = Number(i.dueDate.substring(8, 10));
          dayTotals.set(d, (dayTotals.get(d) || 0) + effectiveAmount(i));
        }
      });
    }

    const out: { month: string; value: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ month: String(d).padStart(2, "0"), value: dayTotals.get(d) || 0 });
    }
    return out;
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
        daily: buildDailyChart(filteredAPagar, "balance"),
        color: "hsl(217, 91%, 60%)",
        label: "A Pagar",
      };
    } else if (activeTab === "pagas") {
      return {
        companyChart: buildCompanyChart(filteredPagas, "paid"),
        monthly: buildMonthlyChart(filteredPagas, "paid"),
        annual: buildAnnualChart(filteredPagas, "paid"),
        daily: buildDailyChart(filteredPagas, "paid"),
        color: "hsl(160, 60%, 45%)",
        label: "Pago",
      };
    } else if (activeTab === "atrasadas") {
      return {
        companyChart: buildCompanyChart(filteredAtrasadas, "balance"),
        monthly: buildMonthlyChart(filteredAtrasadas, "balance"),
        annual: buildAnnualChart(filteredAtrasadas, "balance"),
        daily: buildDailyChart(filteredAtrasadas, "balance"),
        color: "hsl(0, 84%, 68%)",
        label: "Atrasado",
      };
    } else if (activeTab === "a-receber") {
      return {
        companyChart: buildCompanyChart(filteredAReceber, "balance"),
        monthly: buildMonthlyChart(filteredAReceber, "balance", true),
        annual: buildAnnualChart(filteredAReceber, "balance"),
        daily: buildDailyChart(filteredAReceber, "balance"),
        color: "hsl(142, 71%, 45%)",
        label: "A Receber",
      };
    } else if (activeTab === "recebidas") {
      return {
        companyChart: buildCompanyChart(filteredRecebidas, "received"),
        monthly: buildMonthlyChart(filteredRecebidas, "received"),
        annual: buildAnnualChart(filteredRecebidas, "received"),
        daily: buildDailyChart(filteredRecebidas, "received"),
        color: "hsl(199, 89%, 48%)",
        label: "Recebido",
      };
    } else {
      // inadimplencia
      return {
        companyChart: buildCompanyChart(filteredInadimplencia, "balance"),
        monthly: buildMonthlyChart(filteredInadimplencia, "balance"),
        annual: buildAnnualChart(filteredInadimplencia, "balance"),
        daily: buildDailyChart(filteredInadimplencia, "balance"),
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
        icon: <AlertTriangle className="h-7 w-7 text-red-500 dark:text-red-300/70" />,
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
        icon: <AlertTriangle className="h-7 w-7 text-red-500 dark:text-red-300/70" />,
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
        icon: <Users className="h-7 w-7 text-red-500 dark:text-red-300/70" />,
        iconBg: "bg-red-50",
        gradient: "from-red-500 to-red-600",
        onClick: () => { setShowDelinquentTable(v => !v); setExpandedClients(new Set()); },
      },
    ],
    orcamento: [],
    comercial: [],
    dre: [],
    saldos: [],
    "visao-geral": [],
    resumo: [],
  };

  const kpis = kpiConfigs[activeTab];
  const { companyChart, monthly, annual, daily, color, label: seriesLabel } = tabData;
  const chartDataRaw = chartView === "anual" ? annual : chartView === "diario" ? daily : monthly;
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

      {/* Section Toggle (CP / CR) + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Section Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => switchTab("visao-geral")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "visao-geral"
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-md ring-2 ring-slate-300 dark:ring-slate-500"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Geral
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("a-pagar");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                section === "cp" && !["orcamento", "comercial", "dre", "saldos", "visao-geral"].includes(activeTab)
                  ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-md ring-2 ring-red-300 dark:ring-red-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              CP
            </button>
            <button
              onClick={() => {
                setSection("cr");
                switchTab("a-receber");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                section === "cr" && ["a-receber", "recebidas", "inadimplencia"].includes(activeTab)
                  ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-md ring-2 ring-emerald-300 dark:ring-emerald-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" />
              CR
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("orcamento");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "orcamento"
                  ? "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-md ring-2 ring-purple-300 dark:ring-purple-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Ruler className="h-3.5 w-3.5" />
              Orçamento
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("comercial");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "comercial"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md ring-2 ring-indigo-300 dark:ring-indigo-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Handshake className="h-3.5 w-3.5" />
              Comercial
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("dre");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "dre"
                  ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-md ring-2 ring-teal-300 dark:ring-teal-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              DRE
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("saldos");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "saldos"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md ring-2 ring-indigo-300 dark:ring-indigo-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Landmark className="h-3.5 w-3.5" />
              Saldos
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("resumo");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "resumo"
                  ? "bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-md ring-2 ring-cyan-300 dark:ring-cyan-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Resumo
            </button>
          </div>
        </div>

        {/* Sub-tabs CP/CR - separate line */}
        {activeTab !== "visao-geral" && activeTab !== "orcamento" && activeTab !== "comercial" && activeTab !== "dre" && activeTab !== "saldos" && activeTab !== "resumo" && (
          <Tabs value={activeTab} onValueChange={v => {
            const tab = v as MainTab;
            switchTab(tab);
            setSelectedMonths(new Set());
            setSelectedDays(new Set());
            setSelectedDuePeriods(new Set());
          }} className="basis-full">
            <TabsList className="h-12 bg-transparent p-0 gap-1 border-b border-slate-200 dark:border-slate-700 w-full justify-start">
              {section === "cp" ? (
                <>
                  <TabsTrigger value="a-pagar" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${activeTab === "a-pagar" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <Clock className="h-4 w-4" />
                    Contas a Pagar
                  </TabsTrigger>
                  <TabsTrigger value="pagas" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${activeTab === "pagas" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <CheckCircle className="h-4 w-4" />
                    Contas Pagas
                  </TabsTrigger>
                  <TabsTrigger value="atrasadas" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${activeTab === "atrasadas" ? "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300/80 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
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
                  <TabsTrigger value="a-receber" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${activeTab === "a-receber" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <Banknote className="h-4 w-4" />
                    Contas a Receber
                  </TabsTrigger>
                  <TabsTrigger value="recebidas" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${activeTab === "recebidas" ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <CheckCircle className="h-4 w-4" />
                    Contas Recebidas
                  </TabsTrigger>
                  <TabsTrigger value="inadimplencia" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${activeTab === "inadimplencia" ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <AlertTriangle className="h-4 w-4" />
                    Inadimplência
                    {itemsInadimplencia.length > 0 && (
                      <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                        {itemsInadimplencia.length}
                      </span>
                    )}
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </Tabs>
        )}

        {/* Filters */}
        {activeTab === "orcamento" && <div className="flex items-center gap-2">
          <MultiSelectFilter
            label="Empresas"
            icon={<Building2 className="h-4 w-4" />}
            allOptions={allCompanyNames}
            selected={selectedCompanies}
            onToggle={(name) => toggleInSet(setSelectedCompanies, name)}
            onSelectAll={() => setSelectedCompanies(new Set(allCompanyNames))}
            onClear={() => setSelectedCompanies(new Set())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem(companyStorageKey(activeTab), JSON.stringify([...selectedCompanies]));
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
            onClear={() => setSelectedCompanies(new Set())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem(companyStorageKey(activeTab), JSON.stringify([...selectedCompanies]));
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
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_years", JSON.stringify([...selectedYears]));
              toast.success("Padrão de anos salvo!");
            }}
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
        {activeTab === "comercial" && <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Empresas"
            icon={<Building2 className="h-4 w-4" />}
            allOptions={allCompanyNames}
            selected={selectedCompanies}
            onToggle={(name) => toggleInSet(setSelectedCompanies, name)}
            onSelectAll={() => setSelectedCompanies(new Set(allCompanyNames))}
            onClear={() => setSelectedCompanies(new Set())}
            activeColor="indigo"
            onSaveDefault={() => {
              localStorage.setItem(companyStorageKey(activeTab), JSON.stringify([...selectedCompanies]));
              toast.success("Padrão de empresas salvo!");
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
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_years", JSON.stringify([...selectedYears]));
              toast.success("Padrão de anos salvo!");
            }}
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
        {activeTab !== "orcamento" && activeTab !== "comercial" && activeTab !== "dre" && <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Empresas"
            icon={<Building2 className="h-4 w-4" />}
            allOptions={allCompanyNames}
            selected={selectedCompanies}
            onToggle={(name) => toggleInSet(setSelectedCompanies, name)}
            onSelectAll={() => setSelectedCompanies(new Set(allCompanyNames))}
            onClear={() => setSelectedCompanies(new Set())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem(companyStorageKey(activeTab), JSON.stringify([...selectedCompanies]));
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
            onClear={() => setSelectedYears(new Set())}
            activeColor="blue"
            onSaveDefault={() => {
              localStorage.setItem("dashboard_default_years", JSON.stringify([...selectedYears]));
              toast.success("Padrão de anos salvo!");
            }}
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
              const savedCo = localStorage.getItem(companyStorageKey(activeTab)) || localStorage.getItem("dashboard_default_companies");
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">CUB SC (Mês Atual)</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(cubData.currentValue)}</p>
                </div>
                <div className="p-3 bg-slate-700/50 rounded-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-blue-500/10" />
                  <Building2 className="h-5 w-5 text-blue-400 relative z-10" />
                </div>
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Variação no Mês</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold text-white tabular-nums">{Math.abs(cubData.monthlyVariation).toFixed(2)}%</p>
                    <div className={`flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                      cubData.monthlyVariation > 0 ? "bg-emerald-500/20 text-emerald-400" :
                      cubData.monthlyVariation < 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-slate-300"
                    }`}>
                      {cubData.monthlyVariation > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> :
                       cubData.monthlyVariation < 0 ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
                      {cubData.monthlyVariation > 0 ? "ALTA" : cubData.monthlyVariation < 0 ? "BAIXA" : "NEUTRO"}
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-slate-700/50 rounded-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500/10" />
                  <BarChart3 className="h-5 w-5 text-emerald-400 relative z-10" />
                </div>
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-sm rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Variação Ano ({currentYear})</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold text-white tabular-nums">{Math.abs(cubData.yearlyAccumulated).toFixed(2)}%</p>
                    <div className={`flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                      cubData.yearlyAccumulated > 0 ? "bg-emerald-500/20 text-emerald-400" :
                      cubData.yearlyAccumulated < 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-slate-300"
                    }`}>
                      {cubData.yearlyAccumulated > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> :
                       cubData.yearlyAccumulated < 0 ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
                      {cubData.yearlyAccumulated > 0 ? "ALTA" : cubData.yearlyAccumulated < 0 ? "BAIXA" : "NEUTRO"}
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-slate-700/50 rounded-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-violet-500/10" />
                  <TrendingUp className="h-5 w-5 text-violet-400 relative z-10" />
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="border border-blue-100 bg-gradient-to-b from-blue-50 to-white shadow-[0_8px_30px_rgb(59,130,246,0.06)] rounded-2xl overflow-hidden relative group hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)] transition-all duration-300">
              <CardContent className="pt-6 pb-6 px-7">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-blue-600/80 uppercase tracking-widest">Orçamento Total</p>
                    <p className="text-3xl font-black text-blue-950 mt-2 tabular-nums tracking-tight">{formatCurrency(budgetTotals.totalBudget)}</p>
                  </div>
                  <div className="p-3 bg-white shadow-sm ring-1 ring-blue-100 rounded-xl">
                    <Banknote className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-emerald-100 bg-gradient-to-b from-emerald-50 to-white shadow-[0_8px_30px_rgb(16,185,129,0.06)] rounded-2xl overflow-hidden relative group hover:shadow-[0_8px_30px_rgb(16,185,129,0.12)] transition-all duration-300">
              <CardContent className="pt-6 pb-6 px-7">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-emerald-600/80 uppercase tracking-widest">Custo Realizado</p>
                    <p className="text-3xl font-black text-emerald-950 mt-2 tabular-nums tracking-tight">{formatCurrency(budgetTotals.totalRealized)}</p>
                  </div>
                  <div className="p-3 bg-white shadow-sm ring-1 ring-emerald-100 rounded-xl">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-amber-100 bg-gradient-to-b from-amber-50 to-white shadow-[0_8px_30px_rgb(245,158,11,0.06)] rounded-2xl overflow-hidden relative group hover:shadow-[0_8px_30px_rgb(245,158,11,0.12)] transition-all duration-300">
              <CardContent className="pt-6 pb-5 px-7">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-600/80 uppercase tracking-widest">Saldo a Realizar</p>
                    <p className="text-3xl font-black text-amber-950 mt-2 tabular-nums tracking-tight">{formatCurrency(budgetTotals.totalToRealize)}</p>
                    <p className="text-[11px] font-medium text-amber-900/40 mt-1.5 leading-tight max-w-[220px]">
                      Não contabiliza obras finalizadas nem saldos negativos
                    </p>
                  </div>
                  <div className="p-3 bg-white shadow-sm ring-1 ring-amber-100 rounded-xl">
                    <Clock className="h-6 w-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Budget Table */}
          <Card className="border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl overflow-hidden mt-2">
            <CardContent className="p-0">
              {budgetData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Ruler className="h-12 w-12 mb-3 text-slate-300" />
                  <p className="text-sm font-medium">Nenhum empreendimento configurado</p>
                  <p className="text-xs mt-1">Configure os empreendimentos em Configuracoes → Empreendimentos</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/60">
                        <TableHead className="font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11 px-6">Empreendimento</TableHead>
                        <TableHead className="text-center font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11 w-20">Fator</TableHead>
                        <TableHead className="text-right font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11">Orçamento</TableHead>
                        <TableHead className="text-right font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11">Realizado</TableHead>
                        <TableHead className="text-right font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11">À Realizar</TableHead>
                        <TableHead className="text-center font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11 w-28">% Real</TableHead>
                        <TableHead className="text-center font-bold text-[11px] text-slate-400 uppercase tracking-widest h-11 w-32">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100/80">
                      {budgetData.map((row) => {
                        const isFinalizada = row.status === "Finalizada";
                        return (
                          <TableRow key={row.companyId} className={`transition-colors h-14 ${isFinalizada ? "bg-slate-50/50 hover:bg-slate-50" : "bg-white hover:bg-slate-50/80"}`}>
                            <TableCell className={`px-6 font-semibold text-[13px] ${isFinalizada ? "text-slate-400" : "text-slate-800"}`}>{row.companyName}</TableCell>
                            <TableCell className="text-center text-slate-400 text-[13px] font-medium">{row.factor.toFixed(2)}</TableCell>
                            <TableCell className={`text-right tabular-nums text-[13px] ${isFinalizada ? "text-slate-400 font-medium" : "text-slate-600 font-semibold"}`}>{formatCurrency(row.budget)}</TableCell>
                            <TableCell className={`text-right tabular-nums text-[13px] ${isFinalizada ? "text-slate-400 font-medium" : "text-slate-600 font-semibold"}`}>{formatCurrency(row.realized)}</TableCell>
                            <TableCell className={`text-right tabular-nums text-[13px] font-bold ${row.toRealize < 0 ? (isFinalizada ? "text-rose-400" : "text-rose-600") : (isFinalizada ? "text-slate-400" : "text-slate-800")}`}>
                              {row.toRealize < 0 && <TrendingDown className="inline h-3.5 w-3.5 mr-1" />}
                              {formatCurrency(row.toRealize)}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[12px] font-bold tabular-nums ${row.percentReal >= 100 ? "bg-amber-100/50 text-amber-700" : row.percentReal >= 70 ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"} ${isFinalizada ? "opacity-60 grayscale-[0.5]" : ""}`}>
                                {row.percentReal.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-center px-4">
                              {isFinalizada ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200/80">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  FINALIZADA
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  ATIVA
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
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

      {/* ══════ COMERCIAL TAB ══════ */}
      {activeTab === "comercial" && (() => {
        // ─── Unit type inference from name (must be before filtered) ───
        const inferUnitType = (name: string): string => {
          const n = name.toUpperCase().trim();
          if (/\bVG\b|VAGA|GARAGEM|^G[\s-]?\d/i.test(n)) {
            if (/DUPLA|DBL|2V/i.test(n)) return "Vaga Dupla";
            if (/TRIPLA|TPL|3V/i.test(n)) return "Vaga Tripla";
            if (/PNE|DEFICIENTE|ACESS/i.test(n)) return "Vaga PNE";
            return "Vaga Simples";
          }
          if (/\bSL\b|\bSALA\b|COMERCIAL/i.test(n)) return "Sala Comercial";
          if (/\bLJ\b|\bLOJA\b/i.test(n)) return "Loja";
          if (/\bCASA\b/i.test(n)) return "Casa";
          if (/\bCOB\b|COBERTURA/i.test(n)) return "Cobertura";
          if (/\bGARDEN\b|\bJARDIM\b/i.test(n)) return "Garden";
          if (/\bDEP\b|DEPOSITO|\bBOX\b/i.test(n)) return "Depósito";
          return "Apartamento";
        };

        // Filter contracts by company, year, month, enterprise, customer
        const filtered = salesContracts.filter(c => {
          if (selectedCompanies.size > 0 && !selectedCompanies.has(c.companyName)) return false;
          if (selectedYears.size > 0 && c.contractDate) {
            if (!selectedYears.has(c.contractDate.substring(0, 4))) return false;
          }
          if (selectedMonths.size > 0 && c.contractDate) {
            if (!selectedMonths.has(c.contractDate.substring(5, 7))) return false;
          }
          if (selectedUnitEnterprises.size > 0) {
            if (!selectedUnitEnterprises.has(c.enterpriseName || c.companyName)) return false;
          }
          if (selectedUnitTypes.size > 0) {
            const unitNames = (c.salesContractUnits || []).map(u => u.name);
            const hasMatchingType = unitNames.some(name => selectedUnitTypes.has(inferUnitType(name)));
            if (!hasMatchingType) return false;
          }
          if (selectedUnitCustomers.size > 0) {
            const customerName = c.salesContractCustomers?.[0]?.name || "";
            if (!selectedUnitCustomers.has(customerName)) return false;
          }
          if (selectedUnitStatuses.size > 0) {
            const situation = c.cancellationDate ? "Cancelado" : c.situation || "Outro";
            if (!selectedUnitStatuses.has(situation)) return false;
          }
          return true;
        });
        // Options for Vendas filters (from all contracts respecting company filter)
        const baseContracts = salesContracts.filter(c => selectedCompanies.size === 0 || selectedCompanies.has(c.companyName));
        const allVendasEnterprises = Array.from(new Set(baseContracts.map(c => c.enterpriseName || c.companyName))).sort();
        const allVendasCustomers = Array.from(new Set(baseContracts.map(c => c.salesContractCustomers?.[0]?.name).filter(Boolean) as string[])).sort();
        const allVendasStatuses = Array.from(new Set(baseContracts.map(c => c.cancellationDate ? "Cancelado" : c.situation || "Outro"))).sort();

        const totalValue = filtered.reduce((s, c) => s + (c.value || 0), 0);
        const totalContracts = filtered.length;
        const ticketMedio = totalContracts > 0 ? totalValue / totalContracts : 0;
        const emitidos = filtered.filter(c => c.situation === "Emitido").length;
        const cancelados = filtered.filter(c => c.situation === "Cancelado" || c.cancellationDate).length;

        // Group by enterprise (use enterpriseName to match with units data)
        const byCompany = new Map<string, { contracts: typeof filtered; totalValue: number }>();
        filtered.forEach(c => {
          const key = c.enterpriseName || c.companyName;
          if (!byCompany.has(key)) byCompany.set(key, { contracts: [], totalValue: 0 });
          const entry = byCompany.get(key)!;
          entry.contracts.push(c);
          entry.totalValue += c.value || 0;
        });
        const companyRows = Array.from(byCompany.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => {
            const { field, dir } = comercialSort;
            let cmp = 0;
            switch (field) {
              case "name": cmp = a.name.localeCompare(b.name); break;
              case "contracts": cmp = a.contracts.length - b.contracts.length; break;
              case "totalValue": cmp = a.totalValue - b.totalValue; break;
              case "ticket": {
                const ta = a.contracts.length > 0 ? a.totalValue / a.contracts.length : 0;
                const tb = b.contracts.length > 0 ? b.totalValue / b.contracts.length : 0;
                cmp = ta - tb; break;
              }
              case "pct": cmp = a.totalValue - b.totalValue; break;
            }
            return dir === "asc" ? cmp : -cmp;
          });

        // Monthly chart data
        const monthlyMap = new Map<string, number>();
        filtered.forEach(c => {
          if (!c.contractDate) return;
          const key = c.contractDate.substring(0, 7); // YYYY-MM
          monthlyMap.set(key, (monthlyMap.get(key) || 0) + (c.value || 0));
        });
        const monthlyChart = Array.from(monthlyMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, value]) => {
            const [y, m] = month.split("-");
            return { month: `${MONTH_LABELS[parseInt(m, 10) - 1] || m}/${y.slice(2)}`, value };
          });

        // Yearly chart data
        const yearlyMap = new Map<string, number>();
        filtered.forEach(c => {
          if (!c.contractDate) return;
          const year = c.contractDate.substring(0, 4);
          yearlyMap.set(year, (yearlyMap.get(year) || 0) + (c.value || 0));
        });
        const yearlyChart = Array.from(yearlyMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, value]) => ({ month: year, value }));

        const rawChart = chartView === "anual" ? yearlyChart : monthlyChart;
        const comercialChart = rawChart.map((item, idx) => {
          const prev = idx > 0 ? rawChart[idx - 1].value : 0;
          const pct = prev > 0 ? ((item.value - prev) / prev) * 100 : null;
          return { ...item, pct };
        });

        // ─── Unit analysis: API units + sales contract enrichment ───
        type UnitRecord = { enterprise: string; unit: string; status: string; tipo: string; value: number; customer: string; contractDate: string; area: number };
        const unitMap = new Map<string, UnitRecord>();

        // 1. Seed from real Sienge /units API (source of truth for status)
        if (apiUnits.length > 0) {
          apiUnits.forEach(u => {
            // Filter by company if selected
            if (selectedCompanies.size > 0 && u.companyName && !selectedCompanies.has(u.companyName)) return;
            const key = `${u.enterpriseName}||${u.name}`;
            unitMap.set(key, {
              enterprise: u.enterpriseName,
              unit: u.name,
              status: u.commercialStock, // Already mapped: "Vendida", "Disponível", etc.
              tipo: u.propertyType || inferUnitType(u.name),
              value: 0,
              customer: "—",
              contractDate: "",
              area: u.privateArea || 0,
            });
          });
        }

        // 2. Overlay sales contract data (customer, value, contract date)
        const allContractsForUnits = salesContracts.filter(c => {
          if (selectedCompanies.size > 0 && !selectedCompanies.has(c.companyName)) return false;
          return true;
        });
        allContractsForUnits.forEach(c => {
          if (c.cancellationDate || c.situation === "Cancelado" || c.situation === "Distratado") return;
          (c.salesContractUnits || []).forEach(u => {
            const key = `${c.enterpriseName}||${u.name}`;
            const existing = unitMap.get(key);
            if (existing) {
              // Enrich existing API unit with contract data
              if (!existing.contractDate || c.contractDate > existing.contractDate) {
                existing.value = c.value || existing.value;
                existing.customer = c.salesContractCustomers?.[0]?.name || existing.customer;
                existing.contractDate = c.contractDate || existing.contractDate;
              }
            } else if (apiUnits.length === 0) {
              // Fallback: no API units loaded, use contract-based inference
              let status = "Vendida";
              if (c.situation === "Emitido") status = "Vendida";
              else status = c.situation || "Outro";
              unitMap.set(key, {
                enterprise: c.enterpriseName,
                unit: u.name,
                status,
                tipo: inferUnitType(u.name),
                value: c.value || 0,
                customer: c.salesContractCustomers?.[0]?.name || "—",
                contractDate: c.contractDate || "",
                area: 0,
              });
            }
          });
        });

        const allUnits = Array.from(unitMap.values());

        // Tipo Imóvel options for Vendas (cascaded by enterprise selection)
        const vendasUnitsForEnterprise = selectedUnitEnterprises.size === 0 ? allUnits : allUnits.filter(u => selectedUnitEnterprises.has(u.enterprise));
        const allVendasTypes = Array.from(new Set(vendasUnitsForEnterprise.map(u => u.tipo))).sort();

        return (
          <>
            {/* Modern Segmented Sub-tabs */}
            <div className="inline-flex items-center p-1 mb-6 bg-slate-100/80 rounded-xl border border-slate-200/50 w-full md:w-auto overflow-x-auto shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                className={`h-9 px-5 text-[13px] font-bold rounded-lg transition-all duration-200 ${comercialSubTab === "vendas" ? "bg-white text-indigo-700 shadow-[0_2px_8px_rgb(0,0,0,0.06)] border border-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                onClick={() => setComercialSubTab("vendas")}
              >
                <Handshake className={`h-4 w-4 mr-2 ${comercialSubTab === "vendas" ? "text-indigo-500" : "text-slate-400"}`} />
                Vendas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-9 px-5 text-[13px] font-bold rounded-lg transition-all duration-200 ml-1 ${comercialSubTab === "unidades" ? "bg-white text-emerald-700 shadow-[0_2px_8px_rgb(0,0,0,0.06)] border border-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                onClick={() => setComercialSubTab("unidades")}
              >
                <Building2 className={`h-4 w-4 mr-2 ${comercialSubTab === "unidades" ? "text-emerald-500" : "text-slate-400"}`} />
                Unidades
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-9 px-5 text-[13px] font-bold rounded-lg transition-all duration-200 ml-1 ${comercialSubTab === "quadro" ? "bg-white text-blue-700 shadow-[0_2px_8px_rgb(0,0,0,0.06)] border border-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                onClick={() => setComercialSubTab("quadro")}
              >
                <LayoutGrid className={`h-4 w-4 mr-2 ${comercialSubTab === "quadro" ? "text-blue-500" : "text-slate-400"}`} />
                Quadro Espelho
              </Button>
            </div>

            {/* ─── VENDAS SUB-TAB ─── */}
            {comercialSubTab === "vendas" && <>
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <MultiSelectFilter
                label="Empreendimento"
                icon={<Building2 className="h-4 w-4" />}
                allOptions={allVendasEnterprises}
                selected={selectedUnitEnterprises}
                onToggle={(name) => { setSelectedUnitEnterprises(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                onSelectAll={() => { setSelectedUnitEnterprises(new Set(allVendasEnterprises)); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                onClear={() => { setSelectedUnitEnterprises(new Set()); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                activeColor="indigo"
              />
              <MultiSelectFilter
                label="Tipo Imóvel"
                icon={<Ruler className="h-4 w-4" />}
                allOptions={allVendasTypes}
                selected={selectedUnitTypes}
                onToggle={(name) => { setSelectedUnitTypes(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); setSelectedUnits(new Set()); }}
                onSelectAll={() => { setSelectedUnitTypes(new Set(allVendasTypes)); setSelectedUnits(new Set()); }}
                onClear={() => { setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                activeColor="violet"
              />
              <MultiSelectFilter
                label="Status"
                icon={<CheckCircle className="h-4 w-4" />}
                allOptions={allVendasStatuses}
                selected={selectedUnitStatuses}
                onToggle={(name) => { setSelectedUnitStatuses(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
                onSelectAll={() => setSelectedUnitStatuses(new Set(allVendasStatuses))}
                onClear={() => setSelectedUnitStatuses(new Set())}
                activeColor="emerald"
              />
              <MultiSelectFilter
                label="Cliente"
                icon={<Users className="h-4 w-4" />}
                allOptions={allVendasCustomers}
                selected={selectedUnitCustomers}
                onToggle={(name) => { setSelectedUnitCustomers(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
                onSelectAll={() => setSelectedUnitCustomers(new Set(allVendasCustomers))}
                onClear={() => setSelectedUnitCustomers(new Set())}
                activeColor="rose"
              />
            </div>
            {/* KPI Cards */}
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 group-hover:h-2 transition-all duration-300" />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-indigo-600/80 uppercase tracking-widest">Total Contratos</p>
                      <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{totalContracts}</p>
                      <p className="text-[11px] font-medium text-slate-400 mt-1">{emitidos} emitidos · {cancelados} cancelados</p>
                    </div>
                    <div className="p-3 bg-indigo-50/80 rounded-2xl ring-1 ring-indigo-100/50 shadow-sm"><FileText className="h-5 w-5 text-indigo-500" /></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 group-hover:h-2 transition-all duration-300" />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-emerald-600/80 uppercase tracking-widest">Valor Vendido</p>
                      <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{formatCurrency(totalValue)}</p>
                    </div>
                    <div className="p-3 bg-emerald-50/80 rounded-2xl ring-1 ring-emerald-100/50 shadow-sm"><Banknote className="h-5 w-5 text-emerald-500" /></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-400 group-hover:h-2 transition-all duration-300" />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-blue-600/80 uppercase tracking-widest">Ticket Médio</p>
                      <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{formatCurrency(ticketMedio)}</p>
                    </div>
                    <div className="p-3 bg-blue-50/80 rounded-2xl ring-1 ring-blue-100/50 shadow-sm"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
                  </div>
                </CardContent>
              </Card>
              {(() => {
                // Exclude permuta/vehicle units from sales view (not real inventory)
                const isRealUnit = (tipo: string) => !(/permuta|veículo|veiculos/i.test(tipo));
                // Filter units same way as enterprise cards (respect type filter)
                const kpiUnitsBase = allUnits.filter(u => {
                  if (companyRows.length > 0 && companyRows.length < allUnits.length && !companyRows.some(r => r.name === u.enterprise)) return false;
                  if (selectedUnitTypes.size > 0) { if (!selectedUnitTypes.has(u.tipo)) return false; }
                  else { if (!isRealUnit(u.tipo)) return false; }
                  return true;
                });
                const totalUn = kpiUnitsBase.length;
                const vendUn = kpiUnitsBase.filter(u => u.status === "Vendida" || u.status === "Vendido/Terceiros").length;
                const dispUn = kpiUnitsBase.filter(u => u.status === "Disponível").length;
                const pctVend = totalUn > 0 ? (vendUn / totalUn) * 100 : 0;
                return (
                  <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                    <div className={`h-1.5 bg-gradient-to-r ${pctVend >= 80 ? "from-emerald-500 to-emerald-400" : pctVend >= 50 ? "from-blue-500 to-blue-400" : "from-amber-500 to-amber-400"} group-hover:h-2 transition-all duration-300`} />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold text-violet-600/80 uppercase tracking-widest">Estoque</p>
                          <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{pctVend.toFixed(0)}% <span className="text-lg font-bold text-slate-400">vendido</span></p>
                          <p className="text-[11px] font-medium text-slate-400 mt-1">{vendUn} vendidas · {dispUn} disponíveis · {totalUn} total</p>
                        </div>
                        <div className="p-3 bg-violet-50/80 rounded-2xl ring-1 ring-violet-100/50 shadow-sm"><Building2 className="h-5 w-5 text-violet-500" /></div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>

            {/* Charts: Enterprise Cards + Column by Period */}
            <div className="grid gap-6 lg:grid-cols-5 mt-6">
              {/* Enterprise cards with unit breakdown */}
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-slate-800">Por Empreendimento</CardTitle>
                  <CardDescription className="text-slate-400">Vendas e estoque por empreendimento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {companyRows.length > 0 ? companyRows.map(row => {
                    const isRealUnit = (tipo: string) => !(/permuta|veículo|veiculos/i.test(tipo));
                    const enterpriseUnits = allUnits.filter(u => u.enterprise === row.name && (selectedUnitTypes.size > 0 ? selectedUnitTypes.has(u.tipo) : isRealUnit(u.tipo)));
                    const totalUn = enterpriseUnits.length;
                    const vendidas = enterpriseUnits.filter(u => u.status === "Vendida" || u.status === "Vendido/Terceiros").length;
                    const disponiveis = enterpriseUnits.filter(u => u.status === "Disponível").length;
                    const reserva = enterpriseUnits.filter(u => u.status === "Reserva Técnica").length;
                    const outros = totalUn - vendidas - disponiveis - reserva;
                    const pctVendido = totalUn > 0 ? (vendidas / totalUn) * 100 : 0;
                    const pctDisponivel = totalUn > 0 ? (disponiveis / totalUn) * 100 : 0;
                    return (
                      <div key={row.name} className="p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 hover:shadow-sm transition-all bg-white">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-slate-800 truncate" title={row.name}>{row.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{row.contracts.length} contratos · {formatCurrency(row.totalValue)}</p>
                          </div>
                          <span className={`text-[13px] font-black tabular-nums ml-2 ${pctVendido >= 80 ? "text-emerald-600" : pctVendido >= 50 ? "text-blue-600" : "text-amber-600"}`}>
                            {pctVendido.toFixed(0)}%
                          </span>
                        </div>
                        {totalUn > 0 && (
                          <>
                            {/* Progress bar */}
                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex gap-[1px] mb-2">
                              {vendidas > 0 && <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pctVendido}%` }} title={`Vendidas: ${vendidas}`} />}
                              {reserva > 0 && <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${(reserva / totalUn) * 100}%` }} title={`Reserva: ${reserva}`} />}
                              {outros > 0 && <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(outros / totalUn) * 100}%` }} title={`Outros: ${outros}`} />}
                              {disponiveis > 0 && <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pctDisponivel}%` }} title={`Disponíveis: ${disponiveis}`} />}
                            </div>
                            {/* Unit counts */}
                            <div className="flex items-center gap-3 text-[10px] flex-wrap">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /><span className="text-slate-500">Vend. <strong className="text-slate-700">{vendidas}</strong></span></span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-slate-500">Disp. <strong className="text-slate-700">{disponiveis}</strong></span></span>
                              {reserva > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400" /><span className="text-slate-500">Res. <strong className="text-slate-700">{reserva}</strong></span></span>}
                              {outros > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /><span className="text-slate-500">Outros <strong className="text-slate-700">{outros}</strong></span></span>}
                              <span className="ml-auto text-slate-400 font-medium">{totalUn} un.</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="flex items-center justify-center h-[320px] text-slate-400 text-sm">Sem dados</div>
                  )}
                </CardContent>
              </Card>

              {/* Column chart - Evolução Mensal/Anual */}
              <Card className="border-0 shadow-sm lg:col-span-3">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg text-slate-800">
                        {chartView === "anual" ? "Vendas por Ano" : "Vendas por Mês"}
                      </CardTitle>
                      <CardDescription className="text-slate-400">Evolução das vendas no período</CardDescription>
                    </div>
                    <Tabs value={chartView === "diario" ? "mensal" : chartView} onValueChange={v => setChartView(v as ChartView)}>
                      <TabsList className="h-8">
                        <TabsTrigger value="anual" className="text-xs px-3 h-7">Anual</TabsTrigger>
                        <TabsTrigger value="mensal" className="text-xs px-3 h-7">Mensal</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {comercialChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(320, companyRows.length * 44)}>
                      <BarChart data={comercialChart} margin={{ top: 40, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} width={80} />
                        <RechartsTooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Valor"]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}
                          label={((props: Record<string, unknown>) => {
                            const x = Number(props.x ?? 0), y = Number(props.y ?? 0), w = Number(props.width ?? 0), value = Number(props.value ?? 0), index = Number(props.index ?? 0);
                            const entry = comercialChart[index];
                            const pct = entry?.pct;
                            return (
                              <g>
                                <text x={x + w / 2} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={700} fill="#334155">
                                  {formatCompactCurrency(value)}
                                </text>
                                {pct !== null && pct !== undefined && (
                                  <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={pct >= 0 ? "#16a34a" : "#f87171"}>
                                    {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                                  </text>
                                )}
                              </g>
                            );
                          }) as unknown as undefined}
                        >
                          {(() => {
                            const values = comercialChart.map(d => d.value);
                            const maxVal = Math.max(...values);
                            const minVal = Math.min(...values);
                            return comercialChart.map((entry, idx) => (
                              <Cell key={idx} fill={entry.value === maxVal ? "#22c55e" : entry.value === minVal ? "#f87171" : "#6366f1"} />
                            ));
                          })()}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[320px] text-slate-400 text-sm">Sem dados para o período</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Table by Company */}
            <Card className="border-0 shadow-sm mt-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-700">Contratos por Empreendimento</CardTitle>
                <CardDescription className="text-xs text-slate-400">{totalContracts} contratos · {formatCurrency(totalValue)}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[500px] border-t border-slate-100">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-slate-200">
                      {([
                        { key: "name" as const, label: "Empreendimento", align: "left" },
                        { key: "contracts" as const, label: "Contratos", align: "right" },
                        { key: "totalValue" as const, label: "Valor Total", align: "right" },
                        { key: "ticket" as const, label: "Ticket Médio", align: "right" },
                        { key: "pct" as const, label: "% do Total", align: "right" },
                      ] as const).map((col, i) => {
                        const isSorted = comercialSort.field === col.key;
                        const SortIcon = isSorted ? (comercialSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return (
                          <TableHead
                            key={col.key}
                            className={`font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11 cursor-pointer hover:text-slate-700 select-none ${col.align === "right" ? "text-right" : ""} ${i === 0 ? "pl-5" : ""} ${i === 4 ? "pr-5" : ""}`}
                            onClick={() => setComercialSort(prev => ({
                              field: col.key,
                              dir: prev.field === col.key && prev.dir === "desc" ? "asc" : "desc",
                            }))}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              <SortIcon className={`h-3 w-3 ${isSorted ? "text-indigo-500" : "text-slate-300"}`} />
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companyRows.map(row => {
                      const pct = totalValue > 0 ? (row.totalValue / totalValue) * 100 : 0;
                      const avgTicket = row.contracts.length > 0 ? row.totalValue / row.contracts.length : 0;
                      const isExpanded = expandedComercial.has(`comercial-${row.name}`);
                      return (
                        <React.Fragment key={row.name}>
                          <TableRow
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors border-b border-slate-100"
                            onClick={() => {
                              setExpandedComercial(prev => {
                                const next = new Set(prev);
                                const key = `comercial-${row.name}`;
                                if (next.has(key)) next.delete(key); else next.add(key);
                                return next;
                              });
                            }}
                          >
                            <TableCell className="pl-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`p-0.5 rounded transition-colors ${isExpanded ? "bg-indigo-100" : ""}`}>
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-indigo-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                                </div>
                                <span className="font-semibold text-[13px] text-slate-700">{row.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-[13px] text-slate-700 tabular-nums">{row.contracts.length}</TableCell>
                            <TableCell className="text-right font-bold text-[13px] text-slate-700 tabular-nums">{formatCurrency(row.totalValue)}</TableCell>
                            <TableCell className="text-right text-[13px] text-slate-600 tabular-nums">{formatCurrency(avgTicket)}</TableCell>
                            <TableCell className="text-right pr-5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums bg-indigo-50 text-indigo-700">
                                {pct.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                          {isExpanded && row.contracts
                            .sort((a, b) => (b.value || 0) - (a.value || 0))
                            .map(c => (
                              <TableRow key={c.id} className="bg-slate-50/50 border-b border-slate-100/50">
                                <TableCell className="pl-12 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-mono text-[10px] bg-white py-0.5 px-1.5 rounded border border-slate-200 shadow-sm">{c.number}</span>
                                    <span className="text-[12px] text-slate-600">{c.salesContractCustomers?.[0]?.name || "—"}</span>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                      c.situation === "Emitido" ? "border-emerald-200 text-emerald-600 bg-emerald-50" :
                                      c.situation === "Cancelado" || c.cancellationDate ? "border-red-200 text-red-600 bg-red-50" :
                                      "border-slate-200 text-slate-500"
                                    }`}>{c.cancellationDate ? "Cancelado" : c.situation}</Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-[12px] text-slate-500 tabular-nums">{formatDate(c.contractDate)}</TableCell>
                                <TableCell className="text-right text-[12px] text-slate-600 font-medium tabular-nums">{formatCurrency(c.value)}</TableCell>
                                <TableCell className="text-right text-[12px] text-slate-500 tabular-nums">
                                  {c.salesContractUnits?.filter(u => u.main)?.map(u => u.name).join(", ") || "—"}
                                </TableCell>
                                <TableCell className="text-right pr-5 text-[12px] text-slate-400 tabular-nums">
                                  {c.paymentConditions?.length || 0} cond.
                                </TableCell>
                              </TableRow>
                            ))}
                        </React.Fragment>
                      );
                    })}
                    {/* Total row */}
                    <TableRow className="bg-indigo-50/50 border-t-2 border-indigo-200">
                      <TableCell className="pl-5 py-3 font-bold text-[13px] text-indigo-800">TOTAL</TableCell>
                      <TableCell className="text-right font-bold text-[13px] text-indigo-800 tabular-nums">{totalContracts}</TableCell>
                      <TableCell className="text-right font-bold text-[14px] text-indigo-800 tabular-nums">{formatCurrency(totalValue)}</TableCell>
                      <TableCell className="text-right font-bold text-[13px] text-indigo-700 tabular-nums">{formatCurrency(ticketMedio)}</TableCell>
                      <TableCell className="text-right pr-5 font-bold text-[13px] text-indigo-700">100%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            </Card>
            </>}

            {/* ─── UNIDADES SUB-TAB ─── */}
            {comercialSubTab === "unidades" && (() => {
              // Status color mapping
              const statusColors: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
                "Todas": { bg: "bg-white", text: "text-slate-700", border: "border-slate-300", activeBg: "bg-slate-800 text-white border-slate-800" },
                "Vendida": { bg: "bg-white", text: "text-red-600", border: "border-red-200", activeBg: "bg-red-500 text-white border-red-500" },
                "Disponível": { bg: "bg-white", text: "text-emerald-600", border: "border-emerald-200", activeBg: "bg-emerald-500 text-white border-emerald-500" },
                "Reserva Técnica": { bg: "bg-white", text: "text-blue-600", border: "border-blue-200", activeBg: "bg-blue-500 text-white border-blue-500" },
                "Proposta": { bg: "bg-white", text: "text-orange-600", border: "border-orange-200", activeBg: "bg-orange-500 text-white border-orange-500" },
                "Vendido/Terceiros": { bg: "bg-white", text: "text-pink-600", border: "border-pink-200", activeBg: "bg-pink-500 text-white border-pink-500" },
                "Emitido": { bg: "bg-white", text: "text-red-600", border: "border-red-200", activeBg: "bg-red-500 text-white border-red-500" },
                "Cancelado": { bg: "bg-white", text: "text-slate-500", border: "border-slate-200", activeBg: "bg-slate-500 text-white border-slate-500" },
                "Distratado": { bg: "bg-white", text: "text-orange-600", border: "border-orange-200", activeBg: "bg-orange-500 text-white border-orange-500" },
              };
              const defaultColor = { bg: "bg-white", text: "text-violet-600", border: "border-violet-200", activeBg: "bg-violet-500 text-white border-violet-500" };

              // Cascading filters: Enterprise → Type → Unit names
              const allEnterpriseOptions = Array.from(new Set(allUnits.map(u => u.enterprise))).sort();
              const unitsForEnterprise = selectedUnitEnterprises.size === 0 ? allUnits : allUnits.filter(u => selectedUnitEnterprises.has(u.enterprise));
              const allUnitTypes = Array.from(new Set(unitsForEnterprise.map(u => u.tipo))).sort();
              const unitsForType = selectedUnitTypes.size === 0 ? unitsForEnterprise : unitsForEnterprise.filter(u => selectedUnitTypes.has(u.tipo));
              const allUnitNames = Array.from(new Set(unitsForType.map(u => u.unit))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
              const allStatusOptions = Array.from(new Set(allUnits.map(u => u.status))).sort();
              const allCustomerOptions = Array.from(new Set(allUnits.map(u => u.customer).filter(c => c && c !== "—"))).sort();

              // Filter units by all filters
              const filteredUnits = allUnits.filter(u => {
                if (selectedUnitEnterprises.size > 0 && !selectedUnitEnterprises.has(u.enterprise)) return false;
                if (selectedUnitTypes.size > 0 && !selectedUnitTypes.has(u.tipo)) return false;
                if (selectedUnits.size > 0 && !selectedUnits.has(u.unit)) return false;
                if (selectedUnitStatuses.size > 0 && !selectedUnitStatuses.has(u.status)) return false;
                if (selectedUnitCustomers.size > 0 && !selectedUnitCustomers.has(u.customer)) return false;
                return true;
              });

              // Group filtered units by enterprise for the table
              const groupedByEnterprise = new Map<string, typeof filteredUnits>();
              filteredUnits.forEach(u => {
                if (!groupedByEnterprise.has(u.enterprise)) groupedByEnterprise.set(u.enterprise, []);
                groupedByEnterprise.get(u.enterprise)!.push(u);
              });
              const enterpriseGroupRows = Array.from(groupedByEnterprise.entries())
                .map(([name, units]) => ({ name, units, totalValue: units.reduce((s, u) => s + (u.status === "Vendida" ? u.value : 0), 0) }))
                .sort((a, b) => b.units.length - a.units.length);

              // KPI counts based on filtered units
              const fTotal = filteredUnits.length;
              const fVendidas = filteredUnits.filter(u => u.status === "Vendida").length;
              const fDisponiveis = filteredUnits.filter(u => u.status === "Disponível").length;
              const fOutros = fTotal - fVendidas - fDisponiveis;
              const fEnterprises = new Set(filteredUnits.map(u => u.enterprise)).size;

              return <>
              {/* KPI summary cards */}
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                  <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 group-hover:h-2 transition-all duration-300" />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-indigo-600/80 uppercase tracking-widest">Total Unidades</p>
                        <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{fTotal}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-1">{fEnterprises} empreendimentos</p>
                      </div>
                      <div className="p-3 bg-indigo-50/80 rounded-2xl ring-1 ring-indigo-100/50 shadow-sm"><Building2 className="h-5 w-5 text-indigo-500" /></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                  <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 group-hover:h-2 transition-all duration-300" />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-emerald-600/80 uppercase tracking-widest">Vendidas</p>
                        <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{fVendidas}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-1">{fTotal > 0 ? ((fVendidas / fTotal) * 100).toFixed(1) : 0}% do total</p>
                      </div>
                      <div className="p-3 bg-emerald-50/80 rounded-2xl ring-1 ring-emerald-100/50 shadow-sm"><CheckCircle className="h-5 w-5 text-emerald-500" /></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                  <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400 group-hover:h-2 transition-all duration-300" />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-amber-600/80 uppercase tracking-widest">Disponíveis</p>
                        <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{fDisponiveis}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-1">{fTotal > 0 ? ((fDisponiveis / fTotal) * 100).toFixed(1) : 0}% do total</p>
                      </div>
                      <div className="p-3 bg-amber-50/80 rounded-2xl ring-1 ring-amber-100/50 shadow-sm"><AlertTriangle className="h-5 w-5 text-amber-500" /></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
                  <div className="h-1.5 bg-gradient-to-r from-slate-500 to-slate-400 group-hover:h-2 transition-all duration-300" />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-600/80 uppercase tracking-widest">Outros Status</p>
                        <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{fOutros}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-1">Reserva técnica, etc.</p>
                      </div>
                      <div className="p-3 bg-slate-100/80 rounded-2xl ring-1 ring-slate-200/50 shadow-sm"><Clock className="h-5 w-5 text-slate-500" /></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Filters row: all MultiSelectFilter */}
              <div className="flex items-center gap-2 flex-wrap mt-6">
                <MultiSelectFilter
                  label="Empreendimento"
                  icon={<Building2 className="h-4 w-4" />}
                  allOptions={allEnterpriseOptions}
                  selected={selectedUnitEnterprises}
                  onToggle={(name) => { setSelectedUnitEnterprises(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                  onSelectAll={() => { setSelectedUnitEnterprises(new Set(allEnterpriseOptions)); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                  onClear={() => { setSelectedUnitEnterprises(new Set()); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                  activeColor="indigo"
                />
                <MultiSelectFilter
                  label="Tipo Imóvel"
                  icon={<Ruler className="h-4 w-4" />}
                  allOptions={allUnitTypes}
                  selected={selectedUnitTypes}
                  onToggle={(name) => { setSelectedUnitTypes(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); setSelectedUnits(new Set()); }}
                  onSelectAll={() => { setSelectedUnitTypes(new Set(allUnitTypes)); setSelectedUnits(new Set()); }}
                  onClear={() => { setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                  activeColor="violet"
                />
                <MultiSelectFilter
                  label="Unidades"
                  icon={<Search className="h-4 w-4" />}
                  allOptions={allUnitNames}
                  selected={selectedUnits}
                  onToggle={(name) => { setSelectedUnits(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
                  onSelectAll={() => setSelectedUnits(new Set(allUnitNames))}
                  onClear={() => setSelectedUnits(new Set())}
                  activeColor="cyan"
                />
                <MultiSelectFilter
                  label="Status"
                  icon={<CheckCircle className="h-4 w-4" />}
                  allOptions={allStatusOptions}
                  selected={selectedUnitStatuses}
                  onToggle={(name) => { setSelectedUnitStatuses(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
                  onSelectAll={() => setSelectedUnitStatuses(new Set(allStatusOptions))}
                  onClear={() => setSelectedUnitStatuses(new Set())}
                  activeColor="emerald"
                />
                <MultiSelectFilter
                  label="Cliente"
                  icon={<Users className="h-4 w-4" />}
                  allOptions={allCustomerOptions}
                  selected={selectedUnitCustomers}
                  onToggle={(name) => { setSelectedUnitCustomers(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
                  onSelectAll={() => setSelectedUnitCustomers(new Set(allCustomerOptions))}
                  onClear={() => setSelectedUnitCustomers(new Set())}
                  activeColor="rose"
                />
              </div>

              {/* Units table */}
              <Card className="border-0 shadow-sm mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-700">
                    {selectedUnitStatuses.size === 0 ? "Todas as Unidades" : `Unidades — ${Array.from(selectedUnitStatuses).join(", ")}`}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    {filteredUnits.length} unidades {selectedUnitEnterprises.size > 0 ? `em ${Array.from(selectedUnitEnterprises).join(", ")}` : `em ${enterpriseGroupRows.length} empreendimentos`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[500px] border-t border-slate-100">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-slate-200">
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11 pl-5">Status</TableHead>
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11">Empreendimento</TableHead>
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11">Unidade</TableHead>
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11">Tipo</TableHead>
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11">Cliente</TableHead>
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11 text-right">Data Contrato</TableHead>
                        <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11 text-right pr-5">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enterpriseGroupRows.map(group => {
                        const isExpanded = expandedComercial.has(`unitgroup-${group.name}`);
                        const groupUnits = group.units.sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));
                        const vendidas = group.units.filter(u => u.status === "Vendida").length;
                        const disponiveis = group.units.filter(u => u.status === "Disponível").length;
                        return (
                          <React.Fragment key={group.name}>
                            <TableRow
                              className="hover:bg-slate-50/80 cursor-pointer transition-colors border-b border-slate-100 bg-slate-50/40"
                              onClick={() => {
                                setExpandedComercial(prev => {
                                  const next = new Set(prev);
                                  const key = `unitgroup-${group.name}`;
                                  if (next.has(key)) next.delete(key); else next.add(key);
                                  return next;
                                });
                              }}
                            >
                              <TableCell className="pl-5 py-3" colSpan={3}>
                                <div className="flex items-center gap-2">
                                  <div className={`p-0.5 rounded transition-colors ${isExpanded ? "bg-indigo-100" : ""}`}>
                                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-indigo-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                                  </div>
                                  <span className="font-bold text-[13px] text-slate-700">{group.name}</span>
                                  <span className="text-[11px] text-slate-400 ml-2">{group.units.length} un.</span>
                                  {vendidas > 0 && <span className="text-[10px] font-semibold text-red-500 dark:text-red-300/70 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded">{vendidas} vendidas</span>}
                                  {disponiveis > 0 && <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">{disponiveis} disp.</span>}
                                </div>
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${group.units.length > 0 ? (vendidas / group.units.length) * 100 : 0}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 tabular-nums">{group.units.length > 0 ? ((vendidas / group.units.length) * 100).toFixed(0) : 0}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right pr-5 font-bold text-[13px] text-slate-700 tabular-nums">{formatCurrency(group.totalValue)}</TableCell>
                            </TableRow>
                            {isExpanded && groupUnits.map((u, idx) => {
                              const sc = statusColors[u.status] || defaultColor;
                              return (
                                <TableRow key={`${u.unit}-${idx}`} className={`border-b border-slate-100/50 ${
                                  u.status === "Vendida" ? "bg-red-50/30" : u.status === "Disponível" ? "bg-emerald-50/30" : "bg-white"
                                }`}>
                                  <TableCell className="pl-8 py-2.5">
                                    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-semibold ${
                                      u.status === "Vendida" ? "border-red-200 text-red-600 bg-red-50" :
                                      u.status === "Disponível" ? "border-emerald-200 text-emerald-600 bg-emerald-50" :
                                      `${sc.border} ${sc.text} ${sc.bg}`
                                    }`}>{u.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-[12px] text-slate-500">{u.enterprise}</TableCell>
                                  <TableCell>
                                    <span className="font-mono text-[12px] font-bold text-slate-700 bg-white py-0.5 px-2 rounded border border-slate-200 shadow-sm">{u.unit}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{u.tipo}</span>
                                  </TableCell>
                                  <TableCell className="text-[12px] text-slate-600">{u.customer}</TableCell>
                                  <TableCell className="text-right text-[12px] text-slate-500 tabular-nums">{formatDate(u.contractDate)}</TableCell>
                                  <TableCell className="text-right pr-5 text-[12px] font-medium tabular-nums text-slate-700">
                                    {u.status === "Vendida" ? formatCurrency(u.value) : "—"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      {/* Total row */}
                      <TableRow className="bg-indigo-50/50 border-t-2 border-indigo-200">
                        <TableCell className="pl-5 py-3 font-bold text-[13px] text-indigo-800" colSpan={5}>
                          TOTAL — {filteredUnits.length} unidades
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right pr-5 font-bold text-[14px] text-indigo-800 tabular-nums">
                          {formatCurrency(filteredUnits.filter(u => u.status === "Vendida").reduce((s, u) => s + u.value, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              </Card>
              </>;
            })()}

            {/* ─── QUADRO ESPELHO SUB-TAB ─── */}
            {comercialSubTab === "quadro" && (() => {
              // Cascading filters using shared Set-based states
              const qEnterpriseOptions = Array.from(new Set(allUnits.map(u => u.enterprise))).sort();
              const qUnitsForEnterprise = selectedUnitEnterprises.size === 0 ? allUnits : allUnits.filter(u => selectedUnitEnterprises.has(u.enterprise));
              const qTypeOptions = Array.from(new Set(qUnitsForEnterprise.map(u => u.tipo))).sort();
              const qUnitsForType = selectedUnitTypes.size === 0 ? qUnitsForEnterprise : qUnitsForEnterprise.filter(u => selectedUnitTypes.has(u.tipo));
              const qUnitNames = Array.from(new Set(qUnitsForType.map(u => u.unit))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
              const qStatusOptions = Array.from(new Set(allUnits.map(u => u.status))).sort();
              const qCustomerOptions = Array.from(new Set(allUnits.map(u => u.customer).filter(c => c && c !== "—"))).sort();

              // Filter units
              const qUnits = allUnits.filter(u => {
                if (selectedUnitEnterprises.size > 0 && !selectedUnitEnterprises.has(u.enterprise)) return false;
                if (selectedUnitTypes.size > 0 && !selectedUnitTypes.has(u.tipo)) return false;
                if (selectedUnits.size > 0 && !selectedUnits.has(u.unit)) return false;
                if (selectedUnitCustomers.size > 0 && !selectedUnitCustomers.has(u.customer)) return false;
                return true;
              }).sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));

              const qVendidas = qUnits.filter(u => u.status === "Vendida").length;
              const qDisponiveis = qUnits.filter(u => u.status === "Disponível").length;
              const qReserva = qUnits.filter(u => u.status === "Reserva Técnica").length;
              const qProposta = qUnits.filter(u => u.status === "Proposta").length;
              const qVendTerceiros = qUnits.filter(u => u.status === "Vendido/Terceiros").length;
              const qOutros = qUnits.length - qVendidas - qDisponiveis - qReserva - qProposta - qVendTerceiros;

              // Filter by status if active
              const qVisible = selectedUnitStatuses.size === 0 ? qUnits : qUnits.filter(u => selectedUnitStatuses.has(u.status));

              // Card colors by status
              const cardStyle = (status: string) => {
                switch (status) {
                  case "Vendida": return "bg-red-50/70 border-red-200 border-l-[4px] border-l-red-500 hover:bg-red-100/80 hover:border-red-300 hover:shadow-md";
                  case "Disponível": return "bg-emerald-50/70 border-emerald-200 border-l-[4px] border-l-emerald-500 hover:bg-emerald-100/80 hover:border-emerald-300 hover:shadow-md";
                  case "Reserva Técnica": return "bg-blue-50/70 border-blue-200 border-l-[4px] border-l-blue-500 hover:bg-blue-100/80 hover:border-blue-300 hover:shadow-md";
                  case "Proposta": return "bg-orange-50/70 border-orange-200 border-l-[4px] border-l-orange-500 hover:bg-orange-100/80 hover:border-orange-300 hover:shadow-md";
                  case "Vendido/Terceiros": return "bg-pink-50/70 border-pink-200 border-l-[4px] border-l-pink-500 hover:bg-pink-100/80 hover:border-pink-300 hover:shadow-md";
                  default: return "bg-amber-50/70 border-amber-200 border-l-[4px] border-l-amber-500 hover:bg-amber-100/80 hover:border-amber-300 hover:shadow-md";
                }
              };
              const statusTextColor = (status: string) => {
                switch (status) {
                  case "Vendida": return "text-red-700";
                  case "Disponível": return "text-emerald-700";
                  case "Reserva Técnica": return "text-blue-700";
                  case "Proposta": return "text-orange-700";
                  case "Vendido/Terceiros": return "text-pink-700";
                  default: return "text-amber-700";
                }
              };

              return <>
                {/* Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <MultiSelectFilter
                    label="Empreendimento"
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    allOptions={qEnterpriseOptions}
                    selected={selectedUnitEnterprises}
                    onToggle={v => {
                      setSelectedUnitEnterprises(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
                      setSelectedUnitTypes(new Set());
                      setSelectedUnits(new Set());
                    }}
                    onSelectAll={() => { setSelectedUnitEnterprises(new Set(qEnterpriseOptions)); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                    onClear={() => { setSelectedUnitEnterprises(new Set()); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                    activeColor="indigo"
                  />
                  <MultiSelectFilter
                    label="Tipo Imóvel"
                    icon={<Ruler className="h-3.5 w-3.5" />}
                    allOptions={qTypeOptions}
                    selected={selectedUnitTypes}
                    onToggle={v => {
                      setSelectedUnitTypes(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
                      setSelectedUnits(new Set());
                    }}
                    onSelectAll={() => { setSelectedUnitTypes(new Set(qTypeOptions)); setSelectedUnits(new Set()); }}
                    onClear={() => { setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); }}
                    activeColor="violet"
                  />
                  <MultiSelectFilter
                    label="Unidades"
                    icon={<Search className="h-3.5 w-3.5" />}
                    allOptions={qUnitNames}
                    selected={selectedUnits}
                    onToggle={v => setSelectedUnits(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; })}
                    onSelectAll={() => setSelectedUnits(new Set(qUnitNames))}
                    onClear={() => setSelectedUnits(new Set())}
                    activeColor="cyan"
                  />
                  <MultiSelectFilter
                    label="Status"
                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                    allOptions={qStatusOptions}
                    selected={selectedUnitStatuses}
                    onToggle={v => setSelectedUnitStatuses(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; })}
                    onSelectAll={() => setSelectedUnitStatuses(new Set(qStatusOptions))}
                    onClear={() => setSelectedUnitStatuses(new Set())}
                    activeColor="emerald"
                  />
                  <MultiSelectFilter
                    label="Cliente"
                    icon={<Users className="h-3.5 w-3.5" />}
                    allOptions={qCustomerOptions}
                    selected={selectedUnitCustomers}
                    onToggle={v => setSelectedUnitCustomers(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; })}
                    onSelectAll={() => setSelectedUnitCustomers(new Set(qCustomerOptions))}
                    onClear={() => setSelectedUnitCustomers(new Set())}
                    activeColor="rose"
                  />
                </div>

                {/* Summary bar */}
                {qUnits.length > 0 && (
                  <Card className="border-0 shadow-sm mt-4">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-bold text-slate-700">{qUnits.length} unidades</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400" /><span className="text-slate-500">Vendidas: <strong className="text-red-600 dark:text-red-300/70">{qVendidas}</strong></span></span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400" /><span className="text-slate-500">Disponíveis: <strong className="text-emerald-600">{qDisponiveis}</strong></span></span>
                            {qReserva > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400" /><span className="text-slate-500">Reserva: <strong className="text-blue-600">{qReserva}</strong></span></span>}
                            {qProposta > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400" /><span className="text-slate-500">Proposta: <strong className="text-orange-600">{qProposta}</strong></span></span>}
                            {qVendTerceiros > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-pink-400" /><span className="text-slate-500">Vend/Terceiros: <strong className="text-pink-600">{qVendTerceiros}</strong></span></span>}
                            {qOutros > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400" /><span className="text-slate-500">Outros: <strong className="text-amber-600">{qOutros}</strong></span></span>}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-500">
                          {qUnits.length > 0 ? ((qVendidas / qUnits.length) * 100).toFixed(0) : 0}% vendido
                        </span>
                      </div>
                      <div className="w-full h-4 flex gap-[2px]">
                        {qVendidas > 0 && <div className="h-full bg-red-400 transition-all rounded-full shadow-inner" style={{ width: `${(qVendidas / qUnits.length) * 100}%` }} title={`Vendidas: ${qVendidas}`} />}
                        {qDisponiveis > 0 && <div className="h-full bg-emerald-400 transition-all rounded-full shadow-inner" style={{ width: `${(qDisponiveis / qUnits.length) * 100}%` }} title={`Disponível: ${qDisponiveis}`} />}
                        {qReserva > 0 && <div className="h-full bg-blue-400 transition-all rounded-full shadow-inner" style={{ width: `${(qReserva / qUnits.length) * 100}%` }} title={`Reserva Tećnica: ${qReserva}`} />}
                        {qProposta > 0 && <div className="h-full bg-orange-400 transition-all rounded-full shadow-inner" style={{ width: `${(qProposta / qUnits.length) * 100}%` }} title={`Proposta: ${qProposta}`} />}
                        {qVendTerceiros > 0 && <div className="h-full bg-pink-400 transition-all rounded-full shadow-inner" style={{ width: `${(qVendTerceiros / qUnits.length) * 100}%` }} title={`Vendido/Terceiros: ${qVendTerceiros}`} />}
                        {qOutros > 0 && <div className="h-full bg-amber-400 transition-all rounded-full shadow-inner" style={{ width: `${(qOutros / qUnits.length) * 100}%` }} title={`Outros: ${qOutros}`} />}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Grid of unit cards */}
                {selectedUnitEnterprises.size === 0 ? (
                  <Card className="border-0 shadow-sm mt-4">
                    <CardContent className="p-8 text-center">
                      <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-500">Selecione um empreendimento</p>
                      <p className="text-xs text-slate-400 mt-1">Escolha um empreendimento no filtro acima para visualizar o quadro de unidades</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 mt-4">
                    {qVisible.map((u, idx) => (
                      <div
                        key={`${u.unit}-${idx}`}
                        className={`relative rounded-xl border p-3 cursor-pointer transition-all duration-300 hover:-translate-y-1 group ${cardStyle(u.status)}`}
                        title={u.status === "Vendida" ? `Unidade ${u.unit}\nStatus: ${u.status}\nCliente: ${u.customer}\nValor: ${formatCurrency(u.value)}` : `Unidade ${u.unit} — ${u.status}`}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-lg font-extrabold text-slate-800 leading-none">{u.unit}</p>
                          <div className={`w-2 h-2 rounded-full ${u.status === "Vendida" ? "bg-red-500" : u.status === "Disponível" ? "bg-emerald-500" : u.status === "Reserva Técnica" ? "bg-blue-500" : u.status === "Proposta" ? "bg-orange-500" : u.status === "Vendido/Terceiros" ? "bg-pink-500" : "bg-slate-300"}`} />
                        </div>
                        <p className={`text-[10px] font-bold mt-2 uppercase tracking-wide ${statusTextColor(u.status)}`}>{u.status}</p>
                        {u.tipo !== "Apartamento" && (
                          <p className="text-[9px] text-slate-400 font-medium mt-0.5">{u.tipo}</p>
                        )}
                        {/* Hover overlay with details */}
                        {u.status === "Vendida" && (
                          <div className="absolute z-10 -inset-x-2 -inset-y-3 bg-white/95 backdrop-blur-md rounded-xl p-4 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-100 flex flex-col justify-center scale-95 group-hover:scale-100 origin-center">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-base font-black text-slate-800">{u.unit}</p>
                              <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200 px-1.5 py-0 uppercase font-bold tracking-wider rounded-md">Vendida</Badge>
                            </div>
                            <div className="mb-2">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Cliente</span>
                              <p className="text-[11px] text-slate-700 font-semibold leading-tight line-clamp-2" title={u.customer}>{u.customer || "Não informado"}</p>
                            </div>
                            <p className="text-[13px] font-black text-slate-800 tabular-nums bg-slate-50 px-2 py-1 rounded inline-block w-max">{formatCurrency(u.value)}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">{formatDate(u.contractDate)}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>;
            })()}
          </>
        );
      })()}

      {/* KPI Cards */}
      {activeTab !== "visao-geral" && activeTab !== "orcamento" && activeTab !== "comercial" && activeTab !== "dre" && activeTab !== "saldos" && activeTab !== "resumo" && (<><div className={`grid gap-5 md:grid-cols-2 lg:grid-cols-${kpis.length}`}>
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
                  {chartView === "mensal" ? "Evolucao Mensal" : chartView === "diario" ? "Evolucao Diaria" : "Evolucao Anual"}
                  {(selectedCompanies.size !== defaultCompanies().size || [...selectedCompanies].some(n => isExcludedCompany(n)) || selectedMonths.size > 0 || selectedDays.size > 0 || selectedDuePeriods.size > 0 || [...selectedDocTypes].some(t => isExcludedDocType(t)) || selectedDocTypes.size !== allDocTypes.filter(t => !isExcludedDocType(t)).length) && (
                    <span className="text-sm font-normal text-blue-500 ml-2">
                      (filtrado)
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {seriesLabel} por {chartView === "mensal" ? "mes" : chartView === "diario" ? "dia" : "ano"}
                </CardDescription>
              </div>
              <Tabs value={chartView} onValueChange={v => setChartView(v as ChartView)}>
                <TabsList className="h-8">
                  <TabsTrigger value="anual" className="text-xs px-3 h-7">Anual</TabsTrigger>
                  <TabsTrigger value="mensal" className="text-xs px-3 h-7">Mensal</TabsTrigger>
                  <TabsTrigger value="diario" className="text-xs px-3 h-7">Diário</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {chartView === "diario" && (selectedYears.size !== 1 || selectedMonths.size !== 1) ? (
              <div className="flex items-center justify-center h-[480px] text-slate-400 text-sm text-center px-6">
                <div className="space-y-2">
                  <p className="font-medium">Para ver a visão Diária, ajuste os filtros:</p>
                  <ul className="text-xs space-y-1 inline-block text-left">
                    <li className={selectedYears.size === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                      {selectedYears.size === 1 ? "✓" : "✗"} Anos: <strong>{selectedYears.size}</strong> selecionado(s) · precisa ser <strong>1</strong>
                    </li>
                    <li className={selectedMonths.size === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                      {selectedMonths.size === 1 ? "✓" : "✗"} Meses: <strong>{selectedMonths.size}</strong> selecionado(s) · precisa ser <strong>1</strong>
                    </li>
                  </ul>
                  <p className="text-xs text-slate-400">Use os filtros <strong>Anos</strong> e <strong>Meses</strong> no topo da aba</p>
                </div>
              </div>
            ) : (
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
                            <text x={cx} y={(y || 0) - 2} textAnchor="middle" fontSize={9} fill={pct >= 0 ? "#f87171" : "#16a34a"} fontWeight={500}>
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
            )}
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
                            <Badge variant="secondary" className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300/70 font-semibold">
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
                          <TableCell className="text-right font-bold text-red-600 dark:text-red-300/70 tabular-nums">
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
                                          <td className="py-2 text-right tabular-nums font-semibold text-red-600 dark:text-red-300/70">{formatCurrency(effectiveAmount(item))}</td>
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
              <div className="text-sm font-bold text-red-600 dark:text-red-300/70">
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
                          <TableCell className="text-right font-bold text-red-600 dark:text-red-300/70 tabular-nums">
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
                                          <td className="py-2 text-right tabular-nums text-red-600 dark:text-red-300/70">{formatCurrency(calcEncargos(item))}</td>
                                          <td className="py-2 text-right tabular-nums text-slate-500">{formatCurrency(item.discountAmount || 0)}</td>
                                          <td className="py-2 text-right tabular-nums font-semibold text-red-600 dark:text-red-300/70">{formatCurrency(item.correctedBalanceAmount + calcEncargos(item))}</td>
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
              <div className="text-sm font-bold text-red-600 dark:text-red-300/70">
                Total: {formatCurrency(filteredInadimplencia.reduce((s, i) => s + i.correctedBalanceAmount + calcEncargos(i), 0))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </>)}

      {/* DRE Tab */}
      {/* ══════ VISÃO GERAL TAB ══════ */}
      {activeTab === "visao-geral" && (() => {
        // Compute overview metrics from all data (unfiltered by company for global view)
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const in7d = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
        const in30d = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];

        // A Pagar
        const totalAPagar = filteredAPagar.reduce((s, i) => s + effectiveAmount(i), 0);
        const aPagar7d = filteredAPagar.filter(i => i.dueDate >= todayStr && i.dueDate <= in7d).reduce((s, i) => s + effectiveAmount(i), 0);
        const aPagar30d = filteredAPagar.filter(i => i.dueDate >= todayStr && i.dueDate <= in30d).reduce((s, i) => s + effectiveAmount(i), 0);
        const totalAtrasadas = filteredAtrasadas.reduce((s, i) => s + effectiveAmount(i), 0);

        // A Receber
        const totalAReceber = filteredAReceber.reduce((s, i) => s + effectiveAmount(i), 0);
        const aReceber7d = filteredAReceber.filter(i => i.dueDate >= todayStr && i.dueDate <= in7d).reduce((s, i) => s + effectiveAmount(i), 0);
        const totalInadimplencia = filteredInadimplencia.reduce((s, i) => s + effectiveAmount(i), 0);
        const pctInadimplencia = totalAReceber > 0 ? (totalInadimplencia / totalAReceber) * 100 : 0;

        // Saldos
        const saldoTotal = bankAccounts
          .filter(a => selectedBankAccounts.size === 0 || selectedBankAccounts.has(String(a.bankAccountId)))
          .reduce((s, a) => s + a.currentBalance, 0);

        // Fluxo projetado simples
        const fluxoProjetado30d = saldoTotal + aReceber7d - aPagar7d;

        return (
          <div className="space-y-6">
            {/* Row 1: Main KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Saldo Bancário */}
              <div className="relative rounded-2xl p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all" onClick={() => switchTab("saldos")}>
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-violet-600" />
                <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">Saldo Bancário</p>
                <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(saldoTotal)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">hoje</p>
              </div>

              {/* A Pagar 7d */}
              <div className="relative rounded-2xl p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all" onClick={() => switchTab("a-pagar")}>
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">A Pagar 7 dias</p>
                <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(aPagar7d)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">total: {formatCurrency(totalAPagar)}</p>
              </div>

              {/* A Receber 7d */}
              <div className="relative rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all" onClick={() => switchTab("a-receber")}>
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">A Receber 7 dias</p>
                <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(aReceber7d)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">total: {formatCurrency(totalAReceber)}</p>
              </div>

              {/* Vencidas */}
              <div className="relative rounded-2xl p-4 bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/40 overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all" onClick={() => switchTab("atrasadas")}>
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-400 to-rose-500" />
                <p className="text-[10px] font-semibold text-red-600 dark:text-red-300/70 uppercase tracking-wider mb-1">Contas Vencidas</p>
                <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(totalAtrasadas)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{filteredAtrasadas.length} parcelas</p>
              </div>

              {/* Inadimplência */}
              <div className="relative rounded-2xl p-4 bg-orange-50 dark:bg-orange-950/40 border border-orange-200/60 dark:border-orange-800/40 overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all" onClick={() => switchTab("inadimplencia")}>
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 to-amber-500" />
                <p className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">Inadimplência</p>
                <p className="text-lg font-black tabular-nums text-slate-800 dark:text-slate-100">{pctInadimplencia.toFixed(1)}%</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(totalInadimplencia)}</p>
              </div>

              {/* Fluxo Projetado */}
              <div className={`relative rounded-2xl p-4 ${fluxoProjetado30d >= 0 ? "bg-sky-50 dark:bg-sky-950/40 border-sky-200/60 dark:border-sky-800/40" : "bg-red-50 dark:bg-red-950/40 border-red-200/60 dark:border-red-800/40"} border overflow-hidden`}>
                <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${fluxoProjetado30d >= 0 ? "from-sky-500 to-blue-500" : "from-red-400 to-rose-500"}`} />
                <p className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-1">Fluxo 7 dias</p>
                <p className={`text-lg font-black tabular-nums ${fluxoProjetado30d >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-300/70"}`}>{formatCurrency(fluxoProjetado30d)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">saldo + receber - pagar</p>
              </div>
            </div>

            {/* Row 2+3: Fluxo de Caixa + Insights */}
            {(() => {
              // Build projected cash flow for next 30 days
              const days: { date: string; label: string; saldo: number; receber: number; pagar: number; projetado: number; recDia: number; pagDia: number }[] = [];
              let acumReceber = 0;
              let acumPagar = 0;
              for (let d = 0; d <= fluxoPeriodo; d++) {
                const dt = new Date(now.getTime() + d * 86400000);
                const dtStr = dt.toISOString().split("T")[0];
                const dayLabel = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
                const recDia = filteredAReceber.filter(i => i.dueDate === dtStr).reduce((s, i) => s + effectiveAmount(i), 0);
                const pagDia = filteredAPagar.filter(i => i.dueDate === dtStr).reduce((s, i) => s + effectiveAmount(i), 0);
                acumReceber += recDia;
                acumPagar += pagDia;
                days.push({ date: dtStr, label: dayLabel, saldo: saldoTotal, receber: acumReceber, pagar: acumPagar, projetado: saldoTotal + acumReceber - acumPagar, recDia, pagDia });
              }
              return (
                <>
                  <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Fluxo de Caixa Projetado — Próximos {fluxoPeriodo} dias</CardTitle>
                          <CardDescription className="text-xs text-slate-500">Saldo atual + recebimentos previstos - pagamentos previstos</CardDescription>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                          {[30, 60, 90, 120, 180, 365].map(p => (
                            <button
                              key={p}
                              onClick={() => setFluxoPeriodo(p)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                                fluxoPeriodo === p
                                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                              }`}
                            >
                              {p <= 90 ? `${p}d` : p === 120 ? "4m" : p === 180 ? "6m" : "1a"}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                          <button onClick={() => setFluxoView("projetado")} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${fluxoView === "projetado" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                            Projetado
                          </button>
                          <button onClick={() => setFluxoView("entradas-saidas")} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${fluxoView === "entradas-saidas" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                            Entradas x Saídas
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[350px]">
                        {fluxoView === "projetado" ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={days} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                            <defs>
                              <linearGradient id="fluxoGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,100,0.15)" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const d = payload[0].payload as any;
                                return (
                                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
                                    <div className="font-semibold mb-1.5">{d.date?.split("-").reverse().join("/")}</div>
                                    <div className="flex justify-between gap-4"><span className="text-slate-500">Saldo atual:</span><span>{formatCurrency(d.saldo)}</span></div>
                                    <div className="flex justify-between gap-4"><span className="text-emerald-500">+ Recebimentos:</span><span className="text-emerald-600">{formatCurrency(d.receber)}</span></div>
                                    <div className="flex justify-between gap-4"><span className="text-amber-500">- Pagamentos:</span><span className="text-amber-600">{formatCurrency(d.pagar)}</span></div>
                                    <div className="flex justify-between gap-4 pt-1 border-t mt-1"><span className="font-semibold">Projetado:</span><span className={`font-bold ${d.projetado >= 0 ? "text-indigo-600" : "text-red-400"}`}>{formatCurrency(d.projetado)}</span></div>
                                    {(() => {
                                      const idx = days.findIndex(dd => dd.date === d.date);
                                      if (idx > 0) {
                                        const prev = days[idx - 1].projetado;
                                        const varAbs = d.projetado - prev;
                                        const varPct = prev !== 0 ? (varAbs / prev) * 100 : 0;
                                        return (
                                          <div className="flex justify-between gap-4 mt-0.5">
                                            <span className="text-slate-400">Var. dia:</span>
                                            <span className={`font-medium ${varAbs >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                                              {varAbs >= 0 ? "+" : ""}{formatCompactCurrency(varAbs)} ({varAbs >= 0 ? "+" : ""}{varPct.toFixed(1)}%)
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                );
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="projetado"
                              stroke="#6366f1"
                              strokeWidth={2.5}
                              fill="url(#fluxoGrad)"
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              dot={(props: any) => {
                                const { cx, cy, payload, index } = props;
                                const maxP = Math.max(...days.map(d => d.projetado));
                                const minP = Math.min(...days.map(d => d.projetado));
                                if (payload.projetado === maxP) {
                                  return (
                                    <g key={`fd-${index}`}>
                                      <circle cx={cx} cy={cy} r={6} fill="#10b981" stroke="#fff" strokeWidth={2} />
                                      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={9} fontWeight={700} fill="#10b981">{formatCompactCurrency(maxP)}</text>
                                    </g>
                                  );
                                }
                                if (payload.projetado === minP) {
                                  return (
                                    <g key={`fd-${index}`}>
                                      <circle cx={cx} cy={cy} r={6} fill="#f87171" stroke="#fff" strokeWidth={2} />
                                      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={9} fontWeight={700} fill="#f87171">{formatCompactCurrency(minP)}</text>
                                    </g>
                                  );
                                }
                                return <circle key={`fd-${index}`} cx={cx} cy={cy} r={2} fill="#6366f1" />;
                              }}
                              activeDot={{ r: 5, stroke: "#6366f1", strokeWidth: 2, fill: "#fff" }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                        ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={days} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                            <defs>
                              <linearGradient id="fluxoGradES" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,100,0.15)" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="bars" tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="line" orientation="right" tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const d = payload[0].payload as any;
                                return (
                                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
                                    <div className="font-semibold mb-1.5">{d.date?.split("-").reverse().join("/")}</div>
                                    <div className="flex justify-between gap-4"><span className="text-emerald-500">Recebimentos:</span><span className="font-semibold text-emerald-600">{formatCurrency(d.recDia)}</span></div>
                                    <div className="flex justify-between gap-4"><span className="text-amber-500">Pagamentos:</span><span className="font-semibold text-amber-600">{formatCurrency(d.pagDia)}</span></div>
                                    <div className="flex justify-between gap-4"><span className={d.recDia - d.pagDia >= 0 ? "text-emerald-500" : "text-red-400"}>Resultado dia:</span><span className={`font-semibold ${d.recDia - d.pagDia >= 0 ? "text-emerald-600" : "text-red-400"}`}>{formatCurrency(d.recDia - d.pagDia)}</span></div>
                                    <div className="flex justify-between gap-4 pt-1 border-t mt-1"><span className="font-semibold">Saldo projetado:</span><span className={`font-bold ${d.projetado >= 0 ? "text-indigo-600" : "text-red-400"}`}>{formatCurrency(d.projetado)}</span></div>
                                  </div>
                                );
                              }}
                            />
                            <Bar yAxisId="bars" dataKey="recDia" fill="#10b981" opacity={0.7} radius={[3, 3, 0, 0]} name="Recebimentos" />
                            <Bar yAxisId="bars" dataKey="pagDia" fill="#f59e0b" opacity={0.7} radius={[3, 3, 0, 0]} name="Pagamentos" />
                            <Line yAxisId="line" type="monotone" dataKey="projetado" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 2, fill: "#6366f1" }} name="Saldo Projetado" />
                          </ComposedChart>
                        </ResponsiveContainer>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Insight cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pico mínimo */}
              {(() => {
                const minDay = days.reduce((min, d) => d.projetado < min.projetado ? d : min, days[0]);
                const isNegative = minDay.projetado < 0;
                return (
                  <div className={`rounded-2xl p-4 border ${isNegative ? "bg-red-50 dark:bg-red-950/30 border-red-200/60 dark:border-red-800/40" : "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40"}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Ponto Crítico</p>
                    <p className={`text-lg font-black tabular-nums ${isNegative ? "text-red-600 dark:text-red-300/70" : "text-amber-700 dark:text-amber-400"}`}>{formatCurrency(minDay.projetado)}</p>
                    <p className="text-[10px] text-slate-400">em {minDay.label} — menor saldo projetado</p>
                  </div>
                );
              })()}

              {/* Cobertura */}
              {(() => {
                const diasCobertura = aPagar30d > 0 ? Math.floor((saldoTotal / aPagar30d) * 30) : 999;
                return (
                  <div className={`rounded-2xl p-4 border ${diasCobertura < 15 ? "bg-red-50 dark:bg-red-950/30 border-red-200/60 dark:border-red-800/40" : diasCobertura < 30 ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40" : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40"}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Cobertura de Caixa</p>
                    <p className={`text-lg font-black tabular-nums ${diasCobertura < 15 ? "text-red-600 dark:text-red-300/70" : diasCobertura < 30 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {diasCobertura > 365 ? "+365" : diasCobertura} dias
                    </p>
                    <p className="text-[10px] text-slate-400">saldo atual cobre pagamentos por este período</p>
                  </div>
                );
              })()}

              {/* Saldo final projetado */}
              <div className={`rounded-2xl p-4 border ${days[days.length - 1]?.projetado >= 0 ? "bg-sky-50 dark:bg-sky-950/30 border-sky-200/60 dark:border-sky-800/40" : "bg-red-50 dark:bg-red-950/30 border-red-200/60 dark:border-red-800/40"}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Saldo em {fluxoPeriodo} dias</p>
                <p className={`text-lg font-black tabular-nums ${days[days.length - 1]?.projetado >= 0 ? "text-sky-700 dark:text-sky-400" : "text-red-600 dark:text-red-300/70"}`}>
                  {formatCurrency(days[days.length - 1]?.projetado || 0)}
                </p>
                <p className="text-[10px] text-slate-400">projeção para {days[days.length - 1]?.label}</p>
              </div>
            </div>
                </>
              );
            })()}
          </div>
        );
      })()}

      {activeTab === "dre" && (
        <DreTab
          outcomeItems={consistentItems}
          incomeItems={consistentIncome}
          bankFees={allBankMovements}
          allBankMovements={allBankMovementsFull}
          selectedYears={selectedYears}
          selectedMonths={selectedMonths}
          selectedCompanies={selectedCompanies}
        />
      )}

      {/* ══════ SALDOS BANCÁRIOS TAB ══════ */}
      {/* ══════ SALDOS BANCÁRIOS TAB ══════ */}
      {activeTab === "saldos" && (
        <div className="space-y-6">
          {loadingBankAccounts ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando saldos bancarios...</span>
            </div>
          ) : (() => {
            // Account filter dropdown always shows ALL accounts (not filtered by company)
            const allAccountNums = Array.from(new Set(bankAccounts.map(a => String(a.bankAccountId)))).sort();
            const effectiveSelected = selectedBankAccounts.size > 0 ? selectedBankAccounts : new Set(allAccountNums);

            // Data display: apply BOTH company filter AND account filter
            const filteredAccounts = bankAccounts.filter(a => {
              if (!effectiveSelected.has(String(a.bankAccountId))) return false;
              if (selectedCompanies.size > 0 && !selectedCompanies.has(a.companyName)) return false;
              return true;
            });

            // Group by company
            const byCompany: Record<string, { companyName: string; accounts: typeof bankAccounts }> = {};
            for (const acc of filteredAccounts) {
              const key = acc.companyName || `Empresa ${acc.companyId}`;
              if (!byCompany[key]) byCompany[key] = { companyName: key, accounts: [] };
              byCompany[key].accounts.push(acc);
            }
            const companies = Object.values(byCompany).sort((a, b) => {
              const totalA = a.accounts.reduce((s, ac) => s + ac.currentBalance, 0);
              const totalB = b.accounts.reduce((s, ac) => s + ac.currentBalance, 0);
              return totalB - totalA;
            });
            const grandTotal = filteredAccounts.reduce((s, a) => s + a.currentBalance, 0);

            // Chart data
            const chartData = companies.map(c => ({
              name: c.companyName.length > 20 ? c.companyName.substring(0, 20) + "..." : c.companyName,
              fullName: c.companyName,
              value: c.accounts.reduce((s, a) => s + a.currentBalance, 0),
            }));

            const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#818cf8", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#c4b5fd", "#ddd6fe"];

            return (
              <>
                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Account filter - uses same MultiSelectFilter as Empresas */}
                  <MultiSelectFilter
                    label="Contas"
                    icon={<Landmark className="h-3.5 w-3.5" />}
                    allOptions={allAccountNums}
                    selected={selectedBankAccounts}
                    onToggle={(num) => {
                      setSelectedBankAccounts(prev => {
                        const next = new Set(prev);
                        if (next.has(num)) next.delete(num);
                        else next.add(num);
                        return next;
                      });
                    }}
                    onSelectAll={() => setSelectedBankAccounts(new Set(allAccountNums))}
                    onClear={() => setSelectedBankAccounts(new Set())}
                    activeColor="indigo"
                    labelFn={(id) => {
                      const acc = bankAccounts.find(a => String(a.bankAccountId) === id);
                      if (acc?.bankName) return `${acc.bankName} (${acc.accountNumber})`;
                      return acc?.accountNumber || id;
                    }}
                    subtitleFn={(id) => {
                      const acc = bankAccounts.find(a => String(a.bankAccountId) === id);
                      return acc?.companyName || "";
                    }}
                    onSaveDefault={() => {
                      localStorage.setItem("dashboard_saldos_accounts", JSON.stringify(Array.from(selectedBankAccounts)));
                      toast.success("Padrao de contas salvo!");
                    }}
                  />

                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Saldo do dia: <span className="font-semibold text-slate-700 dark:text-slate-200">{new Date().toLocaleDateString("pt-BR")}</span>
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-slate-500"
                    onClick={() => {
                      if (!window.confirm("Tem certeza que deseja resetar o filtro de contas para o padrão? Suas seleções atuais serão perdidas.")) return;
                      localStorage.removeItem("dashboard_saldos_accounts");
                      const validNums = new Set<string>(
                        bankAccounts
                          .filter(a => a.isInDimBanco)
                          .map(a => String(a.bankAccountId))
                      );
                      setSelectedBankAccounts(validNums);
                      localStorage.setItem("dashboard_saldos_accounts", JSON.stringify(Array.from(validNums)));
                      toast.success("Filtro resetado para padrao DimBanco!");
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Resetar padrao
                  </Button>
                </div>

                {/* KPI Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <Card className="relative border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-violet-600" />
                    <CardContent className="p-5 pt-6">
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Saldo Total</p>
                      <p className={`text-3xl font-black tabular-nums ${grandTotal >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-300/70"}`}>
                        {formatCurrency(grandTotal)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {filteredAccounts.length} contas em {companies.length} empresas
                        {selectedBankAccounts.size > 0 && selectedBankAccounts.size < allAccountNums.length && (
                          <span className="ml-1 text-indigo-500">({allAccountNums.length - selectedBankAccounts.size} excluídas)</span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Bar Chart */}
                  <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Saldo por Empresa</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 80, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,100,0.15)" />
                            <XAxis type="number" tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                            <RechartsTooltip
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              formatter={(value: any) => formatCurrency(Number(value))}
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              labelFormatter={(label: any) => {
                                const s = String(label);
                                const item = chartData.find(d => d.name === s);
                                return item?.fullName || s;
                              }}
                            />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                              {chartData.map((_entry, index) => (
                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                              ))}
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              <LabelList dataKey="value" position="right" formatter={(v: any) => formatCompactCurrency(Number(v))} style={{ fontSize: 11, fontWeight: 600 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Table */}
                  <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Contas por Empresa</CardTitle>
                      <CardDescription className="text-xs text-slate-500">Clique na empresa para ver as contas</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-800 text-slate-100">
                          <TableRow>
                            <TableHead className="text-slate-200 text-xs w-[40px]" />
                            <TableHead className="text-slate-200 text-xs">Empresa</TableHead>
                            <TableHead className="text-slate-200 text-xs text-right">Saldo Atual</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {companies.map((company) => {
                            const companyTotal = company.accounts.reduce((s, a) => s + a.currentBalance, 0);
                            const companyKey = company.companyName;
                            const isCompanyExpanded = expandedBankCompanies.has(companyKey);

                            // Group accounts by bank within company
                            const byBank: Record<string, typeof company.accounts> = {};
                            for (const acc of company.accounts) {
                              const bankKey = acc.bankName || acc.bankAccountDescription || "Outros";
                              if (!byBank[bankKey]) byBank[bankKey] = [];
                              byBank[bankKey].push(acc);
                            }
                            const banks = Object.entries(byBank).sort((a, b) => {
                              const tA = a[1].reduce((s, ac) => s + ac.currentBalance, 0);
                              const tB = b[1].reduce((s, ac) => s + ac.currentBalance, 0);
                              return tB - tA;
                            });

                            return (
                              <React.Fragment key={companyKey}>
                                {/* Level 1: Company */}
                                <TableRow
                                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                                  onClick={() => {
                                    setExpandedBankCompanies(prev => {
                                      const next = new Set(prev);
                                      if (next.has(companyKey)) next.delete(companyKey);
                                      else next.add(companyKey);
                                      return next;
                                    });
                                  }}
                                >
                                  <TableCell className="w-[40px] px-2">
                                    {isCompanyExpanded
                                      ? <ChevronDown className="h-4 w-4 text-slate-400" />
                                      : <ChevronRight className="h-4 w-4 text-slate-400" />
                                    }
                                  </TableCell>
                                  <TableCell className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {company.companyName}
                                  </TableCell>
                                  <TableCell className={`text-sm font-bold text-right tabular-nums ${companyTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-300/60"}`}>
                                    {formatCurrency(companyTotal)}
                                  </TableCell>
                                </TableRow>

                                {/* Level 2: Banks within company */}
                                {isCompanyExpanded && banks.map(([bankName, bankAccts]) => {
                                  const bankTotal = bankAccts.reduce((s, a) => s + a.currentBalance, 0);
                                  const bankKey = `${companyKey}::${bankName}`;
                                  const isBankExpanded = expandedBankCompanies.has(bankKey);
                                  return (
                                    <React.Fragment key={bankKey}>
                                      <TableRow
                                        className="cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        onClick={() => {
                                          setExpandedBankCompanies(prev => {
                                            const next = new Set(prev);
                                            if (next.has(bankKey)) next.delete(bankKey);
                                            else next.add(bankKey);
                                            return next;
                                          });
                                        }}
                                      >
                                        <TableCell className="w-[40px] px-2 pl-6">
                                          {isBankExpanded
                                            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                            : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                          }
                                        </TableCell>
                                        <TableCell className="text-xs font-semibold text-slate-600 dark:text-slate-300 pl-6">
                                          <Landmark className="h-3.5 w-3.5 inline-block mr-1.5 text-slate-400" />
                                          {bankName}
                                          <Badge variant="secondary" className="ml-2 text-[10px] px-1">{bankAccts.length}</Badge>
                                        </TableCell>
                                        <TableCell className={`text-xs font-bold text-right tabular-nums ${bankTotal >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-500 dark:text-red-300/60"}`}>
                                          {formatCurrency(bankTotal)}
                                        </TableCell>
                                      </TableRow>

                                      {/* Level 3: Individual accounts */}
                                      {isBankExpanded && bankAccts
                                        .sort((a, b) => b.currentBalance - a.currentBalance)
                                        .map(acc => (
                                          <TableRow key={acc.bankAccountId} className="bg-white dark:bg-slate-900">
                                            <TableCell />
                                            <TableCell className="text-[11px] text-slate-500 dark:text-slate-400 pl-12 font-mono">
                                              {acc.accountNumber}
                                            </TableCell>
                                            <TableCell className={`text-[11px] font-semibold text-right tabular-nums ${acc.currentBalance >= 0 ? "text-slate-600 dark:text-slate-400" : "text-red-500 dark:text-red-300/60"}`}>
                                              {formatCurrency(acc.currentBalance)}
                                            </TableCell>
                                          </TableRow>
                                        ))
                                      }
                                    </React.Fragment>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                          {/* Total row */}
                          <TableRow className="bg-indigo-50 dark:bg-indigo-950/40 border-t-2 border-indigo-200 dark:border-indigo-800">
                            <TableCell />
                            <TableCell className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Total</TableCell>
                            <TableCell className="text-sm font-black text-right tabular-nums text-indigo-700 dark:text-indigo-300">
                              {formatCurrency(grandTotal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                {/* Daily Balance Line Chart */}
                {(() => {
                  // Compute line data before rendering so we can use it in the header
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  let lineData: any[] = [];
                  if (dailyBalances) {
                    const sortedDates = Object.keys(dailyBalances).sort();
                    const validAccountIds = new Set(filteredAccounts.map(a => String(a.bankAccountId)));

                    // Build compare data indexed by day number
                    const compareByDay: Record<string, number> = {};
                    if (compareBalances && saldosCompareMonth) {
                      const compareDates = Object.keys(compareBalances).sort();
                      for (const cd of compareDates) {
                        const dayNum = cd.split("-")[2];
                        const total = (compareBalances[cd] || [])
                          .filter(a => validAccountIds.has(a.accountId))
                          .reduce((s, a) => s + a.amount, 0);
                        if (total !== 0) compareByDay[dayNum] = total;
                      }
                    }

                    lineData = sortedDates.map(date => {
                      const dayAccounts = dailyBalances[date] || [];
                      const total = dayAccounts
                        .filter(a => validAccountIds.has(a.accountId))
                        .reduce((s, a) => s + a.amount, 0);
                      const dayNum = date.split("-")[2];
                      return { date: dayNum, fullDate: date, total, compare: compareByDay[dayNum] ?? null };
                    }).filter(d => d.total !== 0);

                    // Ensure last point matches the card total (grandTotal) for current month
                    const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                    if (lineData.length > 0 && (saldosMonth === nowMonth || saldosMonth === "last7") && grandTotal > 0) {
                      lineData[lineData.length - 1].total = grandTotal;
                    }
                  }
                  const firstVal = lineData.length > 0 ? lineData[0].total : 0;
                  const lastVal = lineData.length > 0 ? lineData[lineData.length - 1].total : 0;
                  const varAbs = lastVal - firstVal;
                  const varPct = firstVal !== 0 ? (varAbs / firstVal) * 100 : 0;
                  const isPositiveVar = varAbs >= 0;

                  return (
                <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          Evolução do Saldo — {saldosMonth === "last7" ? "Últimos 7 dias" : (() => {
                            const [y, m] = saldosMonth.split("-");
                            const d = new Date(parseInt(y), parseInt(m) - 1);
                            return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                          })()}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">Saldo dia a dia das contas selecionadas</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Month selector */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                          <button
                            onClick={() => setSaldosMonth("last7")}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${saldosMonth === "last7" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                          >
                            7 dias
                          </button>
                          {(() => {
                            const now = new Date();
                            const months: string[] = [];
                            for (let i = 2; i >= 0; i--) {
                              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                              months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                            }
                            return months.map(m => {
                              const [y, mo] = m.split("-");
                              const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                              return (
                                <button
                                  key={m}
                                  onClick={() => setSaldosMonth(m)}
                                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${saldosMonth === m ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                  {label}
                                </button>
                              );
                            });
                          })()}
                        </div>

                        {/* Compare selector */}
                        {saldosMonth !== "last7" && (
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                            <span className="text-[10px] text-slate-400 px-1">vs</span>
                            <button
                              onClick={() => setSaldosCompareMonth(null)}
                              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${!saldosCompareMonth ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              —
                            </button>
                            {(() => {
                              const now = new Date();
                              const months: string[] = [];
                              for (let i = 5; i >= 1; i--) {
                                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                              }
                              return months.filter(m => m !== saldosMonth).map(m => {
                                const [y, mo] = m.split("-");
                                const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                                return (
                                  <button
                                    key={m}
                                    onClick={() => setSaldosCompareMonth(m)}
                                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${saldosCompareMonth === m ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                  >
                                    {label}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                      {lineData.length > 1 && (
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Variação no mês</div>
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-xs text-slate-500">{formatCompactCurrency(firstVal)}</span>
                              <span className="text-xs text-slate-400">→</span>
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatCompactCurrency(lastVal)}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-xs px-2 py-1 font-semibold rounded-full ${
                            isPositiveVar
                              ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                              : "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300/70"
                          }`}>
                            {isPositiveVar ? <TrendingUp className="h-3.5 w-3.5 mr-1" /> : <TrendingDown className="h-3.5 w-3.5 mr-1" />}
                            {isPositiveVar ? "+" : ""}{varPct.toFixed(1)}% ({isPositiveVar ? "+" : ""}{formatCurrency(varAbs)})
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingDaily ? (
                      <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Carregando evolução diária...</span>
                      </div>
                    ) : dailyBalances && lineData.length > 0 ? (() => {

                      // Enrich with previous day and daily variation
                      for (let i = 0; i < lineData.length; i++) {
                        const prev = i > 0 ? lineData[i - 1].total : lineData[i].total;
                        (lineData[i] as Record<string, unknown>).prevTotal = prev;
                        (lineData[i] as Record<string, unknown>).dayVar = lineData[i].total - prev;
                        (lineData[i] as Record<string, unknown>).dayVarPct = prev !== 0 ? ((lineData[i].total - prev) / prev) * 100 : 0;
                      }

                      // Find max and min values for highlighting
                      const maxVal = Math.max(...lineData.map(d => d.total));
                      const minVal = Math.min(...lineData.map(d => d.total));

                      // Custom dot renderer: green for max, red for min, default for others
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const renderDot = (props: any) => {
                        const { cx, cy, payload } = props;
                        const dayVarPct = payload.dayVarPct || 0;
                        const showVarLabel = Math.abs(dayVarPct) >= 0.1 && payload.dayVar !== 0;
                        const varColor = dayVarPct >= 0 ? "#10b981" : "#f87171";
                        const varLabel = `${dayVarPct >= 0 ? "+" : ""}${dayVarPct.toFixed(1)}%`;

                        if (payload.total === maxVal) {
                          return (
                            <g key={`dot-${payload.date}`}>
                              <circle cx={cx} cy={cy} r={7} fill="#10b981" stroke="#fff" strokeWidth={2} />
                              <text x={cx} y={cy - 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#10b981">
                                {formatCompactCurrency(maxVal)}
                              </text>
                            </g>
                          );
                        }
                        if (payload.total === minVal) {
                          return (
                            <g key={`dot-${payload.date}`}>
                              <circle cx={cx} cy={cy} r={7} fill="#f87171" stroke="#fff" strokeWidth={2} />
                              <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fontWeight={700} fill="#f87171">
                                {formatCompactCurrency(minVal)}
                              </text>
                            </g>
                          );
                        }
                        return (
                          <g key={`dot-${payload.date}`}>
                            <circle cx={cx} cy={cy} r={3} fill="#6366f1" />
                            {showVarLabel && (
                              <text x={cx} y={cy - 10} textAnchor="middle" fontSize={9} fontWeight={600} fill={varColor}>
                                {varLabel}
                              </text>
                            )}
                          </g>
                        );
                      };

                      return (
                        <div className="h-[350px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={lineData} margin={{ left: 10, right: 10, top: 25, bottom: 5 }}>
                              <defs>
                                <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,100,0.15)" />
                              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                              <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} />
                              <RechartsTooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload || payload.length === 0) return null;
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const data = payload[0].payload as any;
                                  const dayVar = data.dayVar || 0;
                                  const dayVarPct = data.dayVarPct || 0;
                                  const isUp = dayVar >= 0;
                                  return (
                                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
                                      <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                                        {data.fullDate?.split("-").reverse().join("/")}
                                      </div>
                                      <div className="flex justify-between gap-4 mb-1">
                                        <span className="text-slate-500">Saldo:</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(data.total)}</span>
                                      </div>
                                      <div className="flex justify-between gap-4 mb-1">
                                        <span className="text-slate-500">Dia anterior:</span>
                                        <span className="text-slate-600 dark:text-slate-400">{formatCurrency(data.prevTotal)}</span>
                                      </div>
                                      <div className="flex justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-700">
                                        <span className="text-slate-500">Variação:</span>
                                        <span className={`font-semibold ${isUp ? "text-emerald-600" : "text-red-400"}`}>
                                          {isUp ? "+" : ""}{formatCurrency(dayVar)} ({isUp ? "+" : ""}{dayVarPct.toFixed(1)}%)
                                        </span>
                                      </div>
                                      {data.compare !== null && data.compare !== undefined && (() => {
                                        const diff = data.total - data.compare;
                                        const diffPct = data.compare !== 0 ? (diff / data.compare) * 100 : 0;
                                        return (
                                          <div className="flex justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
                                            <span className="text-amber-500">vs comparação:</span>
                                            <span className={`font-semibold ${diff >= 0 ? "text-emerald-600" : "text-red-400"}`}>
                                              {diff >= 0 ? "+" : ""}{formatCompactCurrency(diff)} ({diff >= 0 ? "+" : ""}{diffPct.toFixed(1)}%)
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#6366f1"
                                strokeWidth={2.5}
                                fill="url(#saldoGradient)"
                                dot={renderDot}
                                activeDot={{ r: 6, stroke: "#6366f1", strokeWidth: 2, fill: "#fff" }}
                              />
                              {saldosCompareMonth && (
                                <Line
                                  type="monotone"
                                  dataKey="compare"
                                  stroke="#f59e0b"
                                  strokeWidth={2}
                                  strokeDasharray="6 3"
                                  dot={{ r: 2, fill: "#f59e0b" }}
                                  connectNulls={false}
                                  name="Comparação"
                                />
                              )}
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })() : (
                      <p className="text-sm text-slate-400 text-center py-12">Dados diários não disponíveis</p>
                    )}
                  </CardContent>
                </Card>
                  );
                })()}
              </>
            );
          })()}
        </div>
      )}

      {/* ══════ RESUMO FINANCEIRO TAB ══════ */}
      {activeTab === "resumo" && (() => {
        // Collect all operation types from outcome payments
        const allOpTypes = Array.from(new Set(
          consistentItems.flatMap(item => (item.payments || []).map(p => p.operationTypeName).filter(Boolean))
        )).sort() as string[];

        // Collect all operation types from income payments
        const allOpTypesRec = Array.from(new Set(
          consistentIncome.flatMap(item => (item.payments || []).map(p => p.operationTypeName).filter(Boolean))
        )).sort() as string[];

        // Initialize outcome filter on first render
        if (!resumoTipoOpInit && allOpTypes.length > 0) {
          const saved = localStorage.getItem("resumo_default_tipoOp");
          if (saved) {
            setResumoTipoOp(new Set(JSON.parse(saved)));
          } else {
            setResumoTipoOp(new Set(allOpTypes));
          }
          setResumoTipoOpInit(true);
        }

        // Initialize income filter on first render
        if (!resumoTipoOpRecInit && allOpTypesRec.length > 0) {
          const saved = localStorage.getItem("resumo_default_tipoOpRec");
          if (saved) {
            setResumoTipoOpRec(new Set(JSON.parse(saved)));
          } else {
            setResumoTipoOpRec(new Set(allOpTypesRec));
          }
          setResumoTipoOpRecInit(true);
        }

        // Build per-company financial summary
        const companySummary: Record<string, {
          companyName: string;
          totalRecebido: number;
          totalPago: number;
          totalAReceber: number;
          qtDisp: number;
          qtResTec: number;
          valorEstoque: number;
          status: string;
        }> = {};

        // All unique company names from all data (filtered by selectedCompanies if active)
        const allCos = new Set<string>();
        consistentItems.forEach(i => allCos.add(i.companyName));
        consistentIncome.forEach(i => allCos.add(i.companyName));
        companySettings.forEach(cs => allCos.add(cs.companyName));

        // Apply company filter
        const filteredCos = selectedCompanies.size > 0
          ? new Set([...allCos].filter(co => selectedCompanies.has(co)))
          : allCos;

        for (const co of filteredCos) {
          companySummary[co] = {
            companyName: co,
            totalRecebido: 0,
            totalPago: 0,
            totalAReceber: 0,
            qtDisp: 0,
            qtResTec: 0,
            valorEstoque: 0,
            status: companySettings.find(cs => cs.companyName === co)?.status || "Ativa",
          };
        }

        // Total Recebido (income payments) — filtered by year/month and resumoTipoOpRec
        consistentIncome.forEach(item => {
          const co = item.companyName;
          if (!companySummary[co]) return;
          (item.payments || []).forEach(p => {
            if (p.netAmount > 0 && p.paymentDate) {
              if (selectedYears.size > 0 && !selectedYears.has(p.paymentDate.substring(0, 4))) return;
              if (selectedMonths.size > 0 && !selectedMonths.has(p.paymentDate.substring(5, 7))) return;
              if (resumoTipoOpRec.size > 0 && !(p.operationTypeName && resumoTipoOpRec.has(p.operationTypeName))) return;
              companySummary[co].totalRecebido += p.netAmount;
            }
          });
        });

        // Total Pago — filtered by resumoTipoOp AND selectedDocTypes
        // Excludes previsão documents (same as Contas Pagas)
        consistentItems.forEach(item => {
          const co = item.companyName;
          if (!companySummary[co]) return;
          // Apply doc type filter (same as Contas Pagas header filter)
          if (selectedDocTypes.size > 0) {
            const tipo = (item.documentIdentificationId || "").trim();
            if (!selectedDocTypes.has(tipo)) return;
          }
          // Always exclude previsão documents
          const docName = (item.documentIdentificationName || "").toUpperCase();
          if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) return;
          (item.payments || []).forEach(p => {
            if (p.netAmount !== 0 && p.paymentDate) {
              // Apply year filter
              if (selectedYears.size > 0 && !selectedYears.has(p.paymentDate.substring(0, 4))) return;
              // Apply month filter
              if (selectedMonths.size > 0 && !selectedMonths.has(p.paymentDate.substring(5, 7))) return;
              if (resumoTipoOp.size > 0 && !(p.operationTypeName && resumoTipoOp.has(p.operationTypeName))) return;
              companySummary[co].totalPago += p.netAmount;
            }
          });
        });

        // Add detached bank movements (tarifas bancárias) to Total Pago — filtered by year/month
        const incomePatterns = ["rendimento", "aplicação", "aplicacao", "resgate"];
        allBankMovements.forEach(bm => {
          const co = bm.companyName;
          if (!companySummary[co]) return;
          if (bm.bankMovementAmount === 0) return;
          if (!bm.bankMovementDate) return;
          if (selectedYears.size > 0 && !selectedYears.has(bm.bankMovementDate.substring(0, 4))) return;
          if (selectedMonths.size > 0 && !selectedMonths.has(bm.bankMovementDate.substring(5, 7))) return;
          const historic = (bm.bankMovementHistoricName || "").toLowerCase();
          if (incomePatterns.some(p => historic.includes(p))) return;
          const catNames = (bm.financialCategories || []).map(fc => (fc.financialCategoryName || "").toLowerCase()).join(" ");
          if (incomePatterns.some(p => catNames.includes(p))) return;
          companySummary[co].totalPago += Math.abs(bm.bankMovementAmount);
        });

        // Total a Receber
        consistentIncome.forEach(item => {
          const co = item.companyName;
          if (!companySummary[co]) return;
          if (item.balanceAmount > 0) {
            companySummary[co].totalAReceber += item.balanceAmount;
          }
        });

        // Units: Qt. Disponíveis, Res. Técnica, Valor Estoque
        // Only count "Apartamento" type units (exclude vagas, salas, lojas, etc.)
        const isApartamento = (name: string): boolean => {
          const n = name.toUpperCase();
          if (/VAGA|GARAGEM|ESTACION/i.test(n)) return false;
          if (/\bSL\b|\bSALA\b|COMERCIAL/i.test(n)) return false;
          if (/\bLJ\b|\bLOJA\b/i.test(n)) return false;
          if (/\bDEP\b|DEPOSITO|\bBOX\b/i.test(n)) return false;
          return true;
        };
        apiUnits.forEach(u => {
          const co = u.companyName;
          if (!companySummary[co]) return;
          if (!isApartamento(u.name)) return;
          if (u.commercialStock === "Disponível") {
            companySummary[co].qtDisp++;
            companySummary[co].valorEstoque += u.privateArea * (companySettings.find(cs => cs.companyName === co)?.factor || 0) * (cubData?.currentValue || 0);
          } else if (u.commercialStock === "Reserva Técnica") {
            companySummary[co].qtResTec++;
          }
        });

        // Sort: Ativa first, then by selected field
        const toggleResumoSort = (field: string) => {
          setResumoSort(prev => prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" });
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getVal = (c: any, field: string): number => {
          if (field === "lucroRealizado") return c.totalRecebido - c.totalPago;
          if (field === "lucroPotencial") return c.totalAReceber + c.valorEstoque;
          if (field === "lucratividade") return c.totalRecebido > 0 ? (c.totalRecebido - c.totalPago) / c.totalRecebido * 100 : 0;
          if (field === "companyName") return 0; // handled separately
          return c[field] || 0;
        };
        const sorted = Object.values(companySummary)
          .filter(c => c.totalRecebido > 0 || c.totalPago > 0 || c.totalAReceber > 0)
          .sort((a, b) => {
            const aFin = a.status.toLowerCase().includes("finalizada");
            const bFin = b.status.toLowerCase().includes("finalizada");
            if (aFin !== bFin) return aFin ? 1 : -1;
            const { field, dir } = resumoSort;
            let cmp: number;
            if (field === "companyName") {
              cmp = a.companyName.localeCompare(b.companyName);
            } else {
              cmp = getVal(a, field) - getVal(b, field);
            }
            return dir === "desc" ? -cmp : cmp;
          });

        // Totals
        const totRecebido = sorted.reduce((s, c) => s + c.totalRecebido, 0);
        const totPago = sorted.reduce((s, c) => s + c.totalPago, 0);
        const totSaldo = totRecebido - totPago;
        const totLucratividade = totRecebido > 0 ? (totSaldo / totRecebido) * 100 : 0;

        return (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <MultiSelectFilter
                label="Tipo Op. Pagar"
                icon={<ArrowDown className="h-3.5 w-3.5" />}
                allOptions={allOpTypes}
                selected={resumoTipoOp}
                onToggle={(name) => { setResumoTipoOp(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); }}
                onSelectAll={() => setResumoTipoOp(new Set(allOpTypes))}
                onClear={() => setResumoTipoOp(new Set())}
                activeColor="rose"
                onSaveDefault={() => {
                  localStorage.setItem("resumo_default_tipoOp", JSON.stringify([...resumoTipoOp]));
                  toast.success("Padrão de tipo operação (pagar) salvo!");
                }}
              />
              {resumoTipoOp.size > 0 && resumoTipoOp.size < allOpTypes.length && (
                <span className="text-xs text-slate-500">{resumoTipoOp.size}/{allOpTypes.length} pag.</span>
              )}
              <MultiSelectFilter
                label="Tipo Op. Receber"
                icon={<ArrowDown className="h-3.5 w-3.5" />}
                allOptions={allOpTypesRec}
                selected={resumoTipoOpRec}
                onToggle={(name) => { setResumoTipoOpRec(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }); }}
                onSelectAll={() => setResumoTipoOpRec(new Set(allOpTypesRec))}
                onClear={() => setResumoTipoOpRec(new Set())}
                activeColor="emerald"
                onSaveDefault={() => {
                  localStorage.setItem("resumo_default_tipoOpRec", JSON.stringify([...resumoTipoOpRec]));
                  toast.success("Padrão de tipo operação (receber) salvo!");
                }}
              />
              {resumoTipoOpRec.size > 0 && resumoTipoOpRec.size < allOpTypesRec.length && (
                <span className="text-xs text-slate-500">{resumoTipoOpRec.size}/{allOpTypesRec.length} rec.</span>
              )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="relative rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Total Recebido</p>
                <p className="text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(totRecebido)}</p>
              </div>
              <div className="relative rounded-2xl p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Total Pago</p>
                <p className="text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(totPago)}</p>
              </div>
              <div className={`relative rounded-2xl p-4 ${totSaldo >= 0 ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/40" : "bg-red-50 dark:bg-red-950/40 border-red-200/60 dark:border-red-800/40"} border overflow-hidden`}>
                <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${totSaldo >= 0 ? "from-blue-500 to-indigo-500" : "from-red-400 to-rose-500"}`} />
                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Saldo</p>
                <p className={`text-xl font-black tabular-nums ${totSaldo >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-600 dark:text-red-300/70"}`}>{formatCurrency(totSaldo)}</p>
              </div>
              <div className="relative rounded-2xl p-4 bg-violet-50 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/40 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 to-purple-500" />
                <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Lucratividade</p>
                <p className="text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{totLucratividade.toFixed(2)}%</p>
              </div>
            </div>

            {/* Table */}
            <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-800 text-slate-100 sticky top-0 z-10">
                      <TableRow>
                        {[
                          { field: "companyName", label: "Empresa", align: "left", minW: "180px", sticky: true },
                          { field: "totalRecebido", label: "Total Recebido", align: "right", minW: "130px" },
                          { field: "totalPago", label: "Total Pago", align: "right", minW: "130px" },
                          { field: "lucroRealizado", label: "Lucro Realizado", align: "right", minW: "130px" },
                          { field: "totalAReceber", label: "Total a Receber", align: "right", minW: "130px" },
                          { field: "valorEstoque", label: "Valor Estoque", align: "right", minW: "120px" },
                          { field: "lucroPotencial", label: "Lucro Potencial", align: "right", minW: "130px" },
                          { field: "qtDisp", label: "Disp.", align: "center", minW: "60px" },
                          { field: "qtResTec", label: "Res.Téc.", align: "center", minW: "60px" },
                          { field: "lucratividade", label: "Lucratividade", align: "right", minW: "100px" },
                          { field: "status", label: "Status", align: "center", minW: "80px" },
                        ].map(col => (
                          <TableHead
                            key={col.field}
                            className={`text-[11px] font-bold cursor-pointer hover:bg-slate-700 transition-colors ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.sticky ? "sticky left-0 bg-slate-800 z-20" : ""}`}
                            style={{ minWidth: col.minW }}
                            onClick={() => toggleResumoSort(col.field)}
                          >
                            <span className="inline-flex items-center gap-1 text-slate-200">
                              {col.label}
                              {resumoSort.field === col.field ? (
                                resumoSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                              )}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map(co => {
                        const lucroRealizado = co.totalRecebido - co.totalPago;
                        const lucroPotencial = co.totalAReceber + co.valorEstoque;
                        const lucratividade = co.totalRecebido > 0 ? (lucroRealizado / co.totalRecebido) * 100 : 0;
                        const isFinalizada = co.status.toLowerCase().includes("finalizada");

                        return (
                          <TableRow key={co.companyName} className={isFinalizada ? "bg-slate-50/50 dark:bg-slate-800/30 opacity-70" : "hover:bg-slate-50 dark:hover:bg-slate-800"}>
                            <TableCell className="text-xs font-semibold text-slate-700 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-900 z-10">
                              {co.companyName}
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(co.totalRecebido)}</TableCell>
                            <TableCell className="text-xs font-semibold text-right tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(co.totalPago)}</TableCell>
                            <TableCell className={`text-xs font-bold text-right tabular-nums ${lucroRealizado >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-300/70"}`}>
                              {formatCurrency(lucroRealizado)}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(co.totalAReceber)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-slate-600 dark:text-slate-400">{co.valorEstoque > 0 ? formatCurrency(co.valorEstoque) : "-"}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-slate-600 dark:text-slate-400">{lucroPotencial > 0 ? formatCurrency(lucroPotencial) : "-"}</TableCell>
                            <TableCell className="text-xs text-center tabular-nums font-semibold text-slate-600 dark:text-slate-400">{co.qtDisp > 0 ? co.qtDisp : "-"}</TableCell>
                            <TableCell className="text-xs text-center tabular-nums text-slate-500">{co.qtResTec > 0 ? co.qtResTec : "-"}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${lucratividade >= 80 ? "bg-emerald-500" : lucratividade >= 50 ? "bg-blue-500" : lucratividade >= 20 ? "bg-amber-500" : "bg-red-400"}`}
                                    style={{ width: `${Math.min(100, Math.max(0, lucratividade))}%` }}
                                  />
                                </div>
                                <span className={`font-semibold ${lucratividade >= 50 ? "text-emerald-600 dark:text-emerald-400" : lucratividade >= 20 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-300/70"}`}>
                                  {lucratividade.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={isFinalizada ? "secondary" : "outline"} className={`text-[10px] ${isFinalizada ? "bg-slate-200 dark:bg-slate-700 text-slate-500" : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"}`}>
                                {co.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Total Row */}
                      <TableRow className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                        <TableCell className="text-sm font-bold text-slate-800 dark:text-slate-100 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">Total</TableCell>
                        <TableCell className="text-sm font-black text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(totRecebido)}</TableCell>
                        <TableCell className="text-sm font-black text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(totPago)}</TableCell>
                        <TableCell className={`text-sm font-black text-right tabular-nums ${totSaldo >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-300/70"}`}>{formatCurrency(totSaldo)}</TableCell>
                        <TableCell className="text-sm font-black text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatCurrency(sorted.reduce((s, c) => s + c.totalAReceber, 0))}
                        </TableCell>
                        <TableCell className="text-sm font-black text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatCurrency(sorted.reduce((s, c) => s + c.valorEstoque, 0))}
                        </TableCell>
                        <TableCell className="text-sm font-black text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatCurrency(sorted.reduce((s, c) => s + c.totalAReceber + c.valorEstoque, 0))}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-center tabular-nums text-slate-700 dark:text-slate-300">{sorted.reduce((s, c) => s + c.qtDisp, 0)}</TableCell>
                        <TableCell className="text-sm font-bold text-center tabular-nums text-slate-600 dark:text-slate-400">{sorted.reduce((s, c) => s + c.qtResTec, 0)}</TableCell>
                        <TableCell className="text-sm font-black text-right tabular-nums text-violet-700 dark:text-violet-400">{totLucratividade.toFixed(2)}%</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

    </div>
  );
}
