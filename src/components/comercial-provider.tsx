"use client";

// Estado e dados do módulo Comercial. Antes tudo isto vivia dentro de
// ExecutiveDashboard (aba "Comercial"); ao virar módulo com rotas próprias no
// menu lateral (22/10/2026, mesmo caminho feito no Financeiro da Leven), o
// estado passou para este provider — montado uma vez no layout do módulo —
// para que filtros e seleção sobrevivam à troca de página.
//
// Regra de ouro da migração: os NÚMEROS não mudam. Por isso:
//  - Chaves de localStorage são as mesmas da aba antiga (grupo "comercial").
//  - Empresas: a aba antiga abria com o padrão salvo do Comercial ou, sem
//    padrão, com nenhuma marcada (= todas). O mesmo vale aqui.
//  - As opções do filtro Empresas saem dos contratos e unidades (a aba antiga
//    listava as empresas dos títulos de /outcome, o que obrigava a baixar 15
//    anos de contas a pagar só para montar a lista). Nenhuma marcada = todas,
//    então os totais são os mesmos.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { SiengeSalesContract } from "@/types/sienge";
import { useCompanyMode } from "@/lib/company-context";
import { inferUnitTypeFromName, type ApiUnit, type SiengeComissao } from "@/lib/comercial-utils";

type SetS = React.Dispatch<React.SetStateAction<Set<string>>>;

export interface CubData { currentValue: number; currentMonth: string; monthlyVariation: number; yearlyAccumulated: number }
export interface CompanySetting { companyId: number; companyName: string; areaM2: number; factor: number; status: string; controlaOrcamento?: boolean }

interface ComercialContextValue {
  salesContracts: SiengeSalesContract[];
  apiUnits: ApiUnit[];
  comissoes: SiengeComissao[];
  cubData: CubData | null;
  companySettings: CompanySetting[];
  chartColors: { red: string; green: string; valueText: string; mutedText: string; gridStroke: string };
  loading: boolean;
  refreshing: boolean;
  lastUpdate: string | null;
  refresh: () => void;
  allCompanyNames: string[];
  availableYears: string[];
  selectedCompanies: Set<string>; setSelectedCompanies: SetS;
  selectedYears: Set<string>; setSelectedYears: SetS;
  selectedMonths: Set<string>; setSelectedMonths: SetS;
  expandedComercial: Set<string>; setExpandedComercial: SetS;
  comercialSort: { field: "name" | "contracts" | "totalValue" | "ticket" | "pct"; dir: "asc" | "desc" };
  setComercialSort: React.Dispatch<React.SetStateAction<ComercialContextValue["comercialSort"]>>;
  clienteSearch: string; setClienteSearch: React.Dispatch<React.SetStateAction<string>>;
  clientesSort: { field: "name" | "contracts" | "units" | "lastDate" | "totalValue"; dir: "asc" | "desc" };
  setClientesSort: React.Dispatch<React.SetStateAction<ComercialContextValue["clientesSort"]>>;
  comercialChartView: "anual" | "mensal"; setComercialChartView: React.Dispatch<React.SetStateAction<"anual" | "mensal">>;
  quadroView: "grade" | "espelho"; setQuadroView: React.Dispatch<React.SetStateAction<"grade" | "espelho">>;
  selectedUnitStatuses: Set<string>; setSelectedUnitStatuses: SetS;
  selectedContractStatuses: Set<string>; setSelectedContractStatuses: SetS;
  selectedUnitEnterprises: Set<string>; setSelectedUnitEnterprises: SetS;
  selectedUnitTypes: Set<string>; setSelectedUnitTypes: SetS;
  selectedUnits: Set<string>; setSelectedUnits: SetS;
  selectedUnitCustomers: Set<string>; setSelectedUnitCustomers: SetS;
  toggleInSet: (setter: SetS, name: string) => void;
}

const ComercialContext = createContext<ComercialContextValue | null>(null);

export function useComercial(): ComercialContextValue {
  const ctx = useContext(ComercialContext);
  if (!ctx) throw new Error("useComercial precisa estar dentro de <ComercialProvider>");
  return ctx;
}

export const COMPANY_KEY = "dashboard_companies_comercial";
export const YEARS_KEY = "dashboard_years_comercial";
const MONTHS_KEY = "dashboard_months_comercial";

function loadLs(key: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return new Set(JSON.parse(raw) as string[]); } catch { return null; }
}

export function ComercialProvider({ children }: { children: React.ReactNode }) {
  const currentYear = new Date().getFullYear();
  const { isHolding, holdingName } = useCompanyMode();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // Mesma paleta de executive-dashboard.tsx (charts SVG não respondem a dark:).
  const chartColors = useMemo(() => ({
    red: isDark ? "#fca5a5" : "#f87171",
    green: isDark ? "#86efac" : "#16a34a",
    valueText: isDark ? "#cbd5e1" : "#334155",
    mutedText: isDark ? "#94a3b8" : "#475569",
    gridStroke: isDark ? "rgba(148,163,184,0.08)" : "#e2e8f0",
  }), [isDark]);

  const [salesContracts, setSalesContracts] = useState<SiengeSalesContract[]>([]);
  const [apiUnits, setApiUnits] = useState<ApiUnit[]>([]);
  const [comissoes, setComissoes] = useState<SiengeComissao[]>([]);
  const [cubData, setCubData] = useState<CubData | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // ── Filtros globais ──
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<string>>(() => {
    const perTab = loadLs(YEARS_KEY);
    if (perTab) return perTab;
    const global = loadLs("dashboard_default_years");
    if (global) return global;
    const years: string[] = [];
    for (let y = currentYear - 10; y <= currentYear; y++) years.push(String(y));
    return new Set(years);
  });
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => loadLs(MONTHS_KEY) || new Set());

  // ── Estado das telas ──
  const [expandedComercial, setExpandedComercial] = useState<Set<string>>(new Set());
  const [comercialSort, setComercialSort] = useState<ComercialContextValue["comercialSort"]>({ field: "totalValue", dir: "desc" });
  const [clienteSearch, setClienteSearch] = useState("");
  const [clientesSort, setClientesSort] = useState<ComercialContextValue["clientesSort"]>({ field: "totalValue", dir: "desc" });
  const [comercialChartView, setComercialChartView] = useState<"anual" | "mensal">("anual");
  // Quadro Espelho: "grade" (lista plana) ou "espelho" (torre por pavimento)
  const [quadroView, setQuadroView] = useState<"grade" | "espelho">("espelho");
  const [selectedUnitStatuses, setSelectedUnitStatuses] = useState<Set<string>>(new Set());
  // Status de CONTRATO (Emitido/Cancelado/...) — filtro de Vendas e Clientes.
  // Separado de selectedUnitStatuses (Disponível/Vendida/...), que é status de UNIDADE
  // (Unidades/Quadro Espelho); compartilhar os dois zerava Vendas ao navegar da Visão Geral.
  const [selectedContractStatuses, setSelectedContractStatuses] = useState<Set<string>>(new Set());
  const [selectedUnitEnterprises, setSelectedUnitEnterprises] = useState<Set<string>>(new Set());
  const [selectedUnitTypes, setSelectedUnitTypes] = useState<Set<string>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [selectedUnitCustomers, setSelectedUnitCustomers] = useState<Set<string>>(new Set());

  const toggleInSet = useCallback((setter: SetS, name: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // ── Carga ──
  const fetchData = useCallback(async (forceRefresh = false) => {
    const refreshParam = forceRefresh ? "?forceRefresh=true" : "";
    if (forceRefresh) setRefreshing(true);
    try {
      const [contracts, units, commissions] = await Promise.all([
        fetch(`/api/sienge/sales-contracts${refreshParam}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/sienge/units${refreshParam}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/sienge/commissions${refreshParam}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (contracts) {
        setSalesContracts(contracts.data || []);
        if (contracts.cachedAt) {
          const d = new Date(contracts.cachedAt);
          setLastUpdate(`${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
        }
      }
      if (units) setApiUnits(units.data || []);
      if (commissions) setComissoes(commissions.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch("/api/cub").then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.currentValue) setCubData(data); }).catch(() => {});
    fetch("/api/company-settings").then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data) setCompanySettings(data.data); }).catch(() => {});
  }, []);

  // Default do filtro "Tipo Imóvel": pré-seleciona "Apartamento" uma vez, quando as unidades carregam.
  const defaultedUnitTypeRef = useRef(false);
  useEffect(() => {
    if (defaultedUnitTypeRef.current || apiUnits.length === 0) return;
    const tipos = Array.from(new Set(apiUnits.map(u => u.propertyType || inferUnitTypeFromName(u.name))));
    // "Apartamento" exato primeiro — /apartamento/i sozinho podia casar
    // "Apartamento (Permuta)" dependendo da ordem dos dados.
    const apartamento = tipos.find(t => /^apartamento$/i.test(t.trim()))
      || tipos.find(t => /apartamento/i.test(t) && !/permuta/i.test(t));
    if (apartamento) setSelectedUnitTypes(new Set([apartamento]));
    defaultedUnitTypeRef.current = true;
  }, [apiUnits]);

  // Default do filtro "Empreendimento": pré-seleciona TODOS uma vez, quando
  // unidades E contratos carregaram. Usa a UNIÃO dos nomes das duas fontes
  // pra nenhum contrato/unidade ficar de fora (totais idênticos ao sem filtro).
  const defaultedEnterprisesRef = useRef(false);
  useEffect(() => {
    if (defaultedEnterprisesRef.current || apiUnits.length === 0 || salesContracts.length === 0) return;
    const names = new Set<string>();
    apiUnits.forEach(u => { if (u.enterpriseName) names.add(u.enterpriseName); });
    salesContracts.forEach(c => names.add(c.enterpriseName || c.companyName));
    if (names.size > 0) setSelectedUnitEnterprises(prev => prev.size > 0 ? prev : names);
    defaultedEnterprisesRef.current = true;
  }, [apiUnits, salesContracts]);

  // ── Opções do filtro Empresas (modo SP sem a Holding, modo Holding só ela) ──
  const allCompanyNames = useMemo(() => {
    const names = new Set<string>();
    salesContracts.forEach(c => { if (c.companyName) names.add(c.companyName); });
    apiUnits.forEach(u => { if (u.companyName) names.add(u.companyName); });
    return Array.from(names)
      .filter(n => isHolding ? n === holdingName : n !== holdingName)
      .sort();
  }, [salesContracts, apiUnits, isHolding, holdingName]);

  const availableYears = useMemo(() => {
    const arr: string[] = [];
    for (let y = currentYear - 10; y <= currentYear; y++) arr.push(String(y));
    return arr;
  }, [currentYear]);

  // Padrão salvo do Comercial; sem padrão, nenhuma marcada (= todas), como a
  // aba antiga fazia ao entrar no Comercial vindo de outra aba.
  const companiesInitialized = useRef(false);
  useEffect(() => {
    if (allCompanyNames.length === 0 || companiesInitialized.current) return;
    companiesInitialized.current = true;
    const saved = loadLs(COMPANY_KEY);
    if (!saved) return;
    const valid = new Set([...saved].filter(c => allCompanyNames.includes(c)));
    if (valid.size > 0) setSelectedCompanies(valid);
  }, [allCompanyNames]);

  const value: ComercialContextValue = {
    salesContracts, apiUnits, comissoes, cubData, companySettings, chartColors,
    loading, refreshing, lastUpdate, refresh: () => fetchData(true),
    allCompanyNames, availableYears,
    selectedCompanies, setSelectedCompanies,
    selectedYears, setSelectedYears, selectedMonths, setSelectedMonths,
    expandedComercial, setExpandedComercial, comercialSort, setComercialSort,
    clienteSearch, setClienteSearch, clientesSort, setClientesSort,
    comercialChartView, setComercialChartView,
    quadroView, setQuadroView,
    selectedUnitStatuses, setSelectedUnitStatuses,
    selectedContractStatuses, setSelectedContractStatuses,
    selectedUnitEnterprises, setSelectedUnitEnterprises,
    selectedUnitTypes, setSelectedUnitTypes, selectedUnits, setSelectedUnits,
    selectedUnitCustomers, setSelectedUnitCustomers,
    toggleInSet,
  };

  return <ComercialContext.Provider value={value}>{children}</ComercialContext.Provider>;
}
