"use client";

import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// Select removed - year filter now uses MultiSelectFilter
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  CalendarDays,
  X,
  Users,
  Banknote,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ruler,
  FileDown,
  BarChart3,
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
import { formatCurrency, formatCompactCurrency, formatDate, MONTH_LABELS, getEstornoPairs, isExcludedFinancialDocType, effectiveOpenAmount, shouldKeepIncomeExcludedDoc } from "@/lib/dashboard-utils";
import { generateContasPagarPDF } from "@/lib/pdf-contas-pagar";
import { DreTab } from "@/components/dre-tab";
import { IndicadoresTab } from "@/components/indicadores/indicadores-tab";
import { CalendarioPagamentoTab } from "@/components/calendario-pagamento-tab";
import { CalendarioRecebimentoTab } from "@/components/calendario-recebimento-tab";
import { ComparativoTab } from "@/components/comparativo-tab";
import { DetalhamentoTable } from "@/components/detalhamento-table";
import { useCompanyMode } from "@/lib/company-context";
import { MultiSelectFilter, CustomTooltip } from "@/components/multi-select-filter";
import type { ApiUnit } from "@/lib/comercial-utils";

type Section = "cp" | "cr";
type MainTab = "visao-geral" | "a-pagar" | "pagas" | "atrasadas" | "calendario-pagamento" | "a-receber" | "recebidas" | "inadimplencia" | "calendario-recebimento" | "orcamento" | "dre" | "dre-api" | "saldos" | "resumo" | "indicadores" | "comparativo";

// Each tab group has its own saved company filter
function getTabGroup(tab: MainTab): string {
  switch (tab) {
    case "a-pagar": case "pagas": case "atrasadas": case "calendario-pagamento": return "cp";
    case "a-receber": case "recebidas": case "inadimplencia": case "calendario-recebimento": return "cr";
    case "visao-geral": return "visao-geral";
    case "resumo": return "resumo";
    case "dre-api": return "dre-api";
    case "indicadores": return "indicadores";
    default: return tab;
  }
}
function companyStorageKey(tab: MainTab): string {
  return `dashboard_companies_${getTabGroup(tab)}`;
}

// Aluguel (locação) — MESMA regra da página Aluguéis (src/lib/alugueis-utils.ts:
// isAluguel), duplicada de propósito para não importar aqui o módulo isolado da
// Holding. Título de RECEBER com documento LOC/LNC E categoria financeira
// 10513/10514 (Receita de locação PF/PJ). Usada só no modo Holding, para trazer
// os aluguéis de Silva Packer e Sul Brasil ao CR do Painel (consolidação do
// grupo). Se um dia a regra de aluguel mudar em alugueis-utils, ajustar aqui também.
const ALUGUEL_DOC_IDS_CR = new Set(["LOC", "LNC"]);
const ALUGUEL_CATEGORY_IDS_CR = new Set(["10513", "10514"]);
function isAluguelIncome(i: SiengeIncome): boolean {
  if (!ALUGUEL_DOC_IDS_CR.has((i.documentIdentificationId || "").trim())) return false;
  return (i.paymentsCategories || []).some((c) =>
    ALUGUEL_CATEGORY_IDS_CR.has(String(c.financialCategoryId || "").trim())
  );
}
type ChartView = "mensal" | "anual" | "diario";

// === Stepper inline pra editar Fator do empreendimento ===
// Setinhas ↑ ↓ ajustam o fator em passos de 0.05. Debounce 600ms — apos parar
// de clicar, salva via PUT /api/company-settings. Spinner enquanto salva.
const FACTOR_STEP = 0.05;
const FACTOR_MIN = 0.05;
const FACTOR_MAX = 9.99;

function FactorInput({
  companyId, companyName, areaM2, status, controlaOrcamento, value, onSaved,
}: {
  companyId: number;
  companyName: string;
  areaM2: number;
  status: string;
  controlaOrcamento: boolean;
  value: number;
  onSaved: (newFactor: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(value);

  // Sincroniza com value externo se mudou (apos save remoto ou refresh)
  React.useEffect(() => {
    setLocal(value);
    lastSavedRef.current = value;
  }, [value]);

  const scheduleSave = useCallback((newFactor: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (Math.round(newFactor * 100) === Math.round(lastSavedRef.current * 100)) return;
      setSaving(true);
      try {
        const r = await fetch("/api/company-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, companyName, areaM2, factor: newFactor, status, controlaOrcamento }),
        });
        if (r.ok) {
          lastSavedRef.current = newFactor;
          onSaved(newFactor);
          toast.success(`Fator de ${companyName} salvo`);
        } else {
          toast.error("Erro ao salvar fator");
          setLocal(lastSavedRef.current);
        }
      } catch {
        toast.error("Erro de rede ao salvar fator");
        setLocal(lastSavedRef.current);
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [companyId, companyName, areaM2, status, controlaOrcamento, onSaved]);

  const adjust = (delta: number) => {
    const next = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, Math.round((local + delta) * 100) / 100));
    setLocal(next);
    scheduleSave(next);
  };

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-[13px] font-medium text-slate-700 tabular-nums w-10 text-right">
        {local.toFixed(2)}
      </span>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => adjust(FACTOR_STEP)}
          disabled={saving || local >= FACTOR_MAX}
          className="text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none p-0.5"
          aria-label="Aumentar fator"
        >
          <ChevronUp className="h-3 w-3" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => adjust(-FACTOR_STEP)}
          disabled={saving || local <= FACTOR_MIN}
          className="text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none p-0.5"
          aria-label="Diminuir fator"
        >
          <ChevronDown className="h-3 w-3" strokeWidth={3} />
        </button>
      </div>
      {saving && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
    </div>
  );
}

export function ExecutiveDashboard() {
  const currentYear = new Date().getFullYear();
  const { isHolding, holdingName } = useCompanyMode();
  // Detecta tema para ajustar cores dos charts SVG (não respondem a CSS dark:).
  // Dark mode usa vermelho/cinza mais claros pra reduzir contraste.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const chartColors = useMemo(() => ({
    red: isDark ? "#fca5a5" : "#f87171",        // red-300 dark, red-400 light
    green: isDark ? "#86efac" : "#16a34a",       // green-300 dark, green-600 light
    valueText: isDark ? "#cbd5e1" : "#334155",   // slate-300 dark, slate-700 light
    mutedText: isDark ? "#94a3b8" : "#475569",   // slate-400 dark, slate-600 light
    // Linhas pontilhadas do grid: quase invisiveis no dark pra nao poluir
    gridStroke: isDark ? "rgba(148,163,184,0.08)" : "#e2e8f0",
  }), [isDark]);
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
  // Increments on every "Atualizar" click — passed to DreTab as refreshKey
  // to force re-fetch of /api/dre-supplementary (the DRE pulls from Excel/DB
  // independently of the Sienge cache, so the main fetchData doesn't reach it).
  const [refreshKey, setRefreshKey] = useState(0);
  type StepStatus = "pending" | "running" | "done" | "error";
  const [refreshSteps, setRefreshSteps] = useState<{ label: string; detail?: string; status: StepStatus }[]>([]);
  const [lastUpdatedCp, setLastUpdatedCp] = useState<string | null>(null);
  const [lastUpdatedCr, setLastUpdatedCr] = useState<string | null>(null);
  const [salesContracts, setSalesContracts] = useState<SiengeSalesContract[]>([]);
  const [apiUnits, setApiUnits] = useState<ApiUnit[]>([]);
  const [cubData, setCubData] = useState<{ currentValue: number; currentMonth: string; monthlyVariation: number; yearlyAccumulated: number } | null>(null);
  const [companySettings, setCompanySettings] = useState<{ companyId: number; companyName: string; areaM2: number; factor: number; status: string; controlaOrcamento?: boolean }[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  // Per-tab filters: save/restore when switching tabs. Companies tem o seu
  // proprio Record (perTabCompanies) por questao historica; os outros filtros
  // ficam num Record consolidado (perTabFilters) por tabGroup.
  const perTabCompanies = useRef<Record<string, Set<string>>>({});
  const perTabFilters = useRef<Record<string, {
    years?: Set<string>;
    months?: Set<string>;
    days?: Set<string>;
    docTypes?: Set<string>;
    opTypes?: Set<string>;
    docNumbers?: Set<string>;
  }>>({});
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [chartView, setChartView] = useState<ChartView>("mensal");
  const [showDelinquentTable, setShowDelinquentTable] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [delinquentSort, setDelinquentSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "totalOverdue", dir: "desc" });
  // Filtro rapido por empresa no detalhamento de inadimplencia (null = todas).
  const [delinquentCompanyFilter, setDelinquentCompanyFilter] = useState<string | null>(null);
  const [showOverdueTable, setShowOverdueTable] = useState(false);
  const [expandedCreditors, setExpandedCreditors] = useState<Set<string>>(new Set());
  // Card "Credores"/"Clientes" clicável → tabela de detalhamento em a-pagar/pagas/
  // a-receber/recebidas (mesma UX de Contas em Atraso / Inadimplentes).
  const [showCounterpartDetail, setShowCounterpartDetail] = useState(false);
  const [overdueSort, setOverdueSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "totalOverdue", dir: "desc" });
  const [selectedDocNumbers, setSelectedDocNumbers] = useState<Set<string>>(new Set());
  const [selectedOpTypes, setSelectedOpTypes] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      // Key versionada com `_v2` (2026-05-09) — invalida configurações antigas
      // de usuários com filtros desatualizados (sem por bens/permuta excluídos).
      const saved = localStorage.getItem("dashboard_default_opTypes_v2");
      if (saved) return new Set(JSON.parse(saved));
    }
    // Empty marker — actual defaults are populated by useEffect below once
    // allOpTypes is known. Default exclui Substituição/Cancelamento/Abatimento/
    // Devolução/Por Bens/Permuta — Sienge "(por Credor) Sintético" não soma
    // essas no Líquido (validado 2026-05-09 em 12 empresas cravando exato).
    return new Set();
  });
  const [opTypesInitialized, setOpTypesInitialized] = useState(false);

  // === Filter persistence per tab ===
  // Cada filtro do header (Anos/Meses/Dias/Tipo Doc/Tipo Op/N° Doc) e salvo
  // por aba quando o usuario troca de aba. Primeira render mantem o valor
  // global atual (sem mudar comportamento). LocalStorage keys versionadas.
  const filterTabKey = useCallback((tab: MainTab, name: string) =>
    `dashboard_${name}_${getTabGroup(tab)}`, []);

  const switchTab = useCallback((newTab: MainTab) => {
    const oldGroup = getTabGroup(activeTab);
    const newGroup = getTabGroup(newTab);

    // Mesma group → so atualiza activeTab (a-pagar/pagas/atrasadas dividem cp)
    if (oldGroup === newGroup) {
      setActiveTab(newTab);
      return;
    }

    // 1. Salvar filtros da aba atual no Record (memoria de sessao)
    perTabCompanies.current[oldGroup] = new Set(selectedCompanies);
    perTabFilters.current[oldGroup] = {
      years: new Set(selectedYears),
      months: new Set(selectedMonths),
      days: new Set(selectedDays),
      docTypes: new Set(selectedDocTypes),
      opTypes: new Set(selectedOpTypes),
      docNumbers: new Set(selectedDocNumbers),
    };

    const loadLs = (key: string): Set<string> | null => {
      if (typeof window === "undefined") return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try { return new Set(JSON.parse(raw)); } catch { return null; }
    };

    // 2. Carregar Companies (lógica original preservada)
    const cachedCo = perTabCompanies.current[newGroup];
    if (cachedCo) {
      setSelectedCompanies(cachedCo);
    } else {
      const ls = loadLs(companyStorageKey(newTab));
      setSelectedCompanies(ls || new Set());
    }

    // 3. Carregar outros filtros: Record da sessao > localStorage per-tab.
    //    Se nao tem nada salvo, MANTEM o valor atual (nao reseta) — assim
    //    a primeira vez que muda de aba leva o filtro como default ate que
    //    o usuario configure especificamente nesse contexto.
    const cached = perTabFilters.current[newGroup];
    if (cached) {
      if (cached.years) setSelectedYears(cached.years);
      if (cached.months) setSelectedMonths(cached.months);
      if (cached.days) setSelectedDays(cached.days);
      if (cached.docTypes) setSelectedDocTypes(cached.docTypes);
      if (cached.opTypes) setSelectedOpTypes(cached.opTypes);
      if (cached.docNumbers) setSelectedDocNumbers(cached.docNumbers);
    } else {
      const lsYears = loadLs(filterTabKey(newTab, "years"));
      if (lsYears) setSelectedYears(lsYears);
      const lsMonths = loadLs(filterTabKey(newTab, "months"));
      if (lsMonths) setSelectedMonths(lsMonths);
      const lsDays = loadLs(filterTabKey(newTab, "days"));
      if (lsDays) setSelectedDays(lsDays);
      const lsDocTypes = loadLs(filterTabKey(newTab, "docTypes"));
      if (lsDocTypes) setSelectedDocTypes(lsDocTypes);
      const lsOpTypes = loadLs(filterTabKey(newTab, "opTypes"));
      if (lsOpTypes) setSelectedOpTypes(lsOpTypes);
      const lsDocNumbers = loadLs(filterTabKey(newTab, "docNumbers"));
      if (lsDocNumbers) setSelectedDocNumbers(lsDocNumbers);
    }

    setActiveTab(newTab);
  }, [activeTab, selectedCompanies, selectedYears, selectedMonths, selectedDays, selectedDocTypes, selectedOpTypes, selectedDocNumbers, filterTabKey]);

  // Note: bankFees state was removed — bank movements are now synthesized as
  // outcome items via bankMovementsAsItems memo and flow through filteredPagas
  const [allBankMovements, setAllBankMovements] = useState<SiengeBankMovement[]>([]);
  const [allBankMovementsFull, setAllBankMovementsFull] = useState<SiengeBankMovement[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ bankAccountId: number; bankAccountDescription: string; bankCode: string; bankName: string; agencyNumber: string; accountNumber: string; companyId: number; companyName: string; currentBalance: number; isInDimBanco?: boolean }[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
  const [expandedBankCompanies, setExpandedBankCompanies] = useState<Set<string>>(new Set());
  const [selectedBankAccounts, setSelectedBankAccounts] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard_saldos_accounts_v2");
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
  const [budgetSort, setBudgetSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "budget", dir: "desc" });
  const [fluxoView, setFluxoView] = useState<"projetado" | "entradas-saidas">("projetado");
  const [exclusionSet, setExclusionSet] = useState<Set<string>>(new Set());


  const availableYears = useMemo(() => {
    const arr: string[] = [];
    if (activeTab === "pagas" || activeTab === "atrasadas" || activeTab === "recebidas" || activeTab === "inadimplencia" || activeTab === "dre" || activeTab === "dre-api" || activeTab === "resumo") {
      for (let y = currentYear - 10; y <= currentYear; y++) arr.push(String(y));
    } else if (activeTab === "a-receber") {
      // CR de imóveis: parcelamento longo (financiamento direto até ~10 anos);
      // SILVA PACKER tem dueDate até 2034 — alinha com incomeEndDate do fetch.
      for (let y = currentYear; y <= currentYear + 15; y++) arr.push(String(y));
    } else {
      // Contas a Pagar: mostra ano atual em diante
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
  // Filtra também pelo modo empresa (SP: exclui Holding; Holding: só Holding)
  const companyModeFilter = useCallback((companyName: string) => {
    if (isHolding) return companyName === holdingName;
    return companyName !== holdingName;
  }, [isHolding, holdingName]);

  const consistentItems = useMemo(() =>
    items.filter(i =>
      companyModeFilter(i.companyName) &&
      i.consistencyStatus !== 'N' &&
      !isExcludedFinancialDocType(i.documentIdentificationName, i.forecastDocument) &&
      !(exclusionSet.size > 0 && exclusionSet.has(`${i.companyId}:${i.billId}`))
    ), [items, exclusionSet, companyModeFilter]);

  const consistentIncome = useMemo(() =>
    incomeItems.filter(i => {
      if (!companyModeFilter(i.companyName)) return false;
      // No modo Holding, NÃO exclui LNC/LOC (são aluguéis)
      if (isHolding) {
        return !isExcludedFinancialDocType(
          i.documentIdentificationName,
          (i as { forecastDocument?: string | null }).forecastDocument,
          { excludeLocacao: false }
        ) &&
        !(exclusionSet.size > 0 && exclusionSet.has(`${i.companyId}:${i.billId}`));
      }
      const keepExcludedDoc = shouldKeepIncomeExcludedDoc(i.companyId, i.billId, i.installmentId);
      return !isExcludedFinancialDocType(
        i.documentIdentificationName,
        (i as { forecastDocument?: string | null }).forecastDocument,
        { excludeLocacao: !keepExcludedDoc }
      ) &&
      !(exclusionSet.size > 0 && exclusionSet.has(`${i.companyId}:${i.billId}`));
    }), [incomeItems, exclusionSet, companyModeFilter, isHolding]);

  // === CR consolidado da Holding ===
  // No modo Holding, o Contas a Receber consolida o grupo: além dos recebíveis
  // da própria Holding (consistentIncome), inclui os ALUGUÉIS das demais empresas
  // (Silva Packer, Sul Brasil) — mesma regra da página Aluguéis (isAluguelIncome:
  // LOC/LNC + categoria 10513/10514). Fora da Holding é idêntico a consistentIncome
  // (as 12 empresas validadas NÃO mudam). Alimenta SÓ as telas de CR (A Receber,
  // Recebidas, Inadimplência, Calendário de Recebimentos) — DRE e Resumo continuam
  // usando consistentIncome de propósito, para não alterar números já validados.
  const consistentIncomeCR = useMemo(() => {
    if (!isHolding) return consistentIncome;
    const alugueisOutras = incomeItems.filter(i =>
      i.companyName !== holdingName &&            // Holding já entra por consistentIncome
      isAluguelIncome(i) &&
      !isExcludedFinancialDocType(
        i.documentIdentificationName,
        (i as { forecastDocument?: string | null }).forecastDocument,
        { excludeLocacao: false }
      ) &&
      !(exclusionSet.size > 0 && exclusionSet.has(`${i.companyId}:${i.billId}`))
    );
    return [...consistentIncome, ...alugueisOutras];
  }, [isHolding, consistentIncome, incomeItems, holdingName, exclusionSet]);

  // Active data source based on section
  const activeItems = section === "cr" ? consistentIncomeCR : consistentItems;

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    if (activeTab === "pagas" || activeTab === "recebidas") {
      activeItems.forEach(i => {
        (i.payments || []).forEach(p => {
          if (p.paymentDate) months.add(p.paymentDate.substring(5, 7));
        });
      });
      return MONTH_OPTIONS.filter(m => months.has(m));
    }
    activeItems.forEach(i => {
      if (i.dueDate) months.add(i.dueDate.substring(5, 7));
    });
    return MONTH_OPTIONS.filter(m => months.has(m));
  }, [activeItems, activeTab]);

  // Fixed date range for data fetching — never changes based on filters
  const dataLoadedRef = useRef(false);
  // Auto-retry counter pra primeira carga. Se um fetch falhar (ex: 429 do
  // Sienge, timeout temporario), retenta ate 2 vezes com backoff antes de
  // desistir e mostrar erro. Resolve o problema de "tela zerada" ao carregar.
  const retryCountRef = useRef(0);
  const MAX_AUTO_RETRIES = 2;

  const fetchData = useCallback(async (forceRefresh = false) => {
    const startDate = `${currentYear - 10}-01-01`;
    const endDate = `${currentYear + 5}-12-31`;
    // CR de imóveis tem parcelas longas (financiamento direto até ~10 anos);
    // Sienge SILVA PACKER tem dueDate até 2034. Usa range maior apenas para
    // income — CP/BM raramente têm datas além de 5 anos.
    const incomeEndDate = `${currentYear + 15}-12-31`;
    const refreshParam = forceRefresh ? "&forceRefresh=true" : "";

    if (forceRefresh) {
      setRefreshing(true);
      setRefreshKey(k => k + 1);
      setRefreshSteps([
        { label: "Contas a Pagar", detail: `${startDate} → ${endDate}`, status: "running" },
        { label: "Movimentos Bancários (avulsos)", detail: `${startDate} → ${endDate}`, status: "running" },
        { label: "Contas a Receber", detail: `${startDate} → ${incomeEndDate}`, status: "running" },
        { label: "Movimentos Bancários (todos, p/ DRE)", detail: `${startDate} → ${endDate}`, status: "running" },
        { label: "Contratos de Venda", status: "running" },
        { label: "Unidades", status: "running" },
      ]);
    } else if (!dataLoadedRef.current) setLoading(true);

    const setStep = (i: number, status: StepStatus, detail?: string) => {
      if (!forceRefresh) return;
      setRefreshSteps(s => s.map((st, idx) => idx === i ? { ...st, status, detail: detail ?? st.detail } : st));
    };

    try {
      // Sales contracts fetch runs independently — never blocks main data
      fetch(`/api/sienge/sales-contracts${refreshParam ? "?forceRefresh=true" : ""}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) { setSalesContracts(data.data || []); setStep(4, "done", `${(data.data || []).length} contratos`); } else setStep(4, "error"); })
        .catch(() => setStep(4, "error"));

      // Units fetch runs independently — real unit data from Sienge
      fetch(`/api/sienge/units${refreshParam ? "?forceRefresh=true" : ""}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) { setApiUnits(data.data || []); setStep(5, "done", `${(data.data || []).length} unidades`); } else setStep(5, "error"); })
        .catch(() => setStep(5, "error"));

      // Fetch ALL bank movements (including linked to outcomes/incomes) for DRE Level 3 enrichment
      fetch(`/api/sienge/bank-movements?startDate=${startDate}&endDate=${endDate}&detachedOnly=N${refreshParam}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) { setAllBankMovementsFull(data.data || []); setStep(3, "done", `${(data.data || []).length} movimentos`); } else setStep(3, "error"); })
        .catch(() => setStep(3, "error"));

      const [outcomeRes, bmRes, incomeRes] = await Promise.all([
        fetch(`/api/sienge/outcome?startDate=${startDate}&endDate=${endDate}${refreshParam}`)
          .then(r => { if (!r.ok) setStep(0, "error"); return r; }),
        fetch(`/api/sienge/bank-movements?startDate=${startDate}&endDate=${endDate}${refreshParam}`)
          .then(r => { if (!r.ok) setStep(1, "error"); return r; }),
        fetch(`/api/sienge/income?startDate=${startDate}&endDate=${incomeEndDate}${refreshParam}`)
          .then(r => { if (!r.ok) setStep(2, "error"); return r; }),
      ]);

      if (!outcomeRes.ok) throw new Error("Outcome API error");
      const outcomeData = await outcomeRes.json();
      setItems(outcomeData.data || []);
      if (outcomeData.cachedAt) setLastUpdatedCp(outcomeData.cachedAt);
      setStep(0, "done", `${(outcomeData.data || []).length} parcelas`);

      if (bmRes.ok) {
        const bmData = await bmRes.json();
        const allBm: SiengeBankMovement[] = bmData.data || [];
        setAllBankMovements(allBm);
        setStep(1, "done", `${allBm.length} movimentos`);
      }

      if (!incomeRes.ok) throw new Error("Income API error");
      const incomeData = await incomeRes.json();
      setIncomeItems(incomeData.data || []);
      if (incomeData.cachedAt) setLastUpdatedCr(incomeData.cachedAt);
      setStep(2, "done", `${(incomeData.data || []).length} parcelas`);

      dataLoadedRef.current = true;
      retryCountRef.current = 0; // sucesso — reseta contador
    } catch (err) {
      // Retry automatico SOMENTE no carregamento inicial (nao no forceRefresh
      // manual) e ate MAX_AUTO_RETRIES vezes. Backoff: 2s, 4s. Mantem modal de
      // loading aberto durante retries.
      if (!forceRefresh && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current++;
        const waitMs = retryCountRef.current * 2000;
        console.warn(`fetchData falhou (${err instanceof Error ? err.message : "?"}), retentando em ${waitMs}ms (${retryCountRef.current}/${MAX_AUTO_RETRIES})`);
        setTimeout(() => { fetchData(false); }, waitMs);
        return; // sai sem fechar modal de loading
      }
      retryCountRef.current = 0;
      toast.error("Erro ao carregar dados. Clique em Atualizar pra tentar de novo.");
    } finally {
      // Se retry foi agendado, retryCountRef.current > 0 e ja saimos com return.
      // Aqui so executa se sucesso ou se desistiu de retentar.
      setLoading(false);
      if (forceRefresh) {
        setTimeout(() => { setRefreshing(false); setRefreshSteps([]); }, 1200);
      } else {
        setRefreshing(false);
      }
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
          const saved = localStorage.getItem("dashboard_saldos_accounts_v2");
          if (!saved) {
            // Default: select only accounts that are in DimBanco (valid accounts)
            const validNums = new Set<string>(
              json.data
                .filter((a: { isInDimBanco?: boolean }) => a.isInDimBanco)
                .map((a: { bankAccountId: string }) => String(a.bankAccountId))
            );
            setSelectedBankAccounts(validNums);
            // Auto-save so it persists
            localStorage.setItem("dashboard_saldos_accounts_v2", JSON.stringify(Array.from(validNums)));
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
  // No modo Holding só tem 1 empresa, nada é excluído
  const isExcludedCompany = (name: string) => {
    if (isHolding) return false;
    const upper = name.toUpperCase();
    return upper.includes("HOLDING") || upper.includes("ADMINISTRADORA") ||
      upper.includes("CONSTRUTORA") || upper.includes("EMPREENDIMENTOS") ||
      upper.includes("GALPÃO") || upper.includes("GALPAO");
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultCompanies = useCallback(() =>
    new Set(allCompanyNames.filter(n => !isExcludedCompany(n))),
    [allCompanyNames, isHolding]
  );

  // Reset company filter and redirect from invalid tabs when mode changes
  const prevMode = useRef(isHolding);
  useEffect(() => {
    if (prevMode.current !== isHolding) {
      prevMode.current = isHolding;
      companiesInitialized.current = false;
      setSelectedCompanies(new Set());
      // Holding não tem Orçamento (o Comercial virou módulo próprio, fora do Painel) — redireciona pra Geral
      if (isHolding && activeTab === "orcamento") {
        setActiveTab("visao-geral");
      }
    }
  }, [isHolding, activeTab]);

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

  // PREVISÃO: documentos de previsão financeira (não realizados)
  // CONTRATO DE LOCAÇÃO / CONTRATO DE LOCACAO NAO CONTABIL (LOC/LNC):
  // lançamentos contábeis internos da HOLDING — Sienge "Contas Recebidas"
  // não conta no Líquido. Validado 2026-05-08 contra PDF TETRA Total geral.
  const isExcludedDocType = (t: string) => {
    // No modo Holding, LNC/LOC são aluguéis — não excluir
    return isExcludedFinancialDocType(t, null, { excludeLocacao: section === "cr" && !isHolding });
  };

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
  // Saldo efetivo a pagar = balance - desconto financeiro - imposto retido (ISS/INSS)
  // Mesma fórmula da página Contas a Pagar (validada contra Sienge "por Credor Sintético")
  const effectiveAmount = (i: SiengeOutcome | SiengeIncome) =>
    effectiveOpenAmount(i, "clientId" in i);

  const matchesSelectedPaymentDate = useCallback((paymentDate?: string) => {
    if (!paymentDate) return false;
    if (paymentDate > todayStr) return false;
    if (selectedYears.size > 0 && !selectedYears.has(paymentDate.substring(0, 4))) return false;
    if (selectedMonths.size > 0 && !selectedMonths.has(paymentDate.substring(5, 7))) return false;
    if (selectedDays.size > 0 && !selectedDays.has(paymentDate.substring(8, 10))) return false;
    return true;
  }, [selectedYears, selectedMonths, selectedDays, todayStr]);

  // Soma de pagamentos filtrada por tipo de operação e ano do pagamento.
  // Pareia Adiantamento+Estorno (mesma data, valores opostos) e exclui ambos —
  // Sienge cancela esses pares do Líquido. Sem pareamento, EXCLUDED_OP filtra
  // o Estorno mas deixa o Adiantamento, gerando over-count.
  const paidSum = useCallback((i: SiengeOutcome | SiengeIncome) => {
    const payments = i.payments || [];
    const canceled = getEstornoPairs(payments);
    return payments
      .filter(p =>
        !canceled.has(p) &&
        (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
        matchesSelectedPaymentDate(p.paymentDate)
      )
      .reduce((s, p) => s + p.netAmount, 0);
  }, [selectedOpTypes, matchesSelectedPaymentDate]);

  // Soma de recebimentos filtrada apenas por ano (opType do CP não se aplica ao CR)
  const receivedSum = useCallback((i: SiengeIncome) =>
    (i.payments || [])
      .filter(p =>
        p.netAmount > 0 &&
        matchesSelectedPaymentDate(p.paymentDate)
      )
      .reduce((s, p) => s + p.netAmount, 0),
    [matchesSelectedPaymentDate]);

  // Tipos de operação disponíveis nos dados.
  // Para CP, inclui "Movimento Bancário" como op type sintético quando existem
  // bank movements (sintetizados como outcome items). Isso alinha com o
  // standalone Contas Pagas que sempre mostra esse op type quando há tarifas.
  const allOpTypes = useMemo(() => {
    const types = new Set<string>();
    activeItems.forEach(i =>
      (i.payments || []).forEach(p => { if (p.operationTypeName) types.add(p.operationTypeName); })
    );
    if (section === "cp" && allBankMovements.length > 0) {
      types.add("Movimento Bancário");
    }
    return Array.from(types).sort();
  }, [activeItems, allBankMovements, section]);

  // Initialize selectedOpTypes once data arrives. Skips Substituição,
  // Cancelamento, Estorno and Abatimento — reversal/replacement entries that
  // the Sienge "Contas Pagas Sintético" report does not include.
  // "Por Bens" stays in by default because Sienge "por Data" includes it;
  // companies whose source PDF was "por Credor" (which excludes Por Bens)
  // should save a per-empresa filter via the standalone page.
  useEffect(() => {
    if (opTypesInitialized || allOpTypes.length === 0) return;
    if (typeof window !== "undefined" && localStorage.getItem("dashboard_default_opTypes_v2")) {
      // User has a saved default (v2); respect it (already loaded by useState init)
      setOpTypesInitialized(true);
      return;
    }
    // Mesma lista que contas-table.tsx — vide comentário lá. Default exclui
    // op types que o Sienge "(por Credor) Sintético" não soma no Líquido
    // (validado 2026-05-09 cravando 12 empresas exato).
    const EXCLUDED = ["substitui", "cancelamento", "abatimento", "devolu", "por bens", "permuta"];
    const initial = allOpTypes.filter(op => {
      const lower = op.toLowerCase();
      return !EXCLUDED.some(x => lower.includes(x));
    });
    setSelectedOpTypes(new Set(initial));
    setOpTypesInitialized(true);
  }, [allOpTypes, opTypesInitialized]);

  // When exactly 1 company is selected, sync selectedOpTypes with the
  // standalone Contas Pagas page logic:
  // 1. If user has saved a per-company filter, use that (explicit override)
  // 2. Else, fall back to "all op types except Substituição/Cancelamento/Estorno"
  //    (mirrors the standalone's auto-default when no save exists)
  // This ensures Painel and standalone show the same totals when filtered by
  // the same single company, regardless of whether the user has saved a
  // custom filter for it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (allOpTypes.length === 0) return;
    if (selectedCompanies.size !== 1) return;
    const empresaKey = Array.from(selectedCompanies)[0];
    const perCompanyKey = `contas_outcome_pagas_default_tipoBaixa_v2_${empresaKey}`;
    const saved = localStorage.getItem(perCompanyKey);
    if (saved) {
      try { setSelectedOpTypes(new Set(JSON.parse(saved))); return; } catch { /* ignore */ }
    }
    // No save: emulate standalone's auto-default. Mesma lista que
    // contas-table.tsx — exclui Substituição/Cancelamento/Abatimento/
    // Devolução/Por Bens/Permuta (Sienge "(por Credor)" não soma).
    const EXCLUDED = ["substitui", "cancelamento", "abatimento", "devolu", "por bens", "permuta"];
    const initial = allOpTypes.filter(op => {
      const lower = op.toLowerCase();
      return !EXCLUDED.some(x => lower.includes(x));
    });
    setSelectedOpTypes(new Set(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanies, allOpTypes.length]);

  // Ao alternar entre CP (outcome) e CR (income), os tipos de Operação e Documento
  // mudam de contexto. Os filtros selecionados são COMPARTILHADOS, então um filtro
  // de income (vindo de CR) zerava o "Total Pago" do Resumo em CP (nenhum tipo de
  // income existe nas contas pagas → itemsPagas vazio). Aqui, na troca de seção,
  // removemos do filtro os tipos que não existem na nova seção; se isso esvaziar o
  // filtro (contexto totalmente incompatível), reaplicamos o default da seção.
  // Só ajusta a SELEÇÃO de filtro — nenhuma fórmula de valor é tocada, então não
  // afeta nenhuma empresa.
  const prevSectionRef = useRef(section);
  useEffect(() => {
    if (prevSectionRef.current === section) return;
    prevSectionRef.current = section;
    const OP_EXCLUDED = ["substitui", "cancelamento", "abatimento", "devolu", "por bens", "permuta"];
    setSelectedOpTypes(prev => {
      if (prev.size === 0) return prev;
      const valid = new Set([...prev].filter(t => allOpTypes.includes(t)));
      if (valid.size > 0) return valid.size === prev.size ? prev : valid;
      return new Set(allOpTypes.filter(op => !OP_EXCLUDED.some(x => op.toLowerCase().includes(x))));
    });
    setSelectedDocTypes(prev => {
      if (prev.size === 0) return prev;
      const valid = new Set([...prev].filter(t => allDocTypes.includes(t)));
      if (valid.size > 0) return valid.size === prev.size ? prev : valid;
      return new Set(allDocTypes.filter(t => !isExcludedDocType(t)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, allOpTypes, allDocTypes]);

  // Fecha a tabela de detalhamento por credor/cliente ao trocar de aba.
  useEffect(() => { setShowCounterpartDetail(false); }, [activeTab]);

  // Números de documento disponíveis nos dados de income (CR)
  const allDocNumbers = useMemo(() => {
    const nums = new Set<string>();
    consistentIncomeCR.forEach(i => {
      if (i.documentNumber) nums.add(i.documentNumber);
    });
    return Array.from(nums).sort();
  }, [consistentIncomeCR]);

  // === Apply filters to items (works for both Outcome and Income) ===
  const applyFilters = useCallback(<T extends { companyName: string; documentIdentificationName: string; dueDate: string; companyId?: number; billId?: number; installmentId?: number }>(list: T[]): T[] => {
    let result = list;
    if (selectedCompanies.size > 0) {
      result = result.filter(i => selectedCompanies.has(i.companyName));
    }
    if (selectedDocTypes.size > 0) {
      result = result.filter(i =>
        selectedDocTypes.has(i.documentIdentificationName) ||
        shouldKeepIncomeExcludedDoc(i.companyId, i.billId, i.installmentId)
      );
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

  // Synthesize bank movements as outcome items with op type "Movimento
  // Bancário", mirroring the standalone Contas Pagas page. This lets bank
  // movements flow through the same filter chain (selectedDocTypes,
  // selectedCompanies, etc.) so the Painel matches the standalone exactly.
  //
  // Exclusion is based ONLY on the bankMovementHistoricName (descriptive enough).
  // Earlier we also checked financialCategories, but that produced false
  // positives for HOLDING: "Retenção impostos" with category "Taxa IR da
  // Aplicação (Banco)" was wrongly excluded because of the "aplicação" pattern,
  // even though it's a real tax-withholding expense, not an income.
  //
  // Patterns excluded:
  // - rendimento/aplicação/resgate: income side (yields and money moved into
  //   investments)
  // - transferência/saque/depósito: cash management (not payments to credors)
  const bankMovementsAsItems = useMemo(() => {
    if (allBankMovements.length === 0) return [] as SiengeOutcome[];
    // Filtro refinado 2026-05-09 contra Sienge "Contas Pagas (por Credor)
    // Sintético" — cravou exato em 12 empresas. Mesma lógica de contas-table.tsx:
    //
    //   1. bankMovementOperationType === "S" (Saídas). op='E' são entradas.
    //   2. documentIdentificationName !== "TRANSFERÊNCIA ENTRE CONTAS" —
    //      transferências internas/intercompany contábeis.
    //   3. financialCategories.length > 0 — BMs sem categoria são
    //      sincronizações contábeis (não pagamentos reais).
    //   4. historic não em [rendimento, aplicação, resgate, recebimento,
    //      saque, depósito, cheque].
    const EXCLUDE_HISTORIC_PATTERNS = [
      "rendimento", "aplicação", "aplicacao", "resgate",
      "saque", "depósito", "deposito",
      "recebimento",
      "cheque",
    ];
    return allBankMovements
      .filter(bm => {
        if (bm.bankMovementAmount === 0) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((bm as any).bankMovementOperationType !== "S") return false;
        const docName = (bm.documentIdentificationName || "").toUpperCase();
        if (docName.includes("TRANSFER") && docName.includes("ENTRE CONTAS")) return false;
        const cats = bm.financialCategories || [];
        if (cats.length === 0) return false;
        const historic = (bm.bankMovementHistoricName || "").toLowerCase();
        if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) return false;
        return true;
      })
      .map(bm => ({
        billId: bm.billId || bm.bankMovementId,
        installmentId: 1,
        companyId: bm.companyId,
        companyName: bm.companyName,
        creditorId: 0,
        creditorName: bm.bankMovementHistoricName || "Tarifa Bancária",
        documentIdentificationId: bm.documentIdentificationId || "MB",
        documentIdentificationName: bm.documentIdentificationName || "MOV. BANCÁRIO",
        documentNumber: "",
        consistencyStatus: "S",
        originId: "BM",
        originalAmount: Math.abs(bm.bankMovementAmount),
        discountAmount: 0,
        taxAmount: 0,
        dueDate: bm.bankMovementDate,
        issueDate: bm.billDate || bm.bankMovementDate,
        balanceAmount: 0,
        correctedBalanceAmount: 0,
        forecastDocument: "N",
        authorizationStatus: "",
        billDate: bm.billDate || bm.bankMovementDate,
        registeredBy: "",
        registeredDate: "",
        paymentsCategories: (bm.financialCategories || []).map(fc => ({
          costCenterId: fc.costCenterId,
          costCenterName: fc.costCenterName,
          financialCategoryId: fc.financialCategoryId,
          financialCategoryName: fc.financialCategoryName,
          financialCategoryRate: fc.financialCategoryRate,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any,
        payments: [{
          operationTypeId: 0,
          operationTypeName: "Movimento Bancário",
          netAmount: Math.abs(bm.bankMovementAmount),
          grossAmount: Math.abs(bm.bankMovementAmount),
          paymentDate: bm.bankMovementDate,
          taxAmount: 0,
          monetaryCorrectionAmount: 0,
          interestAmount: 0,
          fineAmount: 0,
          discountAmount: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any,
        buildingsCosts: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as SiengeOutcome));
  }, [allBankMovements]);

  // For Pagas computations, include synthesized bank movements alongside
  // outcome items so they flow through all the same filters.
  const consistentItemsForPagas = useMemo(
    () => [...consistentItems, ...bankMovementsAsItems],
    [consistentItems, bankMovementsAsItems]
  );

  // Bank movements órfãos (sem bill associado) que representam RECEBIMENTOS
  // diretos no banco — entram no relatório Sienge "Contas Recebidas (por
  // Cliente)" como linha sem cliente. Validado 2026-05-08 contra HANNOVER:
  // R$ 23.583,76 = 12 BMs "Rendimento de aplicação".
  //
  // Critérios:
  // - billId === null (não vinculado a uma fatura — não está em receipts[])
  // - bankMovementOperationType === "E" (Entrada de caixa)
  // - financialCategoryType === "R" (Receita)
  // - exclui Transferência (movimentação interna entre contas)
  const incomeBankMovementsAsItems = useMemo(() => {
    if (allBankMovementsFull.length === 0) return [] as SiengeIncome[];
    return allBankMovementsFull
      .filter(bm => {
        if (bm.bankMovementAmount === 0) return false;
        // Se tem billId, já está contado em receipts[] dos income items
        if (bm.billId) return false;
        // Só Entradas (não saídas)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((bm as any).bankMovementOperationType !== "E") return false;
        const historic = (bm.bankMovementHistoricName || "").toLowerCase().trim();
        // Transferência interna entre caixas nunca é recebimento.
        if (historic.includes("entre caixas")) return false;
        // Excluir "Aplicação" sozinho (saída pra fundo de investimento). Mantém
        // "Rendimento de aplicação" e "Resgate de Aplicação" — esses são entradas
        // de volta na conta-corrente. Validado 2026-05-08 contra 135 JARDINS.
        if (historic === "aplicação" || historic === "aplicacao") return false;
        // Excluir saídas (mesmo que Sienge marque como E em alguns casos):
        // - Cheque emitido: empresa emitiu cheque (saída pendente). Validado
        //   contra SUL BRASIL e TESLA (R$ 11.300 cada).
        if (historic.includes("pagamento") || historic.includes("saque") ||
            historic.includes("depósito") || historic.includes("deposito") ||
            historic.includes("cheque emitido")) return false;
        const cats = bm.financialCategories || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const catNames = cats.map((fc: any) => (fc.financialCategoryName || "").toLowerCase()).join(" ");
        // Histórico "Transferência": para a maioria das empresas é movimentação
        // interna (validado — fica fora). MAS a HOLDING recebe aluguel registrado
        // como "Transferência" com categoria "Receita de Locação" (Caixa e Bancos
        // no Sienge). Só nesse caso (Holding + categoria de receita não-transfer)
        // o lançamento entra. Demais empresas seguem inalteradas.
        if (historic.includes("transfer")) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const receitaNonTransfer = cats.some((fc: any) =>
            fc.financialCategoryType === "R" && !/transfer/i.test(fc.financialCategoryName || ""));
          return /HOLDING|ADMINISTRADORA/i.test(bm.companyName || "") && receitaNonTransfer;
        }
        // Demais lançamentos: regra original (validada nas 12 empresas).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isReceita = cats.length === 0 || cats.some((fc: any) => fc.financialCategoryType === "R");
        if (!isReceita) return false;
        // Excluir BMs cuja categoria seja Transferência Entre Contas — Sienge
        // marca historic="Recebimento" mas categoria revela ser transferência
        // interna. Validado contra SILVA PACKER R$ 10.300 (2023-10-03).
        if (catNames.includes("transferência") || catNames.includes("transferencia")) return false;
        return true;
      })
      .map(bm => ({
        billId: bm.bankMovementId,
        installmentId: 1,
        companyId: bm.companyId,
        companyName: bm.companyName,
        clientId: 0,
        // Em vez de "(sem cliente)": históricos genéricos como "Transferência"
        // (aluguel da Holding) usam a categoria de receita (ex.: "Receita de
        // Locação"); senão a descrição do banco.
        clientName: (() => {
          const h = (bm.bankMovementHistoricName || "").trim();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const recCat = (bm.financialCategories || []).find((fc: any) => fc.financialCategoryType === "R")?.financialCategoryName?.trim();
          if (h && !/^transfer/i.test(h)) return h;
          return recCat || h || "Rendimentos / Tarifas Bancárias";
        })(),
        documentIdentificationId: bm.documentIdentificationId || "MB",
        documentIdentificationName: bm.documentIdentificationName || "MOV. BANCÁRIO",
        documentNumber: "",
        originId: "BM",
        originalAmount: Math.abs(bm.bankMovementAmount),
        discountAmount: 0,
        taxAmount: 0,
        dueDate: bm.bankMovementDate,
        billDate: bm.billDate || bm.bankMovementDate,
        balanceAmount: 0,
        correctedBalanceAmount: 0,
        receivedNetAmount: Math.abs(bm.bankMovementAmount),
        receipts: [{
          netAmount: Math.abs(bm.bankMovementAmount),
          paymentDate: bm.bankMovementDate,
          operationTypeName: bm.bankMovementHistoricName || "Recebimento",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bankMovements: [{ amount: Math.abs(bm.bankMovementAmount) }] as any,
        }],
        payments: [{
          operationTypeId: 0,
          operationTypeName: bm.bankMovementHistoricName || "Recebimento",
          netAmount: Math.abs(bm.bankMovementAmount),
          grossAmount: Math.abs(bm.bankMovementAmount),
          paymentDate: bm.bankMovementDate,
          taxAmount: 0,
          monetaryCorrectionAmount: 0,
          interestAmount: 0,
          fineAmount: 0,
          discountAmount: 0,
        }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any as SiengeIncome));
  }, [allBankMovementsFull]);

  // CR Recebidas: income items + BMs órfãos sintetizados como recebimentos
  // Usa consistentIncomeCR para, no modo Holding, incluir os aluguéis realizados
  // de Silva Packer e Sul Brasil (consolidação do grupo).
  const consistentIncomeForRecebidas = useMemo(
    () => [...consistentIncomeCR, ...incomeBankMovementsAsItems],
    [consistentIncomeCR, incomeBankMovementsAsItems]
  );

  const itemsPagas = useMemo(() =>
    consistentItemsForPagas.filter(i =>
      (i.payments || []).some(p =>
        p.netAmount > 0 &&
        (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
        matchesSelectedPaymentDate(p.paymentDate)
      )
    ), [consistentItemsForPagas, selectedOpTypes, matchesSelectedPaymentDate]);

  // === CR Filtered item sets ===
  const itemsAReceber = useMemo(() =>
    consistentIncomeCR.filter(i => i.correctedBalanceAmount > 0 && i.dueDate >= todayStr), [consistentIncomeCR, todayStr]);

  const itemsInadimplencia = useMemo(() =>
    consistentIncomeCR.filter(i => i.correctedBalanceAmount > 0 && i.dueDate < todayStr), [consistentIncomeCR, todayStr]);

  const itemsRecebidas = useMemo(() =>
    consistentIncomeForRecebidas.filter(i =>
      i.originalAmount > 0 && (i.payments || []).some(p =>
        p.netAmount > 0 &&
        matchesSelectedPaymentDate(p.paymentDate)
      )
      // HOLDING: exclui documentos "TRAN" (resgates/aplicações/transferências
      // entre contas) — não são receita. O Sienge "Contas Recebidas" também os
      // exclui. Validado mês a mês (Jan/Fev/Mar/2026). Escopado à Holding via
      // isHolding — as 12 empresas validadas (cujos resgates ficam) não mudam.
      && !(isHolding && (i.documentIdentificationId || "").trim().toUpperCase() === "TRAN")
    ), [consistentIncomeForRecebidas, matchesSelectedPaymentDate, isHolding]);

  // Items filtered by company + doc type for KPIs and charts
  const filteredAPagar = useMemo(() => applyFilters(itemsAPagar), [itemsAPagar, applyFilters]);
  const filteredAtrasadas = useMemo(() => applyFilters(itemsAtrasadas), [itemsAtrasadas, applyFilters]);
  // Pagas: anos/meses/dias devem filtrar pela data da baixa (paymentDate),
  // nao pelo vencimento do titulo. Ex.: HANNOVER tem caucoes com vencimento
  // em 2027 pagas em 2024; o Sienge soma essas baixas no periodo pago.
  const filteredPagas = useMemo(() => {
    let result = itemsPagas;
    if (selectedCompanies.size > 0) {
      result = result.filter(i => selectedCompanies.has(i.companyName));
    }
    if (selectedDocTypes.size > 0) {
      result = result.filter(i => selectedDocTypes.has(i.documentIdentificationName));
    }
    return result;
  }, [itemsPagas, selectedCompanies, selectedDocTypes]);

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

    return companySettings
      .filter(cs => cs.controlaOrcamento)
      .filter(cs => cs.areaM2 > 0)
      .filter(cs => selectedCompanies.size === 0 || selectedCompanies.has(cs.companyName))
      .map(cs => {
      const budget = cs.areaM2 * cs.factor * cubValue;

      // Sum ALL payments for this company using valor líquido (netAmount)
      // Same logic as contas-table paidTotal: filter netAmount > 0, sum netAmount
      // Always excludes previsão documents (hardcoded, not dependent on filter state)
      // No year filter: budget represents total cost to date (matches Contas Pagas with Ano=Todos)
      //
      // 2026-05-13: alinhado com Contas Pagas — agora usa consistentItemsForPagas
      // (inclui BMs avulsos sintetizados, igual a pagina) e exclui hardcoded os
      // mesmos op types que a pagina Contas Pagas exclui por padrao
      // (Substituicao/Cancelamento/Abatimento/Devolucao/Por Bens/Permuta).
      // Continua SEM depender de selectedOpTypes (sem race condition).
      const EXCLUDED_OPS = ["substitui", "cancelamento", "abatimento", "devolu", "por bens", "permuta"];
      let realized = 0;
      consistentItemsForPagas.forEach(item => {
        if (item.companyName !== cs.companyName) return;
        if (isExcludedFinancialDocType(item.documentIdentificationName, item.forecastDocument)) return;
        (item.payments || []).forEach(p => {
          if (p.netAmount === 0 || !p.paymentDate) return;
          const op = (p.operationTypeName || "").toLowerCase();
          if (EXCLUDED_OPS.some(x => op.includes(x))) return;
          realized += p.netAmount;
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
  }, [cubData, companySettings, consistentItemsForPagas, selectedCompanies]);
  // ▲▲▲ END VALIDATED — Budget vs Realizado ▲▲▲

  const budgetTotals = useMemo(() => {
    const activeRows = budgetData.filter(r => r.status === "Ativa");
    const totalBudget = budgetData.reduce((s, r) => s + r.budget, 0);
    const totalRealized = budgetData.reduce((s, r) => s + r.realized, 0);
    const totalToRealize = activeRows.reduce((s, r) => s + Math.max(0, r.toRealize), 0);
    return { totalBudget, totalRealized, totalToRealize };
  }, [budgetData]);

  // Aplica ordenacao da UI mantendo Finalizadas sempre no final
  const sortedBudgetData = useMemo(() => {
    const { field, dir } = budgetSort;
    const arr = [...budgetData];
    arr.sort((a, b) => {
      if (a.status !== b.status) return a.status === "Finalizada" ? 1 : -1;
      let cmp = 0;
      if (field === "companyName" || field === "status") {
        cmp = String(a[field as keyof typeof a] ?? "").localeCompare(
          String(b[field as keyof typeof b] ?? "")
        );
      } else {
        const av = Number(a[field as keyof typeof a] ?? 0);
        const bv = Number(b[field as keyof typeof b] ?? 0);
        cmp = av - bv;
      }
      return dir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [budgetData, budgetSort]);

  const toggleBudgetSort = useCallback((field: string) => {
    setBudgetSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "desc" }
    );
  }, []);

  // Calcula encargos (multa + juros) para itens inadimplentes - mesma fórmula de contas-table.tsx
  const calcEncargos = (item: SiengeIncome) => {
    if (!item.dueDate) return 0;
    // Regras de Sienge para Acréscimo=0 (validado 2026-05-08 contra PDF
    // "Posição de Inadimplência (Analítico)"):
    // - paymentTerm.id="PE" (Permuta) — nunca cobra encargo (TESLA HELVYS)
    // - paymentTerm.id="PM" (Parcelas Mensais) + indexerName="REAL" (sem
    //   correção monetária) — não cobra (SP GELSON)
    // - Outros casos: calcular multa 2% + juros 1% a.m.
    // Nota: paymentTerm.id="EN" (Entrada) com REAL TEM encargo (LADIA ROZZA).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ptRaw = (item as any).paymentTerm;
    let ptId = "";
    try {
      const pt = typeof ptRaw === "string" ? JSON.parse(ptRaw) : ptRaw;
      ptId = pt?.id || "";
    } catch { /* ignore */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indexer = (item as any).indexerName;
    if (ptId === "PE") return 0;
    if (ptId === "PM" && (!indexer || indexer === "REAL")) return 0;
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
      client.totalOverdue += effectiveAmount(item) + calcEncargos(item);
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
      else if (field === "companies") cmp = (a.companies[0] || "").localeCompare(b.companies[0] || "");
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
  // === KPIs (use filtered data) ===
  const totalAPagar = useMemo(() =>
    filteredAPagar.reduce((s, i) => s + effectiveAmount(i), 0), [filteredAPagar]);

  const totalAtrasado = useMemo(() =>
    filteredAtrasadas.reduce((s, i) => s + effectiveAmount(i), 0), [filteredAtrasadas]);

  // bank movements now flow into filteredPagas via bankMovementsAsItems —
  // no need to add totalBankFees separately
  const totalPago = useMemo(() =>
    filteredPagas.reduce((s, i) => s + paidSum(i), 0), [filteredPagas, paidSum]);

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
    return filteredPagas.reduce((s, i) => {
      const payments = i.payments || [];
      const canceled = getEstornoPairs(payments);
      return s + payments
        .filter(p =>
          !canceled.has(p) &&
          p.paymentDate === hoje &&
          (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName))
        )
        .reduce((ps, p) => ps + p.netAmount, 0);
    }, 0);
  }, [filteredPagas, selectedOpTypes]);

  // Pagamentos realizados nos últimos 7 dias
  const pago7dias = useMemo(() => {
    const hoje = new Date();
    const d7 = new Date(hoje);
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().split("T")[0];
    const hojeStr = hoje.toISOString().split("T")[0];
    return filteredPagas.reduce((s, i) => {
      const payments = i.payments || [];
      const canceled = getEstornoPairs(payments);
      return s + payments
        .filter(p =>
          !canceled.has(p) &&
          p.paymentDate && p.paymentDate >= d7Str && p.paymentDate <= hojeStr &&
          (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName))
        )
        .reduce((ps, p) => ps + p.netAmount, 0);
    }, 0);
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
  type ChartValueField = "balance" | "paid" | "received" | "delinquent";

  const delinquentAmount = (item: SiengeIncome) => effectiveAmount(item) + calcEncargos(item);

  function buildCompanyChart(sourceItems: (SiengeOutcome | SiengeIncome)[], field: ChartValueField) {
    const map = new Map<string, number>();
    sourceItems.forEach(item => {
      const val = field === "delinquent"
        ? delinquentAmount(item as SiengeIncome)
        : field === "balance"
          ? effectiveAmount(item)
          : field === "received"
            ? receivedSum(item as SiengeIncome)
            : paidSum(item);
      if (val > 0) {
        map.set(item.companyName, (map.get(item.companyName) || 0) + val);
      }
    });
    // Bank movements are already part of filteredPagas via bankMovementsAsItems
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name: name.length > 20 ? name.substring(0, 20) + "..." : name,
        fullName: name,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }

  function buildMonthlyChart(filteredItems: (SiengeOutcome | SiengeIncome)[], field: ChartValueField, skipPastMonths = false) {
    const currentMonth = new Date().getMonth(); // 0-indexed
    if (field === "paid") {
      // Agrupa pagamentos por paymentDate (data real do pagamento), filtrando pelo ano selecionado
      const monthTotals = new Map<number, number>();
      filteredItems.forEach(item => {
        const payments = item.payments || [];
        const canceled = getEstornoPairs(payments);
        payments
          .filter(p =>
            !canceled.has(p) &&
            (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
            matchesSelectedPaymentDate(p.paymentDate)
          )
          .forEach(p => {
            const m = new Date(p.paymentDate + "T00:00:00").getMonth();
            monthTotals.set(m, (monthTotals.get(m) || 0) + p.netAmount);
          });
      });
      // Bank movements are already part of filteredPagas via bankMovementsAsItems
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
            matchesSelectedPaymentDate(p.paymentDate)
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
      const value = monthItems.reduce((s, i) => s + (field === "delinquent" ? delinquentAmount(i as SiengeIncome) : effectiveAmount(i)), 0);
      return { month: label, value };
    }).filter(Boolean) as { month: string; value: number }[];
  }

  // Daily chart: requires exactly 1 year + 1 month selected. Groups by day-of-month (01-NN).
  function buildDailyChart(filteredItems: (SiengeOutcome | SiengeIncome)[], field: ChartValueField): { month: string; value: number }[] {
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
      // Bank movements are already part of filteredItems via bankMovementsAsItems
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
          dayTotals.set(d, (dayTotals.get(d) || 0) + (field === "delinquent" ? delinquentAmount(i as SiengeIncome) : effectiveAmount(i)));
        }
      });
    }

    const out: { month: string; value: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ month: String(d).padStart(2, "0"), value: dayTotals.get(d) || 0 });
    }
    return out;
  }

  function buildAnnualChart(filteredItems: (SiengeOutcome | SiengeIncome)[], field: ChartValueField) {
    if (field === "paid") {
      // Agrupa pagamentos por ano do paymentDate, filtrando pelo ano selecionado
      const yearMap = new Map<number, number>();
      filteredItems.forEach(item => {
        (item.payments || [])
          .filter(p =>
            (selectedOpTypes.size === 0 || selectedOpTypes.has(p.operationTypeName)) &&
            matchesSelectedPaymentDate(p.paymentDate)
          )
          .forEach(p => {
            const y = new Date(p.paymentDate + "T00:00:00").getFullYear();
            yearMap.set(y, (yearMap.get(y) || 0) + p.netAmount);
          });
      });
      // Bank movements are already part of filteredItems via bankMovementsAsItems
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
            matchesSelectedPaymentDate(p.paymentDate)
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
      yearMap.set(y, (yearMap.get(y) || 0) + (field === "delinquent" ? delinquentAmount(item as SiengeIncome) : effectiveAmount(item)));
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
        companyChart: buildCompanyChart(filteredInadimplencia, "delinquent"),
        monthly: buildMonthlyChart(filteredInadimplencia, "delinquent"),
        annual: buildAnnualChart(filteredInadimplencia, "delinquent"),
        daily: buildDailyChart(filteredInadimplencia, "delinquent"),
        color: "hsl(25, 95%, 53%)",
        label: "Inadimplente",
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items, incomeItems, allBankMovements, allBankMovementsFull, todayStr, selectedCompanies, selectedDocTypes, selectedYears, selectedMonths, selectedDays, duePeriodMaxDate, selectedOpTypes]);

  // === Loading State ===
  if (loading) {
    return (
      <>
        {/* Skeletons no fundo */}
        <div className="space-y-8 p-1">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-64 bg-slate-200 dark:bg-slate-800" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-28 bg-slate-200 dark:bg-slate-800" />
              <Skeleton className="h-10 w-64 bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-[420px] rounded-xl bg-slate-200 dark:bg-slate-800" />
            <Skeleton className="h-[420px] rounded-xl lg:col-span-2 bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>

        {/* Modal centralizado */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-md mx-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Top gradient bar */}
            <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

            <div className="p-8 flex flex-col items-center text-center">
              {/* Spinner animado em camadas */}
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 blur-xl animate-pulse" />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/40">
                  <Loader2 className="h-10 w-10 animate-spin text-blue-500" strokeWidth={2.5} />
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                Carregando Painel Executivo
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Sincronizando dados financeiros do Sienge...
              </p>

              {/* Pontos animados */}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>

              {/* Etapas */}
              <div className="mt-6 w-full space-y-2 text-left">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Buscando contas a pagar e receber
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: "200ms" }} />
                  Calculando saldos e movimentações
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: "400ms" }} />
                  Consolidando indicadores por empresa
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
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
      {
        label: "Credores",
        value: String(new Set(filteredAPagar.map(i => i.creditorName)).size),
        subtitle: showCounterpartDetail ? "clique para fechar" : "clique para detalhar",
        icon: <FileText className="h-7 w-7 text-blue-500" />,
        iconBg: "bg-blue-50",
        gradient: "from-blue-500 to-blue-600",
        onClick: () => setShowCounterpartDetail(v => !v),
      },
    ],
    "pagas": [
      {
        label: "Total Pago",
        value: formatCurrency(totalPago),
        subtitle: (() => {
          const tarifas = filteredPagas.filter(i => i.originId === "BM").length;
          const titulos = filteredPagas.length - tarifas;
          return tarifas > 0 ? `${titulos} titulos + ${tarifas} tarifas` : `${titulos} titulos`;
        })(),
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
        subtitle: showCounterpartDetail ? "clique para fechar" : "clique para detalhar",
        icon: <FileText className="h-7 w-7 text-blue-500" />,
        iconBg: "bg-blue-50",
        gradient: "from-blue-500 to-blue-600",
        onClick: () => setShowCounterpartDetail(v => !v),
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
      {
        label: "Clientes",
        value: String(new Set(filteredAReceber.map(i => i.clientName)).size),
        subtitle: showCounterpartDetail ? "clique para fechar" : "clique para detalhar",
        icon: <Users className="h-7 w-7 text-emerald-500" />,
        iconBg: "bg-emerald-50",
        gradient: "from-emerald-500 to-emerald-600",
        onClick: () => setShowCounterpartDetail(v => !v),
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
        subtitle: showCounterpartDetail ? "clique para fechar" : "clique para detalhar",
        icon: <Users className="h-7 w-7 text-sky-500" />,
        iconBg: "bg-sky-50",
        gradient: "from-sky-500 to-sky-600",
        onClick: () => setShowCounterpartDetail(v => !v),
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
    dre: [],
    "dre-api": [],
    "calendario-pagamento": [],
    "calendario-recebimento": [],
    saldos: [],
    "visao-geral": [],
    resumo: [],
    indicadores: [],
    comparativo: [],
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
      {/* Refresh progress modal */}
      {refreshing && refreshSteps.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-[420px] max-w-[90vw]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Atualizando dados</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Buscando do Sienge — pode levar até 2 minutos</p>
              </div>
            </div>
            <ul className="space-y-2">
              {refreshSteps.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 min-w-0">
                    {s.status === "running" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />}
                    {s.status === "done" && <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {s.status === "error" && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                    {s.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />}
                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{s.label}</span>
                  </div>
                  {s.detail && (
                    <span className={`text-xs tabular-nums shrink-0 ${
                      s.status === "done" ? "text-emerald-600 dark:text-emerald-400" :
                      s.status === "error" ? "text-red-500" : "text-slate-400"
                    }`}>{s.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Painel Executivo</h1>
            <p className="text-slate-500 mt-1">
              {isHolding ? "Visao consolidada da Holding" : "Visao consolidada do empreendimento"}
            </p>
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
                section === "cp" && !["orcamento", "dre", "saldos", "visao-geral"].includes(activeTab)
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
            {!isHolding && (
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
            )}
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
            {/* Botao DRE API removido em 2026-05-13: decidimos manter DRE
                via Excel (Sienge calcula 100% correto, bulk API nao expoe
                campos necessarios pra replicar). Endpoints /api/dre-api/*
                e tab 'dre-api' preservados no codigo pra eventual retomada. */}
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
            <button
              onClick={() => {
                setSection("cp");
                switchTab("indicadores");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "indicadores"
                  ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-md ring-2 ring-amber-300 dark:ring-amber-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title="CUB-SC, CDI, IPCA, IGP-M e INCC"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Indicadores
            </button>
            <button
              onClick={() => {
                setSection("cp");
                switchTab("comparativo");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === "comparativo"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md ring-2 ring-indigo-300 dark:ring-indigo-500/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title="Comparar períodos (ex.: 1º sem 2026 vs 2025)"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Comparativo
            </button>
          </div>
        </div>

        {/* Sub-tabs CP/CR - separate line */}
        {activeTab !== "visao-geral" && activeTab !== "orcamento" && activeTab !== "dre" && activeTab !== "dre-api" && activeTab !== "saldos" && activeTab !== "resumo" && activeTab !== "indicadores" && activeTab !== "comparativo" && activeTab !== "calendario-pagamento" && activeTab !== "calendario-recebimento" && (
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
                  <TabsTrigger value="calendario-pagamento" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${(activeTab as string) === "calendario-pagamento" ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <CalendarDays className="h-4 w-4" />
                    Calendário
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
                  <TabsTrigger value="calendario-recebimento" className={`gap-2 px-5 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${(activeTab as string) === "calendario-recebimento" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <CalendarDays className="h-4 w-4" />
                    Calendário
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
                localStorage.setItem(filterTabKey(activeTab, "opTypes"), JSON.stringify([...selectedOpTypes]));
                toast.success("Padrao de operacoes salvo!");
              }}
            />
          )}
        </div>}
        {(activeTab === "dre" || activeTab === "dre-api") && <div className="flex items-center gap-2 flex-wrap">
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
              localStorage.setItem(filterTabKey(activeTab, "years"), JSON.stringify([...selectedYears]));
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
            quickFilters={[
              { label: "1º Trim", values: ["01", "02", "03"] },
              { label: "2º Trim", values: ["04", "05", "06"] },
              { label: "3º Trim", values: ["07", "08", "09"] },
              { label: "4º Trim", values: ["10", "11", "12"] },
              { label: "1º Sem", values: ["01", "02", "03", "04", "05", "06"] },
              { label: "2º Sem", values: ["07", "08", "09", "10", "11", "12"] },
            ]}
            onSelectValues={(vals) => setSelectedMonths(new Set(vals))}
          />
        </div>}
        {activeTab !== "orcamento" && activeTab !== "dre" && activeTab !== "dre-api" && activeTab !== "indicadores" && <div className="flex items-center gap-2 flex-wrap">
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
                localStorage.setItem(filterTabKey(activeTab, "opTypes"), JSON.stringify([...selectedOpTypes]));
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
                localStorage.setItem(filterTabKey(activeTab, "docNumbers"), JSON.stringify([...selectedDocNumbers]));
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
              localStorage.setItem(filterTabKey(activeTab, "docTypes"), JSON.stringify([...selectedDocTypes]));
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
              localStorage.setItem(filterTabKey(activeTab, "years"), JSON.stringify([...selectedYears]));
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
            quickFilters={[
              { label: "1º Trim", values: ["01", "02", "03"].filter(m => availableMonths.includes(m)) },
              { label: "2º Trim", values: ["04", "05", "06"].filter(m => availableMonths.includes(m)) },
              { label: "3º Trim", values: ["07", "08", "09"].filter(m => availableMonths.includes(m)) },
              { label: "4º Trim", values: ["10", "11", "12"].filter(m => availableMonths.includes(m)) },
              { label: "1º Sem", values: ["01", "02", "03", "04", "05", "06"].filter(m => availableMonths.includes(m)) },
              { label: "2º Sem", values: ["07", "08", "09", "10", "11", "12"].filter(m => availableMonths.includes(m)) },
            ].filter(qf => qf.values.length > 0)}
            onSelectValues={(vals) => setSelectedMonths(new Set(vals))}
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
              const savedDoc = localStorage.getItem(filterTabKey(activeTab, "docTypes")) || localStorage.getItem("dashboard_default_docTypes");
              setSelectedDocTypes(savedDoc ? new Set(JSON.parse(savedDoc)) : new Set(allDocTypes.filter(t => !isExcludedDocType(t))));
              setSelectedMonths(new Set());
              setSelectedDays(new Set());
              setSelectedDuePeriods(new Set());
              setSelectedDocNumbers(new Set());
              const savedOp = localStorage.getItem(filterTabKey(activeTab, "opTypes")) || localStorage.getItem("dashboard_default_opTypes_v2");
              setSelectedOpTypes(savedOp ? new Set(JSON.parse(savedOp)) : new Set(["Pagamento"]));
              const savedYrs = localStorage.getItem(filterTabKey(activeTab, "years")) || localStorage.getItem("dashboard_default_years");
              if (savedYrs) {
                setSelectedYears(new Set(JSON.parse(savedYrs)));
              } else {
                const defaultYrs: string[] = [];
                for (let y = currentYear - 10; y <= currentYear; y++) defaultYrs.push(String(y));
                setSelectedYears(new Set(defaultYrs));
              }
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
          <Card className="border border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl overflow-hidden mt-2">
            <CardContent className="p-0">
              {budgetData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Ruler className="h-12 w-12 mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-medium">Nenhum empreendimento configurado</p>
                  <p className="text-xs mt-1">Configure os empreendimentos em Configuracoes → Empreendimentos</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-800 text-slate-100 sticky top-0 z-10">
                      <TableRow className="hover:bg-slate-800 border-b border-slate-700">
                        {[
                          { field: "companyName", label: "Empreendimento", align: "left", widthClass: "px-6" },
                          { field: "factor", label: "Fator", align: "center", widthClass: "w-20" },
                          { field: "budget", label: "Orçamento", align: "right", widthClass: "" },
                          { field: "realized", label: "Realizado", align: "right", widthClass: "" },
                          { field: "percentReal", label: "% Real", align: "center", widthClass: "w-28" },
                          { field: "toRealize", label: "À Realizar", align: "right", widthClass: "" },
                          { field: "status", label: "Status", align: "center", widthClass: "w-32" },
                        ].map(col => (
                          <TableHead
                            key={col.field}
                            onClick={() => toggleBudgetSort(col.field)}
                            className={`font-bold text-[11px] text-slate-200 uppercase tracking-widest h-11 cursor-pointer hover:bg-slate-700 transition-colors select-none ${col.widthClass} ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                          >
                            <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "justify-end w-full" : col.align === "center" ? "justify-center w-full" : ""}`}>
                              {col.label}
                              {budgetSort.field === col.field ? (
                                budgetSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-40" />
                              )}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100/80 dark:divide-slate-800/80">
                      {sortedBudgetData.map((row) => {
                        const isFinalizada = row.status === "Finalizada";
                        return (
                          <TableRow key={row.companyId} className={`transition-colors h-14 ${isFinalizada ? "bg-slate-50/50 hover:bg-slate-50 dark:bg-slate-800/30 dark:hover:bg-slate-800/50" : "bg-white hover:bg-slate-50/80 dark:bg-transparent dark:hover:bg-slate-800/40"}`}>
                            <TableCell className={`px-6 font-semibold text-[13px] ${isFinalizada ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"}`}>{row.companyName}</TableCell>
                            <TableCell className="text-center text-[13px] font-medium">
                              <FactorInput
                                companyId={row.companyId}
                                companyName={row.companyName}
                                areaM2={row.areaM2}
                                status={companySettings.find(cs => cs.companyId === row.companyId)?.status || "ativa"}
                                controlaOrcamento={companySettings.find(cs => cs.companyId === row.companyId)?.controlaOrcamento || false}
                                value={row.factor}
                                onSaved={(newFactor) => {
                                  setCompanySettings(prev => prev.map(cs =>
                                    cs.companyId === row.companyId ? { ...cs, factor: newFactor } : cs
                                  ));
                                }}
                              />
                            </TableCell>
                            <TableCell className={`text-right tabular-nums text-[13px] ${isFinalizada ? "text-slate-400 dark:text-slate-500 font-medium" : "text-slate-600 dark:text-slate-300 font-semibold"}`}>{formatCurrency(row.budget)}</TableCell>
                            <TableCell className={`text-right tabular-nums text-[13px] ${isFinalizada ? "text-slate-400 dark:text-slate-500 font-medium" : "text-slate-600 dark:text-slate-300 font-semibold"}`}>{formatCurrency(row.realized)}</TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[12px] font-bold tabular-nums ${row.percentReal >= 100 ? "bg-amber-100/50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : row.percentReal >= 70 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"} ${isFinalizada ? "opacity-60 grayscale-[0.5]" : ""}`}>
                                {row.percentReal.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className={`text-right tabular-nums text-[13px] font-bold ${row.toRealize < 0 ? (isFinalizada ? "text-rose-400 dark:text-red-300/70" : "text-rose-600 dark:text-red-400") : (isFinalizada ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-100")}`}>
                              {row.toRealize < 0 && <TrendingDown className="inline h-3.5 w-3.5 mr-1" />}
                              {formatCurrency(row.toRealize)}
                            </TableCell>
                            <TableCell className="text-center px-4">
                              {isFinalizada ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200/80 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                                  FINALIZADA
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30">
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

      {/* KPI Cards. Nas abas CP/CR compactamos pra caber tudo numa
          viewport sem barra de scroll (gap menor, padding interno menor). */}
      {activeTab !== "visao-geral" && activeTab !== "orcamento" && activeTab !== "dre" && activeTab !== "dre-api" && activeTab !== "saldos" && activeTab !== "resumo" && activeTab !== "indicadores" && activeTab !== "comparativo" && activeTab !== "calendario-pagamento" && activeTab !== "calendario-recebimento" && (() => {
        const cpCrTabs = ["a-pagar", "pagas", "atrasadas", "a-receber", "recebidas", "inadimplencia"];
        const isCompact = cpCrTabs.includes(activeTab);
        return (<><div className={`grid md:grid-cols-2 lg:grid-cols-${kpis.length} ${isCompact ? "gap-3" : "gap-5"}`}>
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className={`border-0 shadow-sm overflow-hidden relative group hover:shadow-md transition-all duration-300 dark:bg-slate-900 ${kpi.onClick ? "cursor-pointer" : ""} ${kpi.onClick && (showDelinquentTable || showOverdueTable || showCounterpartDetail) ? "ring-2 ring-red-400 ring-offset-1" : ""}`}
            onClick={kpi.onClick}
          >
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${kpi.gradient}`} />
            <CardContent className={isCompact ? "pt-4 pb-3 px-5" : "pt-6 pb-5 px-6"}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    {kpi.label}
                  </p>
                  <p className="text-lg lg:text-xl xl:text-2xl font-bold text-slate-800 dark:text-slate-50 mt-2 tabular-nums truncate">
                    {kpi.value}
                  </p>
                  {kpi.subtitle && (
                    <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">{kpi.subtitle}</p>
                  )}
                  {kpi.trend != null && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <div
                        className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          kpi.trend >= 0
                            ? "text-emerald-600 bg-emerald-50 dark:text-emerald-300/80 dark:bg-emerald-950/40"
                            : "text-red-600 bg-red-50 dark:text-red-300/70 dark:bg-red-950/40"
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

      {/* Row 2: Company + Monthly
          Todas as abas CP/CR mostram so 2 graficos por padrao (tabelas
          de detalhe sao opt-in via clique no KPI). Compactam pra caber
          tudo numa viewport sem barra de scroll. */}
      {(() => {
        const cpCrTabs = ["a-pagar", "pagas", "atrasadas", "a-receber", "recebidas", "inadimplencia"];
        const compactCharts = cpCrTabs.includes(activeTab);
        const chartHeight = compactCharts ? 360 : 480;
        const companyChartHeight = compactCharts
          ? Math.max(360, companyChart.length * 36)
          : Math.max(480, companyChart.length * 44);
        return (
      <div className={`grid ${isHolding ? "" : "lg:grid-cols-5"} ${compactCharts ? "gap-3" : "gap-6"}`}>
        {/* Company Breakdown — escondido no modo Holding (só 1 empresa) */}
        {!isHolding && <Card className="border-0 shadow-sm lg:col-span-2">
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
              <ResponsiveContainer width="100%" height={companyChartHeight}>
                <BarChart
                  data={companyChart}
                  layout="vertical"
                  margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} horizontal={false} />
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
                    maxBarSize={32}
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
              <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height: companyChartHeight }}>
                Sem dados para o periodo selecionado
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Monthly/Annual Evolution */}
        <Card className={`border-0 shadow-sm ${isHolding ? "" : "lg:col-span-3"}`}>
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
              <div className="flex items-center justify-center text-slate-400 text-sm text-center px-6" style={{ height: chartHeight }}>
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
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={chartData} margin={{ top: 35, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} vertical={false} />
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
                          <text x={cx} y={(y || 0) - 14} textAnchor="middle" fontSize={11} fill={chartColors.mutedText} fontWeight={600}>
                            {formatCompactCurrency(Number(value))}
                          </text>
                          {pct !== null && pct !== undefined && (
                            <text x={cx} y={(y || 0) - 2} textAnchor="middle" fontSize={9} fill={pct >= 0 ? chartColors.red : chartColors.green} fontWeight={500}>
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
        );
      })()}

      {/* Overdue Table (CP - Contas em Atraso) */}
      {/* Detalhamento por Credor/Cliente (a-pagar, pagas, a-receber, recebidas) */}
      {showCounterpartDetail && activeTab === "a-pagar" && (
        <DetalhamentoTable
          title="Detalhamento de Contas a Pagar por Credor"
          items={filteredAPagar}
          getCounterpart={i => (i as SiengeOutcome).creditorName || `Credor ${(i as SiengeOutcome).creditorId}`}
          amountFn={i => effectiveAmount(i)}
          counterpartLabel="Credor"
          countLabel="Parcelas"
          totalLabel="Total a Pagar"
          accent="blue"
          sortItems={(a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")}
          detailColumns={[
            { label: "Título", render: i => `${i.billId}/${i.installmentId}` },
            { label: "Documento", render: i => i.documentNumber || "-" },
            { label: "Vencimento", render: i => formatDate(i.dueDate) },
            { label: "Valor Original", align: "right", render: i => formatCurrency(i.originalAmount) },
            { label: "Saldo", align: "right", render: i => formatCurrency(effectiveAmount(i)) },
            { label: "Empresa", render: i => i.companyName },
          ]}
          onClose={() => setShowCounterpartDetail(false)}
        />
      )}
      {showCounterpartDetail && activeTab === "pagas" && (
        <DetalhamentoTable
          title="Detalhamento de Contas Pagas por Credor"
          items={filteredPagas}
          getCounterpart={i => (i as SiengeOutcome).creditorName || `Credor ${(i as SiengeOutcome).creditorId}`}
          amountFn={i => paidSum(i)}
          counterpartLabel="Credor"
          countLabel="Pagamentos"
          totalLabel="Total Pago"
          accent="blue"
          sortItems={(a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")}
          detailColumns={[
            { label: "Título", render: i => `${i.billId}/${i.installmentId}` },
            { label: "Documento", render: i => i.documentNumber || "-" },
            { label: "Última baixa", render: i => { const d = (i.payments || []).map(p => p.paymentDate).filter(Boolean).sort().pop(); return d ? formatDate(d) : "-"; } },
            { label: "Empresa", render: i => i.companyName },
            { label: "Valor Pago", align: "right", render: i => formatCurrency(paidSum(i)) },
          ]}
          onClose={() => setShowCounterpartDetail(false)}
        />
      )}
      {showCounterpartDetail && activeTab === "a-receber" && (
        <DetalhamentoTable
          title="Detalhamento de Contas a Receber por Cliente"
          items={filteredAReceber}
          getCounterpart={i => (i as SiengeIncome).clientName || `Cliente ${(i as SiengeIncome).clientId}`}
          amountFn={i => effectiveAmount(i)}
          counterpartLabel="Cliente"
          countLabel="Parcelas"
          totalLabel="Total a Receber"
          accent="emerald"
          sortItems={(a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")}
          detailColumns={[
            { label: "Título", render: i => `${i.billId}/${i.installmentId}` },
            { label: "Documento", render: i => i.documentNumber || "-" },
            { label: "Vencimento", render: i => formatDate(i.dueDate) },
            { label: "Valor Original", align: "right", render: i => formatCurrency(i.originalAmount) },
            { label: "Saldo", align: "right", render: i => formatCurrency(effectiveAmount(i)) },
            { label: "Empresa", render: i => i.companyName },
          ]}
          onClose={() => setShowCounterpartDetail(false)}
        />
      )}
      {showCounterpartDetail && activeTab === "recebidas" && (
        <DetalhamentoTable
          title="Detalhamento de Contas Recebidas por Cliente"
          items={filteredRecebidas}
          getCounterpart={i => (i as SiengeIncome).clientName || `Cliente ${(i as SiengeIncome).clientId}`}
          amountFn={i => receivedSum(i as SiengeIncome)}
          counterpartLabel="Cliente"
          countLabel="Recebimentos"
          totalLabel="Total Recebido"
          accent="emerald"
          sortItems={(a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")}
          detailColumns={[
            { label: "Título", render: i => `${i.billId}/${i.installmentId}` },
            { label: "Documento", render: i => i.documentNumber || "-" },
            { label: "Última baixa", render: i => { const d = (i.payments || []).map(p => p.paymentDate).filter(Boolean).sort().pop(); return d ? formatDate(d) : "-"; } },
            { label: "Empresa", render: i => i.companyName },
            { label: "Valor Recebido", align: "right", render: i => formatCurrency(receivedSum(i as SiengeIncome)) },
          ]}
          onClose={() => setShowCounterpartDetail(false)}
        />
      )}

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
      {showDelinquentTable && activeTab === "inadimplencia" && (() => {
        // Empresas unicas com inadimplencia (pra montar os chips de filtro)
        const companiesWithDelinquency = Array.from(
          new Set(delinquentsByClient.flatMap(c => c.companies))
        ).sort();
        // Filtra a lista de clientes pelos chips selecionados
        const visibleDelinquents = delinquentCompanyFilter
          ? delinquentsByClient.filter(c => c.companies.includes(delinquentCompanyFilter))
          : delinquentsByClient;
        const visibleParcels = visibleDelinquents.reduce((s, c) => s + c.installments, 0);
        return (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-800">Detalhamento de Inadimplencia</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  {visibleDelinquents.length} clientes inadimplentes - {visibleParcels} parcelas em atraso
                  {delinquentCompanyFilter && <span className="ml-2 text-orange-600 font-medium">· filtrado por {delinquentCompanyFilter}</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowDelinquentTable(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Chips de filtro rapido por empresa */}
            {companiesWithDelinquency.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                <button
                  type="button"
                  onClick={() => setDelinquentCompanyFilter(null)}
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
                    delinquentCompanyFilter === null
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Todas ({delinquentsByClient.length})
                </button>
                {companiesWithDelinquency.map(co => {
                  const count = delinquentsByClient.filter(c => c.companies.includes(co)).length;
                  const isActive = delinquentCompanyFilter === co;
                  return (
                    <button
                      key={co}
                      type="button"
                      onClick={() => setDelinquentCompanyFilter(isActive ? null : co)}
                      className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
                        isActive
                          ? "bg-orange-500 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {co} ({count})
                    </button>
                  );
                })}
              </div>
            )}
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
                      onClick={() => setDelinquentSort(s => ({ field: "companies", dir: s.field === "companies" && s.dir === "asc" ? "desc" : "asc" }))}
                    >
                      <div className="flex items-center gap-1">
                        Empresas
                        {delinquentSort.field === "companies" ? (delinquentSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
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
                  {visibleDelinquents.map((client) => {
                    const isExpanded = expandedClients.has(client.clientName);
                    // Quando alguma linha esta expandida, deixa as outras
                    // foscas (opacity-40) pra reduzir ruido visual.
                    const hasAnyExpanded = expandedClients.size > 0;
                    const isDimmed = hasAnyExpanded && !isExpanded;
                    return (
                      <React.Fragment key={client.clientName}>
                        <TableRow
                          className={`cursor-pointer hover:bg-slate-50 transition-all ${
                            isDimmed ? "opacity-40 hover:opacity-100" : ""
                          }`}
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
                              {client.companies.map(c => (
                                <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{c}</span>
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
                                      <th className="text-right py-2 font-semibold pr-8">Total</th>
                                      <th className="text-left py-2 font-semibold pl-4">Empreendimento</th>
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
                                          <td className="py-2 text-right tabular-nums font-semibold text-red-600 dark:text-red-300/70 pr-8">{formatCurrency(effectiveAmount(item) + calcEncargos(item))}</td>
                                          <td className="py-2 text-slate-600 text-xs pl-4">{item.projectName}</td>
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
                <span><strong className="text-slate-700">{visibleDelinquents.length}</strong> clientes</span>
                <span><strong className="text-slate-700">{visibleParcels}</strong> parcelas</span>
              </div>
              <div className="text-sm font-bold text-red-600 dark:text-red-300/70">
                Total: {formatCurrency(visibleDelinquents.reduce((s, c) => s + c.totalOverdue, 0))}
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}
      </>);
      })()}

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
        const totalInadimplencia = filteredInadimplencia.reduce((s, i) => s + effectiveAmount(i) + calcEncargos(i), 0);
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
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
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
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
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
          refreshKey={refreshKey}
          dataSource="excel"
        />
      )}

      {activeTab === "dre-api" && (
        <DreTab
          outcomeItems={consistentItems}
          incomeItems={consistentIncome}
          bankFees={allBankMovements}
          allBankMovements={allBankMovementsFull}
          selectedYears={selectedYears}
          selectedMonths={selectedMonths}
          selectedCompanies={selectedCompanies}
          refreshKey={refreshKey}
          dataSource="api"
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

            // Filtra SÓ pelo seletor de Contas (selectedBankAccounts). NÃO aplica o
            // filtro de "Empresas" (selectedCompanies): ele é orientado a CP/CR e não
            // inclui os empreendimentos donos de contas bancárias (ex.: Serenity comp10,
            // Rozza comp11). Aplicá-lo derrubava essas contas e fazia o total da aba
            // divergir do card "Saldo Bancário" do Geral (que usa a mesma base de contas).
            const filteredAccounts = bankAccounts.filter(a => effectiveSelected.has(String(a.bankAccountId)));

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
                      localStorage.setItem("dashboard_saldos_accounts_v2", JSON.stringify(Array.from(selectedBankAccounts)));
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
                      localStorage.removeItem("dashboard_saldos_accounts_v2");
                      const validNums = new Set<string>(
                        bankAccounts
                          .filter(a => a.isInDimBanco)
                          .map(a => String(a.bankAccountId))
                      );
                      setSelectedBankAccounts(validNums);
                      localStorage.setItem("dashboard_saldos_accounts_v2", JSON.stringify(Array.from(validNums)));
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
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
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
                              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
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

        // Total Recebido — usa EXATAMENTE itemsRecebidas + receivedSum, mesma
        // base que filteredRecebidas da pagina Contas Recebidas. itemsRecebidas
        // ja exige originalAmount > 0 + payment com matchesSelectedPaymentDate.
        // NAO aplica selectedDocTypes (filteredRecebidas tambem nao aplica —
        // ver comentario linha 1150-1152) — senao BMs orfaos com
        // documentIdentificationName="MOV. BANCARIO" sao cortados.
        itemsRecebidas.forEach(item => {
          const co = item.companyName;
          if (!companySummary[co]) return;
          companySummary[co].totalRecebido += receivedSum(item);
        });

        // Total Pago — usa EXATAMENTE itemsPagas + paidSum, mesma base que
        // filteredPagas da pagina Contas Pagas. selectedDocTypes aplicado pra
        // espelhar filteredPagas (linha 1134).
        itemsPagas.forEach(item => {
          const co = item.companyName;
          if (!companySummary[co]) return;
          if (selectedDocTypes.size > 0 && !selectedDocTypes.has(item.documentIdentificationName)) return;
          companySummary[co].totalPago += paidSum(item);
        });

        // Total a Receber — soma effectiveAmount(item) (= correctedBalanceAmount
        // - discountAmount) de itemsAReceber. Aplica selectedDocTypes (com
        // excecao das locacoes HOLDING) e duePeriodMaxDate (filtro Vencimento),
        // mas NAO aplica selectedYears/Months/Days porque esses filtros se
        // referem ao paymentDate (Total Recebido/Pago) e cortar dueDate por
        // ano excluiria parcelas com vencimento futuro alem do range de anos
        // selecionado. A carteira aberta deve aparecer integral.
        itemsAReceber.forEach(item => {
          const co = item.companyName;
          if (!companySummary[co]) return;
          if (selectedDocTypes.size > 0 && !(
            selectedDocTypes.has(item.documentIdentificationName) ||
            shouldKeepIncomeExcludedDoc(item.companyId, item.billId, item.installmentId)
          )) return;
          if (duePeriodMaxDate && !(item.dueDate && item.dueDate <= duePeriodMaxDate)) return;
          companySummary[co].totalAReceber += effectiveAmount(item);
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
            {/* Filtros próprios da aba Resumo foram removidos em 2026-05-09:
                Total Pago/Recebido agora usa exatamente paidSum/receivedSum
                das paginas Contas Pagas/Recebidas. Filtros de Tipo Op. sao
                herdados da aba CP (selectedOpTypes) — Resumo bate 100% com
                CP/CR sem o usuario ter que sincronizar dois filtros. */}

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
                          { field: "status", label: "Status", align: "center", minW: "80px" },
                          { field: "totalRecebido", label: "Total Recebido", align: "right", minW: "130px" },
                          { field: "totalPago", label: "Total Pago", align: "right", minW: "130px" },
                          { field: "lucroRealizado", label: "Lucro Realizado", align: "right", minW: "130px" },
                          { field: "totalAReceber", label: "Total a Receber", align: "right", minW: "130px" },
                          { field: "valorEstoque", label: "Valor Estoque", align: "right", minW: "120px" },
                          { field: "lucroPotencial", label: "Lucro Potencial", align: "right", minW: "130px" },
                          { field: "qtDisp", label: "Disp.", align: "center", minW: "60px" },
                          { field: "qtResTec", label: "Res.Téc.", align: "center", minW: "60px" },
                          { field: "lucratividade", label: "Lucratividade", align: "right", minW: "100px" },
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
                            <TableCell className="text-center">
                              <Badge variant={isFinalizada ? "secondary" : "outline"} className={`text-[10px] ${isFinalizada ? "bg-slate-200 dark:bg-slate-700 text-slate-500" : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"}`}>
                                {co.status}
                              </Badge>
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
                          </TableRow>
                        );
                      })}
                      {/* Total Row */}
                      <TableRow className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 font-bold">
                        <TableCell className="text-sm font-bold text-slate-800 dark:text-slate-100 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">Total</TableCell>
                        <TableCell />
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
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ══════ INDICADORES DE MERCADO TAB ══════ */}
      {activeTab === "indicadores" && (
        <IndicadoresTab />
      )}

      {/* ══════ COMPARATIVO TAB ══════ */}
      {activeTab === "comparativo" && (
        <ComparativoTab
          incomeItems={consistentIncomeForRecebidas}
          outcomeItems={consistentItemsForPagas}
          salesContracts={salesContracts}
          selectedCompanies={selectedCompanies}
          isHolding={isHolding}
          currentYear={currentYear}
        />
      )}

      {/* ══════ CALENDÁRIO DE PAGAMENTOS TAB ══════ */}
      {activeTab === "calendario-pagamento" && (
        <CalendarioPagamentoTab
          itemsAPagar={itemsAPagar}
          allOutcomeItems={consistentItems}
          selectedCompanies={selectedCompanies}
          selectedDocTypes={selectedDocTypes}
        />
      )}

      {/* ══════ CALENDÁRIO DE RECEBIMENTOS TAB ══════ */}
      {activeTab === "calendario-recebimento" && (
        <CalendarioRecebimentoTab
          itemsAReceber={itemsAReceber}
          allIncomeItems={consistentIncomeCR}
          selectedCompanies={selectedCompanies}
          selectedDocTypes={selectedDocTypes}
        />
      )}

    </div>
  );
}
