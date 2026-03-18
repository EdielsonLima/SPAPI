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
  Loader2,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { SiengeOutcome, SiengeBankMovement, SiengeIncome } from "@/types/sienge";
import { formatCurrency } from "@/lib/dashboard-utils";

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

// VALIDATED 2026-03-17 — DO NOT MODIFY without explicit user request (matches Power BI)
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

// VALIDATED 2026-03-17 — DO NOT MODIFY order/composition without explicit user request
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

const MONTH_NAMES: Record<string, string> = {
  "01": "jan", "02": "fev", "03": "mar", "04": "abr",
  "05": "mai", "06": "jun", "07": "jul", "08": "ago",
  "09": "set", "10": "out", "11": "nov", "12": "dez",
};

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
  // Excel as supplementary data source for accounts not available in Sienge API
  const [excelSupplementary, setExcelSupplementary] = useState<Record<string, { name: string; amount: number }> | null>(null);
  // Monthly data for DRE Completa view
  const [monthlyData, setMonthlyData] = useState<Record<string, { name: string; dreCategory: string; months: Record<string, number> }> | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  useEffect(() => {
    fetch("/api/dre-mappings")
      .then(r => r.json())
      .then(j => setDreMappings(j.data || {}))
      .catch(() => {})
      .finally(() => setLoadingMappings(false));
  }, []);

  // Fetch DRE data from Excel/DB (primary source)
  // DRE shows ALL companies from Excel (no company filter) to match Power BI
  // Excludes only "holding/administradora" companies like Power BI does
  useEffect(() => {
    if (selectedYears.size === 0) return;
    const years = Array.from(selectedYears);

    Promise.all(
      years.map(year =>
        fetch(`/api/dre-supplementary?year=${year}&excludeCompanies=${encodeURIComponent("SILVA ADMINISTRADORA HOLDING LTDA")}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      const merged: Record<string, { name: string; amount: number; dreCategory: string }> = {};
      for (const json of results) {
        if (!json?.data) continue;
        for (const [fcId, item] of Object.entries(json.data)) {
          const d = item as { name: string; amount: number; dreCategory: string };
          if (!merged[fcId]) {
            merged[fcId] = { name: d.name, amount: 0, dreCategory: d.dreCategory };
          }
          merged[fcId].amount += d.amount;
        }
      }
      if (Object.keys(merged).length === 0) {
        setExcelSupplementary(null);
      } else {
        setExcelSupplementary(merged);
      }
    });
  }, [selectedYears]);

  // Fetch monthly breakdown for DRE Completa view
  // Also fetches ALL companies (no filter) to match Power BI
  useEffect(() => {
    if (dreMode !== "completa" || selectedYears.size === 0) {
      setMonthlyData(null);
      return;
    }
    setLoadingMonthly(true);
    const years = Array.from(selectedYears);
    const monthsQuery = selectedMonths.size > 0
      ? `&months=${encodeURIComponent(Array.from(selectedMonths).join(","))}`
      : "";

    Promise.all(
      years.map(year =>
        fetch(`/api/dre-supplementary?year=${year}&monthly=true&excludeCompanies=${encodeURIComponent("SILVA ADMINISTRADORA HOLDING LTDA")}${monthsQuery}`)
          .then(r => {
            if (!r.ok) {
              console.error(`DRE Completa fetch error: ${r.status} for year ${year}`);
              return null;
            }
            return r.json();
          })
          .catch(err => {
            console.error("DRE Completa fetch failed:", err);
            return null;
          })
      )
    ).then(results => {
      const merged: Record<string, { name: string; dreCategory: string; months: Record<string, number> }> = {};
      for (const json of results) {
        if (!json?.data) continue;
        const yr = json.year as string;
        for (const [fcId, item] of Object.entries(json.data)) {
          const d = item as { name: string; dreCategory: string; months?: Record<string, number> };
          if (!merged[fcId]) {
            merged[fcId] = { name: d.name, dreCategory: d.dreCategory, months: {} };
          }
          if (d.months && typeof d.months === "object") {
            for (const [m, amt] of Object.entries(d.months)) {
              const key = `${m}/${yr}`;
              merged[fcId].months[key] = (merged[fcId].months[key] || 0) + (amt as number);
            }
          }
        }
      }
      setMonthlyData(Object.keys(merged).length > 0 ? merged : null);
    }).catch(err => {
      console.error("DRE Completa processing error:", err);
      setMonthlyData(null);
    }).finally(() => setLoadingMonthly(false));
  }, [dreMode, selectedYears, selectedMonths]);

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

    // VALIDATED 2026-03-17 — DO NOT MODIFY formulas without explicit user request (matches Power BI)
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
    <div className="space-y-8">
      {/* KPI Cards - top highlight row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
        {KPI_LINES.map(kpi => {
          const value = calculated[kpi.key] || 0;
          const margin = getMargin(value);
          const isPositive = value >= 0;

          return (
            <div
              key={kpi.key}
              className={`relative rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border bg-white overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 ${
                isPositive
                  ? "border-emerald-100/60"
                  : "border-red-100/60"
              }`}
            >
              {/* Decorative top gradient line */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                isPositive ? "from-emerald-400 to-teal-400" : "from-red-400 to-rose-400"
              }`} />
              
              <div className="flex items-center justify-between mb-4 mt-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {kpi.label}
                </span>
                <Badge variant="outline" className={`text-xs px-2 py-0.5 font-medium rounded-full shadow-sm ${
                  isPositive ? "bg-emerald-50/80 border-emerald-200/50 text-emerald-700" : "bg-red-50/80 border-red-200/50 text-red-700"
                }`}>
                  {isPositive ? <TrendingUp className="h-3.5 w-3.5 mr-1" /> : <TrendingDown className="h-3.5 w-3.5 mr-1" />}
                  {margin}
                </Badge>
              </div>
              <div className={`text-2xl font-black tabular-nums tracking-tight ${
                isPositive ? "text-slate-800" : "text-slate-800"
              }`}>
                {formatCurrency(Math.abs(value))}
                {!isPositive && <span className="text-sm font-bold text-red-500 ml-1">-</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* DRE Table - full width */}
      <Card className="border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          {/* Toggle */}
          <div className="flex items-center justify-between px-6 py-4 bg-white/50 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800 tracking-tight">DRE <span className="text-slate-400 font-medium ml-1">Demonstração do Resultado</span></h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
                <button
                  onClick={() => setDreMode("simples")}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                    dreMode === "simples"
                      ? "bg-white text-slate-800 shadow-[0_2px_8px_rgb(0,0,0,0.08)]"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  DRE Simples
                </button>
                <button
                  onClick={() => setDreMode("completa")}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                    dreMode === "completa"
                      ? "bg-white text-slate-800 shadow-[0_2px_8px_rgb(0,0,0,0.08)]"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  DRE Completa
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs font-medium h-9 rounded-xl bg-white border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
                onClick={() => window.open("/cadastros/dre", "_blank")}
              >
                <Settings className="h-4 w-4 text-slate-500" />
                Configurar
              </Button>
            </div>
          </div>

          {dreMode === "completa" ? (
            /* ══════ DRE COMPLETA: Monthly columns ══════ */
            (() => {
              if (loadingMonthly) return (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Carregando dados mensais...</span>
                </div>
              );
              if (!monthlyData) return (
                <div className="py-12 text-center text-sm text-slate-400">
                  Nenhum dado mensal disponivel para o periodo selecionado.
                </div>
              );

              // Determine which month columns exist in the data
              const allMonthKeys = new Set<string>();
              for (const item of Object.values(monthlyData)) {
                for (const k of Object.keys(item.months)) allMonthKeys.add(k);
              }
              const monthCols = Array.from(allMonthKeys).sort((a, b) => {
                const [ma, ya] = a.split("/");
                const [mb, yb] = b.split("/");
                return ya === yb ? ma.localeCompare(mb) : ya.localeCompare(yb);
              });

              // Build per-category, per-month totals
              const catMonthTotals: Record<string, Record<string, number>> = {};
              for (const cat of DRE_INPUT_CATEGORIES) catMonthTotals[cat] = {};
              for (const [, item] of Object.entries(monthlyData)) {
                const cat = item.dreCategory;
                if (!catMonthTotals[cat]) continue;
                for (const [m, amt] of Object.entries(item.months)) {
                  catMonthTotals[cat][m] = (catMonthTotals[cat][m] || 0) + amt;
                }
              }

              // Calculated lines per month
              const calcMonth = (key: string, m: string): number => {
                const get = (k: string) => catMonthTotals[k]?.[m] || 0;
                switch (key) {
                  case "lucro_bruto": return get("receita_operacional") + get("custo_variavel");
                  case "lucro_operacional": return calcMonth("lucro_bruto", m) + get("custo_fixo");
                  case "lucro_liquido": return calcMonth("lucro_operacional", m) + get("despesas_financeiras") + get("despesas_tributarias");
                  case "saldo": return calcMonth("lucro_liquido", m) + get("imobilizacoes") + get("retiradas");
                  case "variacao_caixa": return calcMonth("saldo", m) + get("entradas_nao_operacionais") + get("saidas_nao_operacionais");
                  default: return 0;
                }
              };

              const getLineMonthVal = (line: DreLineConfig, m: string): number => {
                if (line.type === "calculated") return calcMonth(line.key, m);
                return catMonthTotals[line.key]?.[m] || 0;
              };

              const getLineTotal = (line: DreLineConfig): number => {
                return monthCols.reduce((sum, m) => sum + getLineMonthVal(line, m), 0);
              };

              const fmtVal = (v: number) => {
                const formatted = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
                return v < 0 ? `-${formatted}` : formatted;
              };

              const colWidth = `${Math.max(100, Math.floor(700 / monthCols.length))}px`;

              return (
                <div className="overflow-x-auto rounded-xl border border-slate-200/60 shadow-sm m-6">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="text-left px-5 py-3.5 font-semibold sticky left-0 bg-slate-800 min-w-[220px] uppercase tracking-wider text-[11px] border-b border-slate-700">CONTA</th>
                        {monthCols.map(m => {
                          const [month, year] = m.split("/");
                          return (
                            <th key={m} className="text-right px-4 py-3.5 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-700" style={{ minWidth: colWidth }}>
                              {MONTH_NAMES[month]}-{year}
                            </th>
                          );
                        })}
                        <th className="text-right px-5 py-3.5 font-bold min-w-[120px] uppercase tracking-wider text-[11px] border-b border-slate-700">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80">
                      {DRE_LINES.map((line) => {
                        const isCalc = line.type === "calculated";
                        const total = getLineTotal(line);
                        const isExpanded = expandedCategories.has(line.key);
                        const lineAccounts = !isCalc && monthlyData
                          ? Object.entries(monthlyData).filter(([, d]) => d.dreCategory === line.key)
                          : [];
                        const canExpand = !isCalc && lineAccounts.length > 0;

                        return (
                          <React.Fragment key={line.key}>
                            <tr
                              className={`${
                                isCalc
                                  ? total < 0
                                    ? "bg-red-50/40 relative font-semibold"
                                    : "bg-emerald-50/40 relative font-semibold"
                                  : "bg-white hover:bg-slate-50/80"
                              } ${canExpand ? "cursor-pointer transition-colors" : ""}`}
                              onClick={canExpand ? () => toggleExpand(line.key) : undefined}
                            >
                              <td className={`px-5 py-3.5 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${
                                isCalc
                                  ? total < 0 ? "bg-[#fef2f2]" : "bg-[#f0fdf4]"
                                  : "bg-white"
                              }`}>
                                {isCalc && (
                                  <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${total < 0 ? "bg-red-400" : "bg-emerald-400"}`} />
                                )}
                                <div className="flex items-center gap-1.5 ">
                                  {canExpand && (
                                    <div className={`p-1 rounded-md transition-colors flex-shrink-0 ${isExpanded ? "bg-slate-200/60" : "hover:bg-slate-200/60"}`}>
                                      {isExpanded 
                                        ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                      }
                                    </div>
                                  )}
                                  {!canExpand && !isCalc && <div className="w-[20px]" />}
                                  <span className={`text-[13px] ${
                                    isCalc
                                      ? total < 0 ? "font-bold text-red-800" : "font-bold text-emerald-800"
                                      : "font-semibold text-slate-700 tracking-tight"
                                  }`}>
                                    {line.label}
                                  </span>
                                </div>
                              </td>
                              {monthCols.map(m => {
                                const v = getLineMonthVal(line, m);
                                return (
                                  <td key={m} className={`text-right px-4 py-3.5 text-[13px] tabular-nums ${
                                    isCalc
                                      ? v < 0 ? "text-red-700 font-semibold" : "text-emerald-700 font-semibold"
                                      : v < 0 ? "text-red-600 font-medium" : "text-slate-700 font-medium"
                                  }`}>
                                    {v !== 0 ? fmtVal(v) : ""}
                                  </td>
                                );
                              })}
                              <td className={`text-right px-5 py-3.5 font-bold text-[14px] tabular-nums ${
                                isCalc
                                  ? total < 0 ? "text-red-700" : "text-emerald-700"
                                  : total < 0 ? "text-red-600" : "text-slate-800"
                              }`}>
                                {fmtVal(total)}
                              </td>
                            </tr>
                            {/* Expanded sub-accounts */}
                            {isExpanded && lineAccounts.map(([fcId, acctData]) => {
                              const acctTotal = Object.values(acctData.months).reduce((s, v) => s + v, 0);
                              return (
                                <tr key={fcId} className="bg-slate-50/80 border-t border-slate-100/80">
                                  <td className="px-5 py-2.5 pl-11 sticky left-0 bg-[#f8fafc] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-l-[3px] border-l-slate-200/80">
                                    <div className="flex items-center text-[12px] font-medium text-slate-600">
                                      <span className="text-slate-400 font-mono text-[11px] mr-2 bg-white py-0.5 px-1.5 rounded-md border border-slate-200/60 shadow-sm">{fcId}</span>
                                      {acctData.name}
                                    </div>
                                  </td>
                                  {monthCols.map(m => {
                                    const v = acctData.months[m] || 0;
                                    return (
                                      <td key={m} className={`text-right px-4 py-2.5 text-[12px] tabular-nums ${
                                        v < 0 ? "text-red-500 font-medium" : "text-slate-600"
                                      }`}>
                                        {v !== 0 ? fmtVal(v) : ""}
                                      </td>
                                    );
                                  })}
                                  <td className={`text-right px-5 py-2.5 font-semibold text-[13px] tabular-nums ${
                                    acctTotal < 0 ? "text-red-600" : "text-slate-700"
                                  }`}>
                                    {fmtVal(acctTotal)}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          ) : (
            /* ══════ DRE SIMPLES: Original view ══════ */
            <>
          {/* Table */}
          <div className="mx-6 my-4 border border-slate-200 rounded-xl overflow-hidden max-w-4xl">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_180px] items-center px-5 py-3 bg-slate-800 text-[11px] font-bold text-white uppercase tracking-widest">
            <span className="w-8" />
            <span>Conta</span>
            <span className="text-right">Realizado</span>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-200/80">
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
                    className={`grid grid-cols-[auto_1fr_180px] items-center px-5 py-3 transition-all duration-200 ${
                      isCalculated
                        ? value < 0
                          ? "bg-red-50/60 relative font-semibold border-l-4 border-l-red-400"
                          : "bg-emerald-50/60 relative font-semibold border-l-4 border-l-emerald-400"
                        : "bg-white hover:bg-slate-50/80 border-l-4 border-l-transparent"
                    } ${canExpand ? "cursor-pointer" : ""}`}
                    onClick={canExpand ? () => toggleExpand(line.key) : undefined}
                  >
                    <span className="w-8 flex items-center justify-center">
                      {canExpand && (
                        <div className={`p-1 rounded-md transition-colors ${isExpanded ? "bg-slate-200/60" : "hover:bg-slate-200/60"}`}>
                          {isExpanded 
                            ? <ChevronDown className="h-4 w-4 text-slate-500" />
                            : <ChevronRight className="h-4 w-4 text-slate-400" />
                          }
                        </div>
                      )}
                    </span>
                    <span className={`text-[13px] flex items-center min-w-0 ${
                      isCalculated
                        ? value < 0
                          ? "font-bold text-red-800"
                          : "font-bold text-emerald-800"
                        : "font-semibold text-slate-700 tracking-tight"
                    }`}>
                      <span className="truncate pr-3">{line.label}</span>
                      <span className="flex-grow border-b-2 border-dotted border-slate-300/60 opacity-60 relative top-[2px] min-w-[20px]"></span>
                    </span>
                    <span className={`text-[14px] text-right tabular-nums ${
                      isCalculated
                        ? value < 0
                          ? "font-bold text-red-700"
                          : "font-bold text-emerald-700"
                        : value < 0
                          ? "font-semibold text-red-600"
                          : "font-semibold text-slate-800"
                    }`}>
                      {formatCurrency(Math.abs(value))}
                      {value < 0 && <span className="text-xs ml-0.5 font-bold text-red-500">-</span>}
                    </span>
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

                          const catTotal = Math.abs(value);
                          const pct = catTotal > 0 ? (Math.abs(acct.amount) / catTotal) * 100 : 0;

                          return (
                            <React.Fragment key={fcId}>
                              {/* Level 2 row */}
                              <div
                                className={`grid grid-cols-[auto_1fr_60px_180px] items-center px-5 py-2 transition-colors border-b border-slate-100 last:border-b-0 ${
                                  hasDetails ? "cursor-pointer hover:bg-slate-100/80" : ""
                                }`}
                                onClick={hasDetails ? () => toggleAccountExpand(accountKey) : undefined}
                              >
                                <span className="w-6 flex items-center justify-center">
                                  {hasDetails && (
                                    isAccountExpanded
                                      ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </span>
                                <span className="text-[12px] font-medium text-slate-600 pl-3 flex items-center min-w-0">
                                  <span className="truncate pr-3">
                                    <span className="text-slate-400 font-mono text-[11px] mr-2 bg-slate-100 py-0.5 px-1.5 rounded-md border border-slate-200/60">{fcId}</span>
                                    {acct.name}
                                  </span>
                                  <span className="flex-grow border-b-2 border-dotted border-slate-300/60 opacity-60 relative top-[2px] min-w-[20px]"></span>
                                </span>
                                <span className="text-[11px] text-right tabular-nums text-slate-400 font-medium">
                                  {pct >= 0.1 ? `${pct.toFixed(1)}%` : "<0.1%"}
                                </span>
                                <span className={`text-[12px] text-right tabular-nums ${
                                  acct.amount < 0 ? "text-red-600 font-semibold" : "text-slate-700 font-semibold"
                                }`}>
                                  {formatCurrency(Math.abs(acct.amount))}
                                  {acct.amount < 0 && <span className="ml-0.5">-</span>}
                                </span>
                              </div>

                              {/* Level 3: Details (creditor/client) */}
                              {isAccountExpanded && hasDetails && (
                                <div className="bg-slate-100/50 py-1 box-shadow-inner border-y border-slate-100/80">
                                  {Object.entries(acct.details)
                                    .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
                                    .map(([detailKey, detail]) => (
                                      <div
                                        key={detailKey}
                                        className="grid grid-cols-[auto_1fr_180px] items-center px-6 py-1.5"
                                      >
                                        <span className="w-6" />
                                        <div className="flex items-center pl-10 pr-4 min-w-0">
                                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2 flex-shrink-0" />
                                          <span className="text-[11px] font-medium text-slate-500 truncate pr-3" title={detail.name}>
                                            {detail.name}
                                          </span>
                                          <span className="flex-grow border-b-2 border-dotted border-slate-300/60 opacity-60 relative top-[2px] min-w-[20px]"></span>
                                        </div>
                                        <span className={`text-[11px] text-right tabular-nums font-medium ${
                                          detail.amount < 0 ? "text-red-500" : "text-slate-600"
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
          </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ══════ INSIGHTS CONTABEIS ══════ */}
      {receitaOperacional !== 0 && (
        <Card className="border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl overflow-hidden mt-6">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-amber-50 to-white border-b border-amber-100/50">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                <Lightbulb className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-800 tracking-tight">Insights da DRE <span className="text-slate-400 font-medium ml-1">Análise Automática</span></h3>
            </div>
            <div className="px-6 py-5 space-y-3 bg-white/50">
              {(() => {
                const rec = receitaOperacional;
                const lb = calculated.lucro_bruto || 0;
                const lo = calculated.lucro_operacional || 0;
                const ll = calculated.lucro_liquido || 0;
                const saldo = calculated.saldo || 0;
                const vc = calculated.variacao_caixa || 0;
                const cv = accum.custo_variavel?.total || 0;
                const cf = accum.custo_fixo?.total || 0;
                const df = accum.despesas_financeiras?.total || 0;
                const dt = accum.despesas_tributarias?.total || 0;
                const imob = accum.imobilizacoes?.total || 0;
                const ret = accum.retiradas?.total || 0;

                const margBruta = (lb / rec) * 100;
                const margOp = (lo / rec) * 100;
                const margLiq = (ll / rec) * 100;
                const pesoCv = (Math.abs(cv) / rec) * 100;
                const pesoCf = (Math.abs(cf) / rec) * 100;
                const pesoDf = (Math.abs(df) / rec) * 100;
                const pesoDt = (Math.abs(dt) / rec) * 100;

                const insights: { icon: "check" | "alert" | "info"; text: string }[] = [];

                // Margem bruta
                if (margBruta >= 30) {
                  insights.push({ icon: "check", text: `Margem bruta de ${margBruta.toFixed(1)}% indica boa eficiencia na operacao. Os custos variaveis representam ${pesoCv.toFixed(1)}% da receita.` });
                } else if (margBruta >= 15) {
                  insights.push({ icon: "info", text: `Margem bruta de ${margBruta.toFixed(1)}% esta dentro da media. Os custos variaveis (${pesoCv.toFixed(1)}% da receita) merecem atencao para otimizacao.` });
                } else {
                  insights.push({ icon: "alert", text: `Margem bruta de apenas ${margBruta.toFixed(1)}% e preocupante. Custos variaveis consomem ${pesoCv.toFixed(1)}% da receita — avalie renegociacao com fornecedores e revisao de precificacao.` });
                }

                // Margem operacional
                if (margOp >= 15) {
                  insights.push({ icon: "check", text: `Margem operacional de ${margOp.toFixed(1)}% demonstra eficiencia na gestao de custos fixos (${pesoCf.toFixed(1)}% da receita).` });
                } else if (margOp >= 5) {
                  insights.push({ icon: "info", text: `Margem operacional de ${margOp.toFixed(1)}%. Os custos fixos representam ${pesoCf.toFixed(1)}% da receita — busque oportunidades de reducao de overhead.` });
                } else {
                  insights.push({ icon: "alert", text: `Margem operacional de ${margOp.toFixed(1)}% deixa pouca margem de seguranca. Custos fixos de ${pesoCf.toFixed(1)}% da receita precisam ser revisados.` });
                }

                // Diferenca entre lucro bruto e operacional (peso do custo fixo)
                if (pesoCf > pesoCv) {
                  insights.push({ icon: "alert", text: `Custos fixos (${formatCurrency(Math.abs(cf))}) superam custos variaveis (${formatCurrency(Math.abs(cv))}) — estrutura de custo pesada que aumenta o ponto de equilibrio.` });
                }

                // Despesas financeiras
                if (pesoDf > 5) {
                  insights.push({ icon: "alert", text: `Despesas financeiras representam ${pesoDf.toFixed(1)}% da receita (${formatCurrency(Math.abs(df))}). Avalie renegociacao de dividas e reducao de endividamento.` });
                } else if (pesoDf > 2) {
                  insights.push({ icon: "info", text: `Despesas financeiras em ${pesoDf.toFixed(1)}% da receita — nivel moderado. Monitore a evolucao do custo da divida.` });
                }

                // Carga tributaria
                if (pesoDt > 15) {
                  insights.push({ icon: "alert", text: `Carga tributaria de ${pesoDt.toFixed(1)}% da receita e elevada. Considere revisao do planejamento tributario e aproveitamento de beneficios fiscais.` });
                } else if (pesoDt > 8) {
                  insights.push({ icon: "info", text: `Despesas tributarias representam ${pesoDt.toFixed(1)}% da receita. Revise periodicamente o enquadramento tributario.` });
                }

                // Margem liquida
                if (margLiq < 0) {
                  insights.push({ icon: "alert", text: `Resultado liquido negativo (${formatCurrency(Math.abs(ll))}). A operacao nao esta gerando lucro suficiente para cobrir despesas financeiras e tributarias.` });
                } else if (margLiq >= 10) {
                  insights.push({ icon: "check", text: `Margem liquida de ${margLiq.toFixed(1)}% e saudavel, mostrando boa rentabilidade apos todas as deducoes.` });
                }

                // Saldo vs Lucro liquido (imobilizacoes e retiradas)
                if (ll > 0 && saldo < ll * 0.5) {
                  const consumo = Math.abs(imob) + Math.abs(ret);
                  insights.push({ icon: "info", text: `Imobilizacoes (${formatCurrency(Math.abs(imob))}) e retiradas (${formatCurrency(Math.abs(ret))}) consomem ${((consumo / ll) * 100).toFixed(0)}% do lucro liquido — acompanhe o impacto no caixa.` });
                }

                // Variacao de caixa
                if (vc < 0) {
                  insights.push({ icon: "alert", text: `Variacao de caixa negativa de ${formatCurrency(Math.abs(vc))}. O caixa da empresa esta diminuindo — revise entradas/saidas nao operacionais e controle o fluxo de caixa.` });
                } else if (vc > 0) {
                  insights.push({ icon: "check", text: `Variacao de caixa positiva de ${formatCurrency(vc)}. A empresa esta acumulando caixa no periodo.` });
                }

                return insights.map((insight, i) => (
                  <div key={i} className={`flex items-start gap-3.5 p-4 rounded-xl text-[13px] border shadow-sm transition-all hover:shadow-md ${
                    insight.icon === "check" ? "bg-emerald-50/50 border-emerald-100 text-emerald-900" :
                    insight.icon === "alert" ? "bg-amber-50/50 border-amber-200/60 text-amber-900" :
                    "bg-blue-50/50 border-blue-100 text-blue-900"
                  }`}>
                    {insight.icon === "check" && <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-emerald-500" />}
                    {insight.icon === "alert" && <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-500" />}
                    {insight.icon === "info" && <Lightbulb className="h-5 w-5 mt-0.5 flex-shrink-0 text-blue-500" />}
                    <span className="leading-relaxed font-medium">{insight.text}</span>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
