"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Settings,
  BarChart3,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { SiengeOutcome, SiengeBankMovement, SiengeIncome } from "@/types/sienge";
import { formatCurrency } from "@/lib/dashboard-utils";
import { toast } from "sonner";

interface DreMappingItem {
  financialPlanId: string;
  financialPlanName: string;
}

interface DreTabProps {
  outcomeItems: SiengeOutcome[];
  incomeItems: SiengeIncome[];
  bankFees: SiengeBankMovement[];
  selectedYears: Set<string>;
  selectedMonths: Set<string>;
  selectedCompanies: Set<string>;
}

const DRE_INPUT_CATEGORIES = [
  "receita_operacional",
  "custo_variavel",
  "custo_fixo",
  "despesas_financeiras",
  "despesas_tributarias",
  "imobilizacoes",
  "retiradas",
  "entradas_nao_operacionais",
  "saidas_nao_operacionais",
] as const;

// Categories where values should be negative (expenses/outflows)
const NEGATIVE_CATEGORIES = new Set([
  "custo_variavel",
  "custo_fixo",
  "despesas_financeiras",
  "despesas_tributarias",
  "imobilizacoes",
  "retiradas",
  "saidas_nao_operacionais",
]);

interface DreLineConfig {
  key: string;
  label: string;
  type: "input" | "calculated";
  number: number;
}

const DRE_LINES: DreLineConfig[] = [
  { key: "receita_operacional", label: "RECEITA OPERACIONAL", type: "input", number: 1 },
  { key: "custo_variavel", label: "CUSTO VARIAVEL", type: "input", number: 2 },
  { key: "lucro_bruto", label: "(=) LUCRO BRUTO", type: "calculated", number: 3 },
  { key: "custo_fixo", label: "CUSTO FIXO", type: "input", number: 4 },
  { key: "lucro_operacional", label: "(=) LUCRO OPERACIONAL", type: "calculated", number: 5 },
  { key: "despesas_financeiras", label: "DESPESAS FINANCEIRAS", type: "input", number: 6 },
  { key: "despesas_tributarias", label: "DESPESAS TRIBUTARIAS", type: "input", number: 7 },
  { key: "lucro_liquido", label: "(=) LUCRO LIQUIDO", type: "calculated", number: 8 },
  { key: "imobilizacoes", label: "IMOBILIZACOES", type: "input", number: 9 },
  { key: "retiradas", label: "RETIRADAS", type: "input", number: 10 },
  { key: "saldo", label: "(=) SALDO", type: "calculated", number: 11 },
  { key: "entradas_nao_operacionais", label: "ENTRADAS NAO OPERACIONAIS", type: "input", number: 12 },
  { key: "saidas_nao_operacionais", label: "SAIDAS NAO OPERACIONAIS", type: "input", number: 13 },
  { key: "variacao_caixa", label: "VARIACAO DE CAIXA", type: "calculated", number: 14 },
];

const KPI_LINES = [
  { key: "lucro_bruto", label: "Lucro Bruto" },
  { key: "lucro_operacional", label: "Lucro Operacional" },
  { key: "lucro_liquido", label: "Lucro Liquido" },
  { key: "saldo", label: "Saldo" },
  { key: "variacao_caixa", label: "Variacao de Caixa" },
];

// Detail record for level 3 (creditor/client within a financial account)
interface AccountDetail {
  name: string;
  amount: number;
}

// Level 2: financial account accumulator
interface AccountAccum {
  name: string;
  amount: number;
  details: Record<string, AccountDetail>; // keyed by creditor/client name
}

// Level 1: DRE category accumulator
interface CategoryAccum {
  total: number;
  accounts: Record<string, AccountAccum>; // keyed by financialCategoryId
}

export function DreTab({
  outcomeItems,
  incomeItems,
  bankFees,
  selectedYears,
  selectedMonths,
  selectedCompanies,
}: DreTabProps) {
  const [dreMappings, setDreMappings] = useState<Record<string, DreMappingItem[]>>({});
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [dreMode, setDreMode] = useState<"simples" | "completa">("simples");
  const [excelData, setExcelData] = useState<Record<string, number> | null>(null);
  const [excelCategoryTotals, setExcelCategoryTotals] = useState<Record<string, number> | null>(null);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [showExcel, setShowExcel] = useState(false);
  // Excel as supplementary data source for accounts not available in Sienge API
  const [excelSupplementary, setExcelSupplementary] = useState<Record<string, { name: string; amount: number }> | null>(null);

  useEffect(() => {
    fetch("/api/dre-mappings")
      .then(r => r.json())
      .then(j => setDreMappings(j.data || {}))
      .catch(() => {})
      .finally(() => setLoadingMappings(false));
  }, []);

  // Fetch DRE data from Excel/DB (primary source, filtered by company)
  useEffect(() => {
    if (selectedYears.size === 0) return;
    const year = Array.from(selectedYears).sort().pop();
    let url = `/api/dre-supplementary?year=${year}`;
    if (selectedCompanies.size > 0) {
      url += `&companies=${encodeURIComponent(Array.from(selectedCompanies).join(","))}`;
    }
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data || Object.keys(json.data).length === 0) {
          setExcelSupplementary(null);
          return;
        }
        setExcelSupplementary(json.data);
      })
      .catch(() => setExcelSupplementary(null));
  }, [selectedYears, selectedCompanies]);

  const fetchExcelData = useCallback(async () => {
    if (selectedYears.size === 0) return;
    setLoadingExcel(true);
    try {
      const year = Array.from(selectedYears).sort().pop();
      const res = await fetch(`/api/dre-excel-validation?year=${year}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      // Build lookup: accountId (dotted) -> yearTotal
      const byAccount: Record<string, number> = {};
      for (const acc of json.accounts || []) {
        // Convert dotted ID to Sienge format (remove dots): "1.01.01.02" -> "1010102"
        const siengeId = acc.accountId.replace(/\./g, "");
        byAccount[siengeId] = (byAccount[siengeId] || 0) + acc.yearTotal;
      }
      setExcelData(byAccount);
      // Build category totals
      const byCat: Record<string, number> = {};
      for (const cat of json.categories || []) {
        byCat[cat.category] = cat.total;
      }
      setExcelCategoryTotals(byCat);
      setShowExcel(true);
    } catch (err) {
      console.error("Excel validation error:", err);
      toast.error("Erro ao carregar dados do Excel. Verifique se o arquivo existe e o servidor foi reiniciado.");
      setExcelData(null);
      setExcelCategoryTotals(null);
    } finally {
      setLoadingExcel(false);
    }
  }, [selectedYears]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAccountExpand = useCallback((key: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Build DRE data - uses Excel data as primary source when available, falls back to Sienge API
  const dreData = useMemo(() => {
    if (Object.keys(dreMappings).length === 0) return null;

    // Build lookup: financialCategoryId -> dreCategory
    const fcToDre: Record<string, string> = {};
    for (const [cat, accounts] of Object.entries(dreMappings)) {
      for (const acc of accounts) {
        fcToDre[String(acc.financialPlanId)] = cat;
      }
    }

    // Initialize accumulators
    const accum: Record<string, CategoryAccum> = {};
    for (const cat of DRE_INPUT_CATEGORIES) {
      accum[cat] = { total: 0, accounts: {} };
    }

    const addToAccum = (dreCat: string, fcId: string, fcName: string, amount: number, detailName: string) => {
      if (!accum[dreCat]) return;
      accum[dreCat].total += amount;
      if (!accum[dreCat].accounts[fcId]) {
        accum[dreCat].accounts[fcId] = { name: fcName, amount: 0, details: {} };
      }
      accum[dreCat].accounts[fcId].amount += amount;
      const dKey = detailName || "Sem identificacao";
      if (!accum[dreCat].accounts[fcId].details[dKey]) {
        accum[dreCat].accounts[fcId].details[dKey] = { name: dKey, amount: 0 };
      }
      accum[dreCat].accounts[fcId].details[dKey].amount += amount;
    };

    const matchesFilters = (date: string, companyName: string) => {
      if (!date) return false;
      const year = date.substring(0, 4);
      const month = date.substring(5, 7);
      if (selectedYears.size > 0 && !selectedYears.has(year)) return false;
      if (selectedMonths.size > 0 && !selectedMonths.has(month)) return false;
      if (selectedCompanies.size > 0 && !selectedCompanies.has(companyName)) return false;
      return true;
    };

    // Helper: add Level 3 detail only (does NOT change Level 1+2 totals)
    const addDetailOnly = (dreCat: string, fcId: string, detailName: string, detailAmount: number) => {
      if (!accum[dreCat]?.accounts[fcId]) return;
      const dKey = detailName || "Sem identificacao";
      if (!accum[dreCat].accounts[fcId].details[dKey]) {
        accum[dreCat].accounts[fcId].details[dKey] = { name: dKey, amount: 0 };
      }
      accum[dreCat].accounts[fcId].details[dKey].amount += detailAmount;
    };

    // PRIMARY SOURCE: Excel data from database (matches Power BI exactly)
    if (excelSupplementary && Object.keys(excelSupplementary).length > 0) {
      // Step 1: Populate Level 1+2 totals from Excel (authoritative, no Level 3 placeholder)
      const excelFcToDre: Record<string, string> = {};
      for (const [fcId, data] of Object.entries(excelSupplementary)) {
        const excelItem = data as { name: string; amount: number; dreCategory: string };
        const dreCat = excelItem.dreCategory || fcToDre[fcId];
        if (!dreCat || !accum[dreCat]) continue;
        excelFcToDre[fcId] = dreCat;
        accum[dreCat].total += excelItem.amount;
        if (!accum[dreCat].accounts[fcId]) {
          accum[dreCat].accounts[fcId] = { name: excelItem.name, amount: 0, details: {} };
        }
        accum[dreCat].accounts[fcId].amount += excelItem.amount;
      }

      // Step 2: Enrich Level 3 with Sienge details (creditor/client names)
      const excelFcIds = new Set(Object.keys(excelSupplementary));

      for (const item of outcomeItems) {
        for (const payment of (item.payments || [])) {
          if (!matchesFilters(payment.paymentDate, item.companyName)) continue;
          for (const pc of (item.paymentsCategories || [])) {
            const fcId = String(pc.financialCategoryId);
            if (!excelFcIds.has(fcId)) continue;
            const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
            if (!dreCat) continue;
            const rate = (pc.financialCategoryRate || 100) / 100;
            const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
            addDetailOnly(dreCat, fcId, item.creditorName || "", payment.netAmount * rate * sign);
          }
        }
      }

      for (const item of incomeItems) {
        const pcs = item.paymentsCategories || [];
        if (pcs.length === 0) continue;
        for (const payment of (item.payments || [])) {
          const amount = payment.netAmount || 0;
          if (amount <= 0) continue;
          if (!matchesFilters(payment.paymentDate, item.companyName)) continue;
          for (const pc of pcs) {
            const fcId = String(pc.financialCategoryId);
            if (!excelFcIds.has(fcId)) continue;
            const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
            if (!dreCat) continue;
            const rate = (pc.financialCategoryRate || 100) / 100;
            addDetailOnly(dreCat, fcId, item.clientName || "", amount * rate);
          }
        }
      }

      for (const bm of bankFees) {
        if (!bm.bankMovementDate) continue;
        if (!matchesFilters(bm.bankMovementDate, bm.companyName)) continue;
        for (const fc of (bm.financialCategories || [])) {
          const fcId = String(fc.financialCategoryId);
          if (!excelFcIds.has(fcId)) continue;
          const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
          if (!dreCat) continue;
          const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
          addDetailOnly(dreCat, fcId, "Movimento Bancario", Math.abs(bm.bankMovementAmount) * sign);
        }
      }
    } else {
      // FALLBACK: Sienge API data (when Excel data not available)
      for (const item of outcomeItems) {
        for (const payment of (item.payments || [])) {
          if (!matchesFilters(payment.paymentDate, item.companyName)) continue;
          for (const pc of (item.paymentsCategories || [])) {
            const dreCat = fcToDre[String(pc.financialCategoryId)];
            if (!dreCat) continue;
            const rate = (pc.financialCategoryRate || 100) / 100;
            const allocated = payment.netAmount * rate;
            const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
            addToAccum(dreCat, String(pc.financialCategoryId), pc.financialCategoryName, allocated * sign, item.creditorName || "");
          }
        }
      }

      for (const item of incomeItems) {
        const pcs = item.paymentsCategories || [];
        if (pcs.length === 0) continue;
        const matchingPcs = pcs.filter(pc => fcToDre[String(pc.financialCategoryId)]);
        if (matchingPcs.length === 0) continue;
        for (const payment of (item.payments || [])) {
          const amount = payment.netAmount || 0;
          if (amount <= 0) continue;
          if (!matchesFilters(payment.paymentDate, item.companyName)) continue;
          for (const pc of matchingPcs) {
            const dreCat = fcToDre[String(pc.financialCategoryId)];
            if (!dreCat) continue;
            const rate = (pc.financialCategoryRate || 100) / 100;
            addToAccum(dreCat, String(pc.financialCategoryId), pc.financialCategoryName, amount * rate, item.clientName || "");
          }
        }
      }

      for (const bm of bankFees) {
        if (!bm.bankMovementDate) continue;
        if (selectedYears.size > 0 && !selectedYears.has(bm.bankMovementDate.substring(0, 4))) continue;
        if (selectedMonths.size > 0 && !selectedMonths.has(bm.bankMovementDate.substring(5, 7))) continue;
        if (selectedCompanies.size > 0 && !selectedCompanies.has(bm.companyName)) continue;
        for (const fc of (bm.financialCategories || [])) {
          const dreCat = fcToDre[String(fc.financialCategoryId)];
          if (!dreCat) continue;
          const amount = Math.abs(bm.bankMovementAmount);
          const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
          addToAccum(dreCat, String(fc.financialCategoryId), fc.financialCategoryName, amount * sign, "Movimento Bancario");
        }
      }
    }

    // Compute calculated lines
    const lucroBruto = accum.receita_operacional.total + accum.custo_variavel.total;
    const lucroOperacional = lucroBruto + accum.custo_fixo.total;
    const lucroLiquido = lucroOperacional + accum.despesas_financeiras.total + accum.despesas_tributarias.total;
    const saldo = lucroLiquido + accum.imobilizacoes.total + accum.retiradas.total;
    const variacaoCaixa = saldo + accum.entradas_nao_operacionais.total + accum.saidas_nao_operacionais.total;

    const calculated: Record<string, number> = {
      lucro_bruto: lucroBruto,
      lucro_operacional: lucroOperacional,
      lucro_liquido: lucroLiquido,
      saldo,
      variacao_caixa: variacaoCaixa,
    };

    return { accum, calculated, receitaOperacional: accum.receita_operacional.total };
  }, [dreMappings, outcomeItems, incomeItems, bankFees, selectedYears, selectedMonths, selectedCompanies, excelSupplementary]);

  if (loadingMappings) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!dreData || Object.keys(dreMappings).length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-16 text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-600 mb-2">DRE nao configurado</h3>
          <p className="text-sm text-slate-400 mb-4">
            Configure as contas do plano financeiro para cada categoria do DRE.
          </p>
          <Button
            variant="outline"
            onClick={() => window.open("/cadastros/dre", "_blank")}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Configurar DRE
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { accum, calculated, receitaOperacional } = dreData;

  const getValue = (line: DreLineConfig): number => {
    if (line.type === "calculated") return calculated[line.key] || 0;
    return accum[line.key]?.total || 0;
  };

  const getMargin = (value: number): string => {
    if (receitaOperacional === 0) return "0,0%";
    return ((value / receitaOperacional) * 100).toFixed(1).replace(".", ",") + "%";
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards - top highlight row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {KPI_LINES.map(kpi => {
          const value = calculated[kpi.key] || 0;
          const margin = getMargin(value);
          const isPositive = value >= 0;

          return (
            <div
              key={kpi.key}
              className={`relative rounded-xl p-4 shadow-sm border overflow-hidden ${
                isPositive
                  ? "bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 border-emerald-100"
                  : "bg-gradient-to-br from-red-50 via-white to-red-50/30 border-red-100"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">
                  {kpi.label}
                </span>
                <Badge variant="outline" className={`text-xs px-2 py-0.5 ${
                  isPositive ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"
                }`}>
                  {isPositive ? <TrendingUp className="h-3.5 w-3.5 mr-1" /> : <TrendingDown className="h-3.5 w-3.5 mr-1" />}
                  {margin}
                </Badge>
              </div>
              <div className={`text-lg font-bold tabular-nums ${
                isPositive ? "text-emerald-700" : "text-red-600"
              }`}>
                {formatCurrency(Math.abs(value))}
                {!isPositive && <span className="text-xs ml-0.5">-</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* DRE Table - full width */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {/* Toggle */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-700">DRE - Demonstracao do Resultado</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
                <button
                  onClick={() => setDreMode("simples")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    dreMode === "simples"
                      ? "bg-white text-slate-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  DRE Simples
                </button>
                <button
                  onClick={() => setDreMode("completa")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    dreMode === "completa"
                      ? "bg-white text-slate-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  DRE Completa
                </button>
              </div>
              <Button
                variant={showExcel ? "default" : "outline"}
                size="sm"
                className={`gap-1.5 text-xs h-7 ${showExcel ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}
                onClick={() => {
                  if (showExcel) { setShowExcel(false); }
                  else if (excelData) { setShowExcel(true); }
                  else { fetchExcelData(); }
                }}
                disabled={loadingExcel}
              >
                {loadingExcel ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                {showExcel ? "Ocultar Excel" : "Comparar Excel"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7"
                onClick={() => window.open("/cadastros/dre", "_blank")}
              >
                <Settings className="h-3 w-3" />
                Configurar
              </Button>
            </div>
          </div>

          {/* Table Header */}
          <div className={`grid items-center px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider ${
            showExcel ? "grid-cols-[auto_1fr_160px_160px_120px]" : "grid-cols-[auto_1fr_180px]"
          }`}>
            <span className="w-6" />
            <span>Conta</span>
            <span className="text-right">Realizado</span>
            {showExcel && <span className="text-right text-violet-600">Excel/Power BI</span>}
            {showExcel && <span className="text-right">Diferenca</span>}
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-50">
            {DRE_LINES.map(line => {
              const value = getValue(line);
              const isCalculated = line.type === "calculated";
              const isExpanded = expandedCategories.has(line.key);
              const categoryAccounts = accum[line.key]?.accounts || {};
              const hasAccounts = Object.keys(categoryAccounts).length > 0;
              const canExpand = !isCalculated && hasAccounts;

              return (
                <React.Fragment key={line.key}>
                  {/* Level 1: DRE Category Row */}
                  <div
                    className={`grid items-center px-6 py-3 transition-colors ${
                      showExcel ? "grid-cols-[auto_1fr_160px_160px_120px]" : "grid-cols-[auto_1fr_180px]"
                    } ${
                      isCalculated
                        ? value < 0
                          ? "bg-red-50/80 border-l-4 border-l-red-500"
                          : "bg-teal-50/80 border-l-4 border-l-teal-500"
                        : "hover:bg-slate-50/50 border-l-4 border-l-transparent"
                    } ${canExpand ? "cursor-pointer" : ""}`}
                    onClick={canExpand ? () => toggleExpand(line.key) : undefined}
                  >
                    <span className="w-6 flex items-center justify-center">
                      {canExpand && (
                        isExpanded
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </span>
                    <span className={`text-sm ${
                      isCalculated
                        ? value < 0
                          ? "font-bold text-red-700"
                          : "font-bold text-teal-800"
                        : "font-medium text-slate-700"
                    }`}>
                      {line.label}
                    </span>
                    <span className={`text-sm text-right tabular-nums ${
                      isCalculated
                        ? value < 0
                          ? "font-bold text-red-700"
                          : "font-bold text-teal-800"
                        : value < 0
                          ? "font-semibold text-red-600"
                          : "font-semibold text-slate-800"
                    }`}>
                      {formatCurrency(Math.abs(value))}
                      {value < 0 && <span className="text-xs ml-0.5">-</span>}
                    </span>
                    {showExcel && (() => {
                      const excelVal = excelCategoryTotals?.[line.key] ?? null;
                      if (excelVal === null) return <><span /><span /></>;
                      const diff = value - excelVal;
                      const pct = excelVal !== 0 ? Math.abs(diff / excelVal) * 100 : 0;
                      const isClose = pct < 1;
                      return (
                        <>
                          <span className="text-sm text-right tabular-nums font-semibold text-violet-700">
                            {formatCurrency(Math.abs(excelVal))}
                            {excelVal < 0 && <span className="text-xs ml-0.5">-</span>}
                          </span>
                          <span className={`text-xs text-right tabular-nums font-medium ${
                            isClose ? "text-emerald-600" : "text-amber-600"
                          }`}>
                            {Math.abs(diff) < 0.01 ? "OK" : (
                              <>
                                {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                                <span className="ml-1 text-[10px] opacity-70">({pct.toFixed(1)}%)</span>
                              </>
                            )}
                          </span>
                        </>
                      );
                    })()}
                  </div>

                  {/* Level 2: Sub-accounts (financial categories) */}
                  {isExpanded && hasAccounts && (
                    <div className="bg-slate-50/50 border-l-4 border-l-slate-200">
                      {Object.entries(categoryAccounts)
                        .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
                        .map(([fcId, acct]) => {
                          const accountKey = `${line.key}:${fcId}`;
                          const isAccountExpanded = expandedAccounts.has(accountKey);
                          const hasDetails = Object.keys(acct.details).length > 1 ||
                            (Object.keys(acct.details).length === 1 && !acct.details["Sem identificacao"]);

                          return (
                            <React.Fragment key={fcId}>
                              {/* Level 2 row */}
                              <div
                                className={`grid items-center px-6 py-1.5 ${
                                  showExcel ? "grid-cols-[auto_1fr_160px_160px_120px]" : "grid-cols-[auto_1fr_180px]"
                                } ${hasDetails ? "cursor-pointer hover:bg-slate-100/50" : ""}`}
                                onClick={hasDetails ? () => toggleAccountExpand(accountKey) : undefined}
                              >
                                <span className="w-6 flex items-center justify-center">
                                  {hasDetails && (
                                    isAccountExpanded
                                      ? <ChevronDown className="h-3 w-3 text-slate-300" />
                                      : <ChevronRight className="h-3 w-3 text-slate-300" />
                                  )}
                                </span>
                                <span className="text-xs text-slate-500 pl-4">
                                  <span className="text-slate-400 font-mono mr-2">{fcId}</span>
                                  {acct.name}
                                </span>
                                <span className={`text-xs text-right tabular-nums ${
                                  acct.amount < 0 ? "text-red-500" : "text-slate-600"
                                }`}>
                                  {formatCurrency(Math.abs(acct.amount))}
                                  {acct.amount < 0 && <span className="ml-0.5">-</span>}
                                </span>
                                {showExcel && (() => {
                                  const excelVal = excelData?.[fcId] ?? null;
                                  if (excelVal === null) return <><span /><span /></>;
                                  const diff = acct.amount - excelVal;
                                  const isClose = Math.abs(diff) < Math.max(1, Math.abs(excelVal) * 0.01);
                                  return (
                                    <>
                                      <span className="text-xs text-right tabular-nums text-violet-600">
                                        {formatCurrency(Math.abs(excelVal))}
                                        {excelVal < 0 && <span className="ml-0.5">-</span>}
                                      </span>
                                      <span className={`text-[10px] text-right tabular-nums ${
                                        isClose ? "text-emerald-600" : "text-amber-600"
                                      }`}>
                                        {Math.abs(diff) < 0.01 ? "OK" : (
                                          `${diff > 0 ? "+" : ""}${formatCurrency(diff)}`
                                        )}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Level 3: Details (creditor/client) */}
                              {isAccountExpanded && hasDetails && (
                                <div className="bg-slate-100/30">
                                  {Object.entries(acct.details)
                                    .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
                                    .map(([detailKey, detail]) => (
                                      <div
                                        key={detailKey}
                                        className="grid grid-cols-[auto_1fr_180px] items-center px-6 py-1"
                                      >
                                        <span className="w-6" />
                                        <span className="text-[11px] text-slate-400 pl-10 truncate">
                                          {detail.name}
                                        </span>
                                        <span className={`text-[11px] text-right tabular-nums ${
                                          detail.amount < 0 ? "text-red-400" : "text-slate-500"
                                        }`}>
                                          {formatCurrency(Math.abs(detail.amount))}
                                          {detail.amount < 0 && <span className="ml-0.5">-</span>}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
