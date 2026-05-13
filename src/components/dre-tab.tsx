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
  RefreshCw,
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
  allBankMovements?: SiengeBankMovement[];
  selectedYears: Set<string>;
  selectedMonths: Set<string>;
  selectedCompanies: Set<string>;
  // Increments on every "Atualizar" click — forces re-fetch of /api/dre-supplementary
  // so DRE picks up the latest Excel sync without needing the user to reload.
  refreshKey?: number;
  // dataSource: 'excel' lê de /api/dre-supplementary (default, alimentado pelo
  // Excel local via sync); 'api' lê de /api/dre-api (calculado em runtime das
  // movimentações Sienge). Comportamento idêntico — só muda a origem.
  dataSource?: "excel" | "api";
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
  { key: "lucro_bruto", label: "Lucro Bruto", gradient: "from-emerald-500 to-teal-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", iconBg: "bg-emerald-100 dark:bg-emerald-900/50", textColor: "text-emerald-700 dark:text-emerald-300" },
  { key: "lucro_operacional", label: "Lucro Operacional", gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50 dark:bg-blue-950/40", iconBg: "bg-blue-100 dark:bg-blue-900/50", textColor: "text-blue-700 dark:text-blue-300" },
  { key: "lucro_liquido", label: "Lucro Liquido", gradient: "from-violet-500 to-purple-600", bg: "bg-violet-50 dark:bg-violet-950/40", iconBg: "bg-violet-100 dark:bg-violet-900/50", textColor: "text-violet-700 dark:text-violet-300" },
  { key: "saldo", label: "Saldo", gradient: "from-amber-500 to-orange-600", bg: "bg-amber-50 dark:bg-amber-950/40", iconBg: "bg-amber-100 dark:bg-amber-900/50", textColor: "text-amber-700 dark:text-amber-300" },
  { key: "variacao_caixa", label: "Variacao de Caixa", gradient: "from-rose-500 to-pink-600", bg: "bg-rose-50 dark:bg-rose-950/40", iconBg: "bg-rose-100 dark:bg-rose-900/50", textColor: "text-rose-700 dark:text-rose-300" },
];

const MONTH_NAMES: Record<string, string> = {
  "01": "jan", "02": "fev", "03": "mar", "04": "abr",
  "05": "mai", "06": "jun", "07": "jul", "08": "ago",
  "09": "set", "10": "out", "11": "nov", "12": "dez",
};

// Level 4: individual transaction within a creditor/client
interface TransactionDetail {
  billId: number;
  paymentDate: string;
  amount: number;
  documentType: string;
  observation: string;
}

// Detail record for level 3 (creditor/client within a financial account)
interface AccountDetail {
  name: string;
  amount: number;
  observations: string[];
  transactions: TransactionDetail[];
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
  allBankMovements = [],
  selectedYears,
  selectedMonths,
  selectedCompanies,
  refreshKey = 0,
  dataSource = "excel",
}: DreTabProps) {
  const dreEndpoint = dataSource === "api" ? "/api/dre-api" : "/api/dre-supplementary";
  const [dreMappings, setDreMappings] = useState<Record<string, DreMappingItem[]>>({});
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [dreMode, setDreMode] = useState<"simples" | "completa">("simples");
  // Excel as supplementary data source for accounts not available in Sienge API
  const [excelSupplementary, setExcelSupplementary] = useState<Record<string, { name: string; amount: number }> | null>(null);
  // Monthly data for DRE Completa view
  const [monthlyData, setMonthlyData] = useState<Record<string, { name: string; dreCategory: string; months: Record<string, number> }> | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [syncingExcel, setSyncingExcel] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const handleSyncExcel = useCallback(async () => {
    setSyncingExcel(true);
    try {
      const res = await fetch("/api/sync-excel-dre", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Falha no sync");
        if (json.detail) toast.message(json.detail, { duration: 10000 });
        return;
      }
      const modified = new Date(json.excelModified).toLocaleString("pt-BR");
      toast.success(`Sync DRE concluído — ${json.totalRecords.toLocaleString("pt-BR")} registros (Excel ${modified})`);
      setLocalRefreshKey(k => k + 1);
    } catch (err) {
      toast.error("Erro ao chamar /api/sync-excel-dre");
      console.error(err);
    } finally {
      setSyncingExcel(false);
    }
  }, []);

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
  // refreshKey nas deps faz o fetch refazer quando o user clica "Atualizar".
  useEffect(() => {
    if (selectedYears.size === 0) return;
    const years = Array.from(selectedYears);

    Promise.all(
      years.map(year =>
        fetch(`${dreEndpoint}?year=${year}&excludeCompanies=${encodeURIComponent("SILVA ADMINISTRADORA HOLDING LTDA")}`, { cache: "no-store" })
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
  }, [selectedYears, refreshKey, localRefreshKey, dreEndpoint]);

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
        fetch(`${dreEndpoint}?year=${year}&monthly=true&excludeCompanies=${encodeURIComponent("SILVA ADMINISTRADORA HOLDING LTDA")}${monthsQuery}`, { cache: "no-store" })
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
  }, [dreMode, selectedYears, selectedMonths, refreshKey, localRefreshKey, dreEndpoint]);

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

  const toggleDetailExpand = useCallback((key: string) => {
    setExpandedDetails(prev => {
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

    const addToAccum = (dreCat: string, fcId: string, fcName: string, amount: number, detailName: string, tx?: Partial<TransactionDetail>) => {
      if (!accum[dreCat]) return;
      accum[dreCat].total += amount;
      if (!accum[dreCat].accounts[fcId]) {
        accum[dreCat].accounts[fcId] = { name: fcName, amount: 0, details: {} };
      }
      accum[dreCat].accounts[fcId].amount += amount;
      const dKey = detailName || "Sem identificacao";
      if (!accum[dreCat].accounts[fcId].details[dKey]) {
        accum[dreCat].accounts[fcId].details[dKey] = { name: dKey, amount: 0, observations: [], transactions: [] };
      }
      accum[dreCat].accounts[fcId].details[dKey].amount += amount;
      if (tx?.observation && !accum[dreCat].accounts[fcId].details[dKey].observations.includes(tx.observation)) {
        accum[dreCat].accounts[fcId].details[dKey].observations.push(tx.observation);
      }
      if (tx) {
        accum[dreCat].accounts[fcId].details[dKey].transactions.push({
          billId: tx.billId || 0,
          paymentDate: tx.paymentDate || "",
          amount: tx.amount || amount,
          documentType: tx.documentType || "",
          observation: tx.observation || "",
        });
      }
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

    // DRE ignores company filter (shows ALL companies to match Power BI)
    // This filter is used for Level 3 enrichment from Sienge API data
    const matchesDreFilters = (date: string) => {
      if (!date) return false;
      const year = date.substring(0, 4);
      const month = date.substring(5, 7);
      if (selectedYears.size > 0 && !selectedYears.has(year)) return false;
      if (selectedMonths.size > 0 && !selectedMonths.has(month)) return false;
      return true;
    };

    // Helper: add Level 3 detail only (does NOT change Level 1+2 totals)
    const addDetailOnly = (dreCat: string, fcId: string, detailName: string, detailAmount: number, tx?: Partial<TransactionDetail>) => {
      if (!accum[dreCat]?.accounts[fcId]) return;
      const dKey = detailName || "Sem identificacao";
      if (!accum[dreCat].accounts[fcId].details[dKey]) {
        accum[dreCat].accounts[fcId].details[dKey] = { name: dKey, amount: 0, observations: [], transactions: [] };
      }
      accum[dreCat].accounts[fcId].details[dKey].amount += detailAmount;
      if (tx?.observation && !accum[dreCat].accounts[fcId].details[dKey].observations.includes(tx.observation)) {
        accum[dreCat].accounts[fcId].details[dKey].observations.push(tx.observation);
      }
      if (tx) {
        accum[dreCat].accounts[fcId].details[dKey].transactions.push({
          billId: tx.billId || 0, paymentDate: tx.paymentDate || "", amount: tx.amount || detailAmount,
          documentType: tx.documentType || "", observation: tx.observation || "",
        });
      }
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
      // DRE ignores company filter — uses matchesDreFilters (year+month only)
      const excelFcIds = new Set(Object.keys(excelSupplementary));
      const enrichedFcIds = new Set<string>(); // Track which fcIds got L3 details

      for (const item of outcomeItems) {
        for (const payment of (item.payments || [])) {
          if (!matchesDreFilters(payment.paymentDate)) continue;
          for (const pc of (item.paymentsCategories || [])) {
            const fcId = String(pc.financialCategoryId);
            if (!excelFcIds.has(fcId)) continue;
            const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
            if (!dreCat) continue;
            const rate = (pc.financialCategoryRate || 100) / 100;
            const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
            addDetailOnly(dreCat, fcId, item.creditorName || "", payment.netAmount * rate * sign, {
              billId: item.billId, paymentDate: payment.paymentDate, amount: payment.netAmount * rate * sign,
              documentType: item.documentIdentificationName || "", observation: item.observation || "",
            });
            enrichedFcIds.add(fcId);
          }
        }
      }

      for (const item of incomeItems) {
        const pcs = item.paymentsCategories || [];
        if (pcs.length === 0) continue;
        for (const payment of (item.payments || [])) {
          const amount = payment.netAmount || 0;
          if (amount <= 0) continue;
          if (!matchesDreFilters(payment.paymentDate)) continue;
          for (const pc of pcs) {
            const fcId = String(pc.financialCategoryId);
            if (!excelFcIds.has(fcId)) continue;
            const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
            if (!dreCat) continue;
            const rate = (pc.financialCategoryRate || 100) / 100;
            addDetailOnly(dreCat, fcId, item.clientName || "", amount * rate, {
              billId: item.billId, paymentDate: payment.paymentDate, amount: amount * rate,
              documentType: item.documentIdentificationName || "", observation: item.observation || "",
            });
            enrichedFcIds.add(fcId);
          }
        }
      }

      // Use detached bank movements for all fcIds
      for (const bm of bankFees) {
        if (!bm.bankMovementDate) continue;
        if (!matchesDreFilters(bm.bankMovementDate)) continue;
        for (const fc of (bm.financialCategories || [])) {
          const fcId = String(fc.financialCategoryId);
          if (!excelFcIds.has(fcId)) continue;
          const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
          if (!dreCat) continue;
          const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
          addDetailOnly(dreCat, fcId, "Movimento Bancario", Math.abs(bm.bankMovementAmount) * sign);
          enrichedFcIds.add(fcId);
        }
      }

      // Use ALL bank movements (including linked) as fallback for fcIds not yet enriched
      for (const bm of allBankMovements) {
        if (!bm.bankMovementDate) continue;
        if (!matchesDreFilters(bm.bankMovementDate)) continue;
        for (const fc of (bm.financialCategories || [])) {
          const fcId = String(fc.financialCategoryId);
          if (enrichedFcIds.has(fcId)) continue; // Already enriched from outcome/income/detached
          if (!excelFcIds.has(fcId)) continue;
          const dreCat = excelFcToDre[fcId] || fcToDre[fcId];
          if (!dreCat) continue;
          const sign = NEGATIVE_CATEGORIES.has(dreCat) ? -1 : 1;
          const detailName = fc.financialCategoryName || "Movimento Bancario";
          addDetailOnly(dreCat, fcId, detailName, Math.abs(bm.bankMovementAmount) * (fc.financialCategoryRate / 100) * sign);
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
            addToAccum(dreCat, String(pc.financialCategoryId), pc.financialCategoryName, allocated * sign, item.creditorName || "", {
              billId: item.billId, paymentDate: payment.paymentDate, amount: allocated * sign,
              documentType: item.documentIdentificationName || "", observation: item.observation || "",
            });
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
            addToAccum(dreCat, String(pc.financialCategoryId), pc.financialCategoryName, amount * rate, item.clientName || "", {
              billId: item.billId, paymentDate: payment.paymentDate, amount: amount * rate,
              documentType: item.documentIdentificationName || "", observation: item.observation || "",
            });
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
  }, [dreMappings, outcomeItems, incomeItems, bankFees, allBankMovements, selectedYears, selectedMonths, selectedCompanies, excelSupplementary]);

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
              className={`relative rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-white/60 dark:border-white/5 ${kpi.bg} overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.1)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] hover:-translate-y-1`}
            >
              {/* Decorative top gradient line */}
              <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${kpi.gradient}`} />

              <div className="flex items-center justify-between mb-4 mt-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${kpi.textColor}`}>
                  {kpi.label}
                </span>
                <Badge variant="outline" className={`text-xs px-2 py-0.5 font-medium rounded-full shadow-sm ${
                  isPositive
                    ? `${kpi.iconBg} border-current/20 ${kpi.textColor}`
                    : "bg-red-50/80 dark:bg-red-950/50 border-red-200/50 dark:border-red-800/50 text-red-700 dark:text-red-300/60"
                }`}>
                  {isPositive ? <TrendingUp className="h-3.5 w-3.5 mr-1" /> : <TrendingDown className="h-3.5 w-3.5 mr-1" />}
                  {margin}
                </Badge>
              </div>
              <div className="text-2xl font-black tabular-nums tracking-tight text-slate-800 dark:text-slate-100">
                {formatCurrency(Math.abs(value))}
                {!isPositive && <span className="text-sm font-bold text-red-500 dark:text-red-300/60 ml-1">-</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* DRE Table - full width */}
      <Card className="border border-slate-200/60 dark:border-slate-700/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] rounded-2xl overflow-hidden dark:bg-slate-900">
        <CardContent className="p-0">
          {/* Toggle */}
          <div className="flex items-center justify-between px-6 py-4 bg-white/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">DRE <span className="text-slate-400 dark:text-slate-500 font-medium ml-1">Demonstração do Resultado</span></h3>
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
              {dataSource === "excel" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs font-medium h-9 rounded-xl bg-white border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
                  onClick={handleSyncExcel}
                  disabled={syncingExcel}
                  title="Lê o Excel local (DEMOSTRATIVO RESULTADO COMPLETO.xlsx) e atualiza o DRE no banco. Só funciona quando o servidor tem acesso ao arquivo."
                >
                  {syncingExcel
                    ? <Loader2 className="h-4 w-4 text-slate-500 animate-spin" />
                    : <RefreshCw className="h-4 w-4 text-slate-500" />}
                  Sync DRE
                </Button>
              )}
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

              // Variacao percentual entre mes atual e anterior. Retorna null
              // se mes anterior e 0 (divisao por zero).
              const calcVariation = (current: number, previous: number): number | null => {
                if (previous === 0) return null;
                return ((current - previous) / Math.abs(previous)) * 100;
              };

              const fmtPct = (p: number) => {
                const abs = Math.abs(p);
                if (abs >= 1000) return `${p > 0 ? "+" : "-"}${(abs / 1000).toFixed(1)}k%`;
                return `${p > 0 ? "+" : p < 0 ? "-" : ""}${abs.toFixed(1)}%`;
              };

              const colWidth = `${Math.max(90, Math.floor(700 / monthCols.length))}px`;

              return (
                <div className="overflow-x-auto rounded-xl border border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900 shadow-sm m-6">
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
                    <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
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
                                    ? "bg-red-50/40 dark:bg-red-950/30 relative font-semibold"
                                    : "bg-emerald-50/40 dark:bg-emerald-950/30 relative font-semibold"
                                  : "bg-white dark:bg-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              } ${canExpand ? "cursor-pointer transition-colors" : ""}`}
                              onClick={canExpand ? () => toggleExpand(line.key) : undefined}
                            >
                              <td className={`px-5 py-3.5 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${
                                isCalc
                                  ? total < 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-emerald-50 dark:bg-emerald-950/40"
                                  : "bg-white dark:bg-slate-900"
                              }`}>
                                {isCalc && (
                                  <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${total < 0 ? "bg-red-400 dark:bg-red-500/70" : "bg-emerald-400 dark:bg-emerald-500/70"}`} />
                                )}
                                <div className="flex items-center gap-1.5 ">
                                  {canExpand && (
                                    <div className={`p-1 rounded-md transition-colors flex-shrink-0 ${isExpanded ? "bg-slate-200/60 dark:bg-slate-700/60" : "hover:bg-slate-200/60 dark:hover:bg-slate-700/60"}`}>
                                      {isExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-400" />
                                      }
                                    </div>
                                  )}
                                  {!canExpand && !isCalc && <div className="w-[20px]" />}
                                  <span className={`text-[13px] ${
                                    isCalc
                                      ? total < 0 ? "font-bold text-red-800 dark:text-red-300" : "font-bold text-emerald-800 dark:text-emerald-300"
                                      : "font-semibold text-slate-700 dark:text-slate-200 tracking-tight"
                                  }`}>
                                    {line.label}
                                  </span>
                                </div>
                              </td>
                              {monthCols.map((m, i) => {
                                const v = getLineMonthVal(line, m);
                                const prev = i > 0 ? monthCols[i - 1] : null;
                                const prevV = prev ? getLineMonthVal(line, prev) : 0;
                                const variation = prev ? calcVariation(v, prevV) : null;
                                return (
                                  <td key={m} className={`text-right px-4 py-3.5 text-[13px] tabular-nums ${
                                    isCalc
                                      ? v < 0 ? "text-red-700 dark:text-red-300 font-semibold" : "text-emerald-700 dark:text-emerald-300 font-semibold"
                                      : v < 0 ? "text-red-600 dark:text-red-300/70 font-medium" : "text-slate-700 dark:text-slate-300 font-medium"
                                  }`}>
                                    {v !== 0 ? fmtVal(v) : ""}
                                    {variation !== null && v !== 0 && (
                                      <div className={`text-[10px] font-medium leading-tight mt-0.5 ${
                                        variation > 0 ? "text-emerald-600 dark:text-emerald-400" : variation < 0 ? "text-red-500 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                                      }`}>
                                        {fmtPct(variation)}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className={`text-right px-5 py-3.5 font-bold text-[14px] tabular-nums ${
                                isCalc
                                  ? total < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                                  : total < 0 ? "text-red-600 dark:text-red-300/70" : "text-slate-800 dark:text-slate-200"
                              }`}>
                                {fmtVal(total)}
                              </td>
                            </tr>
                            {/* Expanded sub-accounts */}
                            {isExpanded && lineAccounts.map(([fcId, acctData]) => {
                              const acctTotal = Object.values(acctData.months).reduce((s, v) => s + v, 0);
                              return (
                                <tr key={fcId} className="bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-100/80 dark:border-slate-700/60">
                                  <td className="px-5 py-2.5 pl-11 sticky left-0 bg-slate-50 dark:bg-slate-800/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-l-[3px] border-l-slate-200/80 dark:border-l-slate-700/60">
                                    <div className="flex items-center text-[12px] font-medium text-slate-600 dark:text-slate-300">
                                      <span className="text-slate-400 dark:text-slate-400 font-mono text-[11px] mr-2 bg-white dark:bg-slate-800 py-0.5 px-1.5 rounded-md border border-slate-200/60 dark:border-slate-700/60 shadow-sm">{fcId}</span>
                                      {acctData.name}
                                    </div>
                                  </td>
                                  {monthCols.map((m, i) => {
                                    const v = acctData.months[m] || 0;
                                    const prev = i > 0 ? monthCols[i - 1] : null;
                                    const prevV = prev ? (acctData.months[prev] || 0) : 0;
                                    const variation = prev ? calcVariation(v, prevV) : null;
                                    return (
                                      <td key={m} className={`text-right px-4 py-2.5 text-[12px] tabular-nums ${
                                        v < 0 ? "text-red-500 dark:text-red-300/70 font-medium" : "text-slate-600 dark:text-slate-300"
                                      }`}>
                                        {v !== 0 ? fmtVal(v) : ""}
                                        {variation !== null && v !== 0 && (
                                          <div className={`text-[9px] leading-tight mt-0.5 ${
                                            variation > 0 ? "text-emerald-500 dark:text-emerald-400" : variation < 0 ? "text-red-400 dark:text-red-400" : "text-slate-300 dark:text-slate-600"
                                          }`}>
                                            {fmtPct(variation)}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className={`text-right px-5 py-2.5 font-semibold text-[13px] tabular-nums ${
                                    acctTotal < 0 ? "text-red-600 dark:text-red-300/70" : "text-slate-700 dark:text-slate-300"
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
            <div className="mx-6 my-4 flex flex-col xl:flex-row items-start gap-6">
              {/* Table */}
              <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden flex-grow shadow-[0_4px_20px_rgb(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgb(0,0,0,0.2)] bg-white dark:bg-slate-900 w-full max-w-4xl">
              {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_180px] items-center px-5 py-3 bg-slate-800 text-[11px] font-bold text-white uppercase tracking-widest">
            <span className="w-8" />
            <span>Conta</span>
            <span className="text-right">Realizado</span>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-200/80 dark:divide-slate-700/80">
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
                          ? "bg-red-50/60 dark:bg-red-950/30 relative font-semibold border-l-4 border-l-red-400 dark:border-l-red-500/50"
                          : "bg-emerald-50/60 dark:bg-emerald-950/30 relative font-semibold border-l-4 border-l-emerald-400 dark:border-l-emerald-500/50"
                        : "bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/80 border-l-4 border-l-transparent"
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
                          ? "font-bold text-red-800 dark:text-red-300/70"
                          : "font-bold text-emerald-800 dark:text-emerald-300"
                        : "font-semibold text-slate-700 dark:text-slate-200 tracking-tight"
                    }`}>
                      <span className="truncate pr-3">{line.label}</span>
                      <span className="flex-grow border-b-2 border-dotted border-slate-300/60 dark:border-slate-600/60 opacity-60 relative top-[2px] min-w-[20px]"></span>
                    </span>
                    <span className={`text-[14px] text-right tabular-nums ${
                      isCalculated
                        ? value < 0
                          ? "font-bold text-red-700 dark:text-red-300/70"
                          : "font-bold text-emerald-700 dark:text-emerald-300"
                        : value < 0
                          ? "font-semibold text-red-600 dark:text-red-300/60"
                          : "font-semibold text-slate-800 dark:text-slate-200"
                    }`}>
                      {formatCurrency(Math.abs(value))}
                      {value < 0 && <span className="text-xs ml-0.5 font-bold text-red-500 dark:text-red-300/60">-</span>}
                    </span>
                  </div>

                  {/* Level 2: Sub-accounts (financial categories) */}
                  {isExpanded && hasAccounts && (
                    <div className="bg-white dark:bg-slate-900 border-l-4 border-l-slate-200 dark:border-l-slate-600">
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
                                  hasDetails ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" : ""
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
                                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300 pl-3 flex items-center min-w-0">
                                  <span className="truncate pr-3">
                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] mr-2 bg-slate-100 dark:bg-slate-800 py-0.5 px-1.5 rounded-md border border-slate-200/60 dark:border-slate-700">{fcId}</span>
                                    {acct.name}
                                  </span>
                                  <span className="flex-grow border-b-2 border-dotted border-slate-300/60 dark:border-slate-600/60 opacity-60 relative top-[2px] min-w-[20px]"></span>
                                </span>
                                <span className="text-[11px] text-right tabular-nums text-slate-400 dark:text-slate-500 font-medium">
                                  {pct >= 0.1 ? `${pct.toFixed(1)}%` : "<0.1%"}
                                </span>
                                <span className={`text-[12px] text-right tabular-nums ${
                                  acct.amount < 0 ? "text-red-600 dark:text-red-300/60 font-semibold" : "text-slate-700 dark:text-slate-200 font-semibold"
                                }`}>
                                  {formatCurrency(Math.abs(acct.amount))}
                                  {acct.amount < 0 && <span className="ml-0.5">-</span>}
                                </span>
                              </div>

                              {/* Level 3: Details (creditor/client) */}
                              {isAccountExpanded && hasDetails && (
                                <div className="bg-white dark:bg-slate-950 py-1 border-y border-slate-100 dark:border-slate-800">
                                  {Object.entries(acct.details)
                                    .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
                                    .map(([detailKey, detail]) => {
                                      const detailExpandKey = `${accountKey}:${detailKey}`;
                                      const isDetailExpanded = expandedDetails.has(detailExpandKey);
                                      const hasTx = detail.transactions.length > 0;
                                      return (
                                      <React.Fragment key={detailKey}>
                                      <div
                                        className={`grid grid-cols-[auto_1fr_180px] items-center px-6 py-1.5 ${hasTx ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80" : ""}`}
                                        onClick={hasTx ? () => toggleDetailExpand(detailExpandKey) : undefined}
                                      >
                                        <span className="w-6 flex items-center justify-center">
                                          {hasTx && (
                                            isDetailExpanded
                                              ? <ChevronDown className="h-3 w-3 text-slate-400" />
                                              : <ChevronRight className="h-3 w-3 text-slate-400" />
                                          )}
                                        </span>
                                        <div className="flex items-center pl-10 pr-4 min-w-0">
                                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mr-2 flex-shrink-0" />
                                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate pr-3" title={detail.name}>
                                            {detail.name}
                                          </span>
                                          {hasTx && <span className="text-[9px] text-slate-400 dark:text-slate-500 mr-2 flex-shrink-0">{detail.transactions.length}x</span>}
                                          <span className="flex-grow border-b-2 border-dotted border-slate-300/60 opacity-60 relative top-[2px] min-w-[20px]"></span>
                                        </div>
                                        <span className={`text-[11px] text-right tabular-nums font-medium ${
                                          detail.amount < 0 ? "text-red-500 dark:text-red-300/60" : "text-slate-600 dark:text-slate-400"
                                        }`}>
                                          {formatCurrency(Math.abs(detail.amount))}
                                          {detail.amount < 0 && <span className="ml-0.5">-</span>}
                                        </span>
                                      </div>

                                      {/* Level 4: Individual transactions */}
                                      {isDetailExpanded && hasTx && (
                                        <div className="bg-slate-50 dark:bg-slate-900/80 py-0.5 border-y border-slate-100 dark:border-slate-800">
                                          {detail.transactions
                                            .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
                                            .map((tx, txIdx) => (
                                              <div
                                                key={txIdx}
                                                className="grid grid-cols-[auto_1fr_180px] items-center px-6 py-1"
                                                title={tx.observation || undefined}
                                              >
                                                <span className="w-6" />
                                                <div className="flex items-center pl-14 pr-4 min-w-0 gap-2">
                                                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700 flex-shrink-0">
                                                    {tx.paymentDate ? tx.paymentDate.split("-").reverse().join("/") : "-"}
                                                  </span>
                                                  {tx.documentType && (
                                                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700 flex-shrink-0">
                                                      {tx.documentType}
                                                    </span>
                                                  )}
                                                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">
                                                    #{tx.billId}
                                                  </span>
                                                  {tx.observation && (
                                                    <span className="text-[10px] text-blue-500 dark:text-blue-400 truncate" title={tx.observation}>
                                                      {tx.observation}
                                                    </span>
                                                  )}
                                                  <span className="flex-grow border-b border-dotted border-slate-300/40 opacity-40 relative top-[2px] min-w-[10px]"></span>
                                                </div>
                                                <span className={`text-[10px] text-right tabular-nums font-medium ${
                                                  tx.amount < 0 ? "text-red-400" : "text-slate-500 dark:text-slate-500"
                                                }`}>
                                                  {formatCurrency(Math.abs(tx.amount))}
                                                  {tx.amount < 0 && <span className="ml-0.5">-</span>}
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
                  )}
                </React.Fragment>
              );
            })}
          </div>
              </div>

              {/* ══════ INSIGHTS CONTABEIS (Side Panel in DRE Simples) ══════ */}
              {receitaOperacional !== 0 && (
                <div className="w-full xl:w-[420px] flex-shrink-0 self-start border border-slate-200/80 dark:border-slate-700/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] rounded-2xl overflow-hidden bg-white dark:bg-slate-900 sticky top-24">
                  <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900 border-b border-amber-100/50 dark:border-amber-900/40">
                    <div className="p-2 bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300 rounded-lg shadow-sm">
                      <Lightbulb className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">Insights da DRE <span className="text-slate-400 dark:text-slate-500 font-medium ml-1 block text-xs mt-0.5">Análise Automática</span></h3>
                  </div>
                  <div className="px-5 py-5 space-y-3 bg-white/50 dark:bg-slate-900/40 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
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
                          insight.icon === "check" ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-100/80 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200" :
                          insight.icon === "alert" ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-900/40 text-amber-900 dark:text-amber-200" :
                          "bg-blue-50/70 dark:bg-blue-950/30 border-blue-100/80 dark:border-blue-900/40 text-blue-900 dark:text-blue-200"
                        }`}>
                          {insight.icon === "check" && <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />}
                          {insight.icon === "alert" && <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />}
                          {insight.icon === "info" && <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />}
                          <span className="leading-relaxed font-medium">{insight.text}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
