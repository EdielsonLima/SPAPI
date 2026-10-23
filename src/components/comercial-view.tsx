"use client";

// Módulo Comercial — antes era a aba "Comercial" do Painel Executivo
// (executive-dashboard.tsx). O corpo das cinco sub-abas foi movido para cá
// sem alteração de cálculo: mesmos filtros, mesmas fórmulas, mesmos números.
// O que mudou: cada sub-aba virou uma rota própria (menu Comercial), e o
// estado/dados que antes viviam no dashboard vivem em ComercialProvider.

import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, Clock, AlertTriangle, CheckCircle, RefreshCw, FileText, Building2, CalendarClock, X, Search, Users, Banknote,
  ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Ruler, Handshake, LayoutGrid, Crown, FileSpreadsheet,
  Eye, EyeOff,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { SiengeSalesContract } from "@/types/sienge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency, formatCompactCurrency, formatDate, MONTH_LABELS } from "@/lib/dashboard-utils";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { CorretoresView } from "@/components/corretores-view";
import { TabelaPrecosView } from "@/components/tabela-precos-view";
import { semVenda } from "@/lib/tabela-precos";
import { useComercial, COMPANY_KEY, YEARS_KEY } from "@/components/comercial-provider";
import { useCompanyMode } from "@/lib/company-context";
import { SITUACOES, situacaoDaUnidade, ehVendida } from "@/lib/situacao-unidade";
import { andarEFinal } from "@/lib/torre-3d";
import { FichaContrato } from "@/components/ficha-contrato";
// three.js só baixa quando alguém abre a visão 3D.
const Torre3D = dynamic(() => import("@/components/torre-3d"), { ssr: false, loading: () => <p className="text-sm text-slate-400 text-center py-10">Carregando maquete…</p> });
import {
  inferUnitTypeFromName, shortEnterpriseName, normalizeFloor, floorSortKey, valorDaUnidadeNoContrato,
  unidadesVendidas, resumoPorTipo, ehPermuta,
  ABAS_COMERCIAL, type ComercialAba,
} from "@/lib/comercial-utils";

const MONTH_OPTIONS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_NAMES: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

export function ComercialView({ aba }: { aba: ComercialAba }) {
  const router = useRouter();
  const { isHolding } = useCompanyMode();
  const {
    salesContracts, apiUnits, comissoes, cubData, companySettings, chartColors,
    loading, refreshing, lastUpdate, refresh,
    allCompanyNames, availableYears,
    selectedCompanies, setSelectedCompanies,
    selectedYears, setSelectedYears, selectedMonths, setSelectedMonths,
    expandedComercial, setExpandedComercial, comercialSort, setComercialSort,
    clienteSearch, setClienteSearch, clientesSort, setClientesSort,
    comercialChartView, setComercialChartView,
    quadroView, setQuadroView,
    selectedUnitStatuses, setSelectedUnitStatuses,
    selectedSituacoes, setSelectedSituacoes, mostrarValores, setMostrarValores,
    selectedContractStatuses, setSelectedContractStatuses,
    selectedUnitEnterprises, setSelectedUnitEnterprises,
    selectedUnitTypes, setSelectedUnitTypes, selectedUnits, setSelectedUnits,
    selectedUnitCustomers, setSelectedUnitCustomers,
    toggleInSet, precosTabela,
  } = useComercial();
  // Vendas: contar por unidade (padrão, como no Financeiro da Leven) ou por contrato.
  const [contarPor, setContarPor] = React.useState<"unidades" | "contratos">("unidades");
  // Quadro › 3D: qual empreendimento a maquete mostra (com mais de um filtrado).
  const [emp3d, setEmp3d] = React.useState("");
  // Ficha do contrato aberta (chave "empreendimento||unidade").
  const [fichaKey, setFichaKey] = React.useState<string | null>(null);

  const meta = ABAS_COMERCIAL.find(a => a.key === aba)!;
  // Atalhos internos ("ver unidades disponíveis", "ver cliente") trocam de
  // rota em vez de trocar sub-aba: o estado dos filtros vive no provider,
  // então sobrevive à navegação.
  const navegar = (destino: ComercialAba) => {
    const alvo = ABAS_COMERCIAL.find(a => a.key === destino);
    if (alvo) router.push(alvo.href);
  };

  // A Holding não tem vendas de unidades (o menu Comercial nem aparece nesse modo).
  if (isHolding) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm text-slate-500 text-center">O módulo Comercial não se aplica à Holding. Troque para Silva Packer no topo da tela.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  // Tabela de Preços: tela própria, sem os filtros de Empresa/Ano do módulo
  // (preço é por unidade, não por período). Mesma tela do Financeiro da Leven.
  if (aba === "precos") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>
        <TabelaPrecosView />
      </div>
    );
  }

    // ─── Unit type inference from name (must be before filtered) ───
    const inferUnitType = inferUnitTypeFromName;

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
      if (selectedContractStatuses.size > 0) {
        const situation = c.cancellationDate ? "Cancelado" : c.situation || "Outro";
        if (!selectedContractStatuses.has(situation)) return false;
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
    // Vendas por unidade: cada unidade dos contratos filtrados, com a parte dela
    // no valor do contrato. Com "Tipo Imóvel" marcado, só as unidades daquele
    // tipo contam (no modo contratos o filtro continua escolhendo contratos).
    const porUnidade = contarPor === "unidades";
    // Tipo do cadastro do Sienge (o mesmo do filtro "Tipo Imóvel"); sem cadastro, pelo nome.
    const tipoCadastro = new Map(apiUnits.map(u => [`${u.enterpriseName}||${u.name}`, u.propertyType]));
    const tipoNoContrato = (c: { enterpriseName?: string | null }, nome: string) =>
      tipoCadastro.get(`${c.enterpriseName}||${nome}`) || inferUnitTypeFromName(nome);
    const uVend = unidadesVendidas(filtered, tipoNoContrato, selectedUnitTypes);
    const medir = (cs: typeof filtered) => {
      if (!porUnidade) return { n: cs.length, valor: cs.reduce((s, c) => s + (c.value || 0), 0) };
      const us = unidadesVendidas(cs, tipoNoContrato, selectedUnitTypes);
      return { n: us.length, valor: us.reduce((s, u) => s + u.valor, 0) };
    };
    const vendasN = porUnidade ? uVend.length : totalContracts;
    const vendasValor = porUnidade ? uVend.reduce((s, u) => s + u.valor, 0) : totalValue;
    const vendasTicket = vendasN > 0 ? vendasValor / vendasN : 0;
    const rotuloN = porUnidade ? "unidades" : "contratos";
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
      .map(([name, data]) => ({ name, ...data, ...medir(data.contracts) }))
      .sort((a, b) => {
        const { field, dir } = comercialSort;
        let cmp = 0;
        switch (field) {
          case "name": cmp = a.name.localeCompare(b.name); break;
          case "contracts": cmp = a.n - b.n; break;
          case "totalValue": cmp = a.valor - b.valor; break;
          case "ticket": {
            const ta = a.n > 0 ? a.valor / a.n : 0;
            const tb = b.n > 0 ? b.valor / b.n : 0;
            cmp = ta - tb; break;
          }
          case "pct": cmp = a.valor - b.valor; break;
        }
        return dir === "asc" ? cmp : -cmp;
      });

    // Monthly chart data
    const pontosGrafico = porUnidade
      ? uVend.map(u => ({ data: u.data, valor: u.valor }))
      : filtered.map(c => ({ data: c.contractDate, valor: c.value || 0 }));
    const monthlyMap = new Map<string, number>();
    pontosGrafico.forEach(p => {
      if (!p.data) return;
      const key = p.data.substring(0, 7); // YYYY-MM
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + p.valor);
    });
    const monthlyChart = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => {
        const [y, m] = month.split("-");
        return { month: `${MONTH_LABELS[parseInt(m, 10) - 1] || m}/${y.slice(2)}`, value };
      });

    // Yearly chart data
    const yearlyMap = new Map<string, number>();
    pontosGrafico.forEach(p => {
      if (!p.data) return;
      const year = p.data.substring(0, 4);
      yearlyMap.set(year, (yearlyMap.get(year) || 0) + p.valor);
    });
    const yearlyChart = Array.from(yearlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, value]) => ({ month: year, value }));

    const rawChart = comercialChartView === "anual" ? yearlyChart : monthlyChart;
    const comercialChart = rawChart.map((item, idx) => {
      const prev = idx > 0 ? rawChart[idx - 1].value : 0;
      const pct = prev > 0 ? ((item.value - prev) / prev) * 100 : null;
      return { ...item, pct };
    });

    // ─── Unit analysis: API units + sales contract enrichment ───
    type UnitRecord = { enterprise: string; unit: string; status: string; tipo: string; value: number; customer: string; contractDate: string; area: number; floor: string; permuta: boolean; situacao: string; unitId?: number };
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
          floor: u.floor || "",
          permuta: false,
          situacao: "",
          unitId: u.id,
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
            existing.value = valorDaUnidadeNoContrato(c.value || 0, c.salesContractUnits || [], u.name) || existing.value;
            existing.customer = c.salesContractCustomers?.[0]?.name || existing.customer;
            existing.contractDate = c.contractDate || existing.contractDate;
            existing.permuta = ehPermuta(c);
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
            value: valorDaUnidadeNoContrato(c.value || 0, c.salesContractUnits || [], u.name),
            customer: c.salesContractCustomers?.[0]?.name || "—",
            contractDate: c.contractDate || "",
            area: 0,
            floor: "",
            permuta: ehPermuta(c),
            situacao: "",
          });
        }
      });
    });

    const allUnits = Array.from(unitMap.values());
    // Contrato ativo de cada unidade (o mais recente): abre a ficha do contrato.
    const contratoPorUnidade = new Map<string, SiengeSalesContract>();
    salesContracts.forEach(c => {
      if (c.cancellationDate || c.situation === "Cancelado" || c.situation === "Distratado") return;
      (c.salesContractUnits || []).forEach(cu => {
        const k = `${c.enterpriseName}||${cu.name}`;
        const atual = contratoPorUnidade.get(k);
        if (!atual || (c.contractDate || "") > (atual.contractDate || "")) contratoPorUnidade.set(k, c);
      });
    });
    const abrirFicha = (u: { enterprise: string; unit: string }) => {
      const k = `${u.enterprise}||${u.unit}`;
      if (contratoPorUnidade.has(k)) setFichaKey(k);
    };
    // Situação do Quadro (cor/legenda): estoque do Sienge + permuta pura = Permutante.
    allUnits.forEach(u => { u.situacao = situacaoDaUnidade(u.status, u.permuta); });
    // Preço de tabela (painel) só vale para unidade sem venda; a vendida mostra o contrato.
    const precoTabela = (u: UnitRecord) => (u.unitId != null && semVenda(u.status) ? precosTabela.get(u.unitId) ?? 0 : 0);

    // Planilha das unidades vendidas (Vendas › Exportar Excel): uma linha por
    // unidade dos contratos filtrados (respeita Tipo Imóvel) + aba com o
    // estoque do Sienge por situação. Mesmo relatório do Financeiro da Leven.
    const exportarUnidades = async () => {
      const { planilhaUnidadesVendidas } = await import("@/lib/excel-unidades-vendidas");
      const info = new Map(allUnits.map(u => [`${u.enterprise}||${u.unit}`, u]));
      const linhas = uVend
        .slice()
        .sort((a, b) => a.empreendimento.localeCompare(b.empreendimento) || a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }))
        .map(u => {
          const x = info.get(`${u.empreendimento}||${u.unidade}`);
          return {
            empreendimento: u.empreendimento, unidade: u.unidade, tipo: u.tipo,
            pavimento: Number((normalizeFloor(x?.floor || "").match(/\d+/) || [])[0]) || null, area: x?.area || null,
            estoque: x?.status || "", contrato: u.contrato, situacao: u.situacao, data: u.data,
            cliente: u.cliente, permuta: u.permuta, valor: Math.round(u.valor * 100) / 100,
            situacaoQuadro: x?.status || "",
          };
        });
      const emps = new Set(uVend.map(u => u.empreendimento));
      const est = allUnits.filter(u => (emps.size ? emps.has(u.enterprise) : true) && (selectedUnitTypes.size ? selectedUnitTypes.has(u.tipo) : true));
      const porSit = new Map<string, number>();
      est.forEach(u => porSit.set(u.status, (porSit.get(u.status) || 0) + 1));
      const estoque = Array.from(porSit.entries()).sort((a, b) => b[1] - a[1]).map(([situacao, unidades]) => ({ situacao, unidades }));
      const filtros = [
        selectedUnitTypes.size ? `Tipo: ${Array.from(selectedUnitTypes).join(", ")}` : "",
        selectedUnitEnterprises.size ? `Empreendimento: ${Array.from(selectedUnitEnterprises).map(shortEnterpriseName).join(", ")}` : "",
        selectedContractStatuses.size ? `Situação: ${Array.from(selectedContractStatuses).join(", ")}` : "",
        selectedYears.size && selectedYears.size < 5 ? `Ano: ${Array.from(selectedYears).sort().join(", ")}` : "",
        selectedMonths.size ? `Meses: ${Array.from(selectedMonths).sort().map(m => MONTH_NAMES[m]?.slice(0, 3)).join(", ")}` : "",
        selectedUnitCustomers.size ? `Cliente: ${selectedUnitCustomers.size} selecionado(s)` : "",
      ].filter(Boolean);
      const nomeEmp = emps.size === 1 ? shortEnterpriseName(Array.from(emps)[0]) : "Silva Packer";
      const blob = await planilhaUnidadesVendidas(linhas, estoque, { empresa: nomeEmp, filtros });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `unidades-vendidas-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success(`${linhas.length} unidades exportadas`);
    };

    // Tipo Imóvel options for Vendas (cascaded by enterprise selection)
    const vendasUnitsForEnterprise = selectedUnitEnterprises.size === 0 ? allUnits : allUnits.filter(u => selectedUnitEnterprises.has(u.enterprise));
    const allVendasTypes = Array.from(new Set(vendasUnitsForEnterprise.map(u => u.tipo))).sort();

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">Atualizado em {lastUpdate}</span>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros globais (Empresas → Anos → Meses), os mesmos da aba antiga */}
      <div className="flex items-center gap-2 flex-wrap">
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
            localStorage.setItem(COMPANY_KEY, JSON.stringify([...selectedCompanies]));
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
            localStorage.setItem(YEARS_KEY, JSON.stringify([...selectedYears]));
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
      </div>

      <div>
      {/* ─── VISÃO GERAL SUB-TAB ─── */}
      {aba === "visao" && (() => {
        // A visão geral respeita só os filtros globais (empresa/ano/mês).
        // Os filtros finos (empreendimento/tipo/status/cliente) pertencem às demais sub-abas.
        const isCancelled = (c: SiengeSalesContract) => Boolean(c.cancellationDate) || c.situation === "Cancelado" || c.situation === "Distratado";
        const ovContracts = salesContracts.filter(c => {
          if (selectedCompanies.size > 0 && !selectedCompanies.has(c.companyName)) return false;
          if (selectedYears.size > 0 && c.contractDate && !selectedYears.has(c.contractDate.substring(0, 4))) return false;
          if (selectedMonths.size > 0 && c.contractDate && !selectedMonths.has(c.contractDate.substring(5, 7))) return false;
          return true;
        });
        const ovAtivos = ovContracts.filter(c => !isCancelled(c));
        const ovCancelados = ovContracts.length - ovAtivos.length;
        const ovVgv = ovAtivos.reduce((s, c) => s + (c.value || 0), 0);
        const ovTicket = ovAtivos.length > 0 ? ovVgv / ovAtivos.length : 0;

        // Estoque real (sem permuta/veículo), a partir das unidades da API
        const isRealUnit = (tipo: string) => !(/permuta|veículo|veiculos/i.test(tipo));
        const ovUnits = allUnits.filter(u => isRealUnit(u.tipo));
        const ovTotalUn = ovUnits.length;
        const ovVendidasUn = ovUnits.filter(u => u.status === "Vendida" || u.status === "Vendido/Terceiros").length;
        const ovDispUn = ovUnits.filter(u => u.status === "Disponível").length;
        const ovPctVend = ovTotalUn > 0 ? (ovVendidasUn / ovTotalUn) * 100 : 0;

        // VGV potencial do estoque disponível: área privativa × fator × CUB
        // (mesma regra do Resumo Financeiro — considera só unidades tipo apartamento)
        const ovIsAptoLike = (name: string) => {
          const n = name.toUpperCase();
          return !(/VAGA|GARAGEM|ESTACION/.test(n) || /\bSL\b|\bSALA\b|COMERCIAL/.test(n) || /\bLJ\b|\bLOJA\b/.test(n) || /\bDEP\b|DEPOSITO|\bBOX\b/.test(n));
        };
        let ovEstoqueArea = 0;
        let ovEstoqueVgv = 0;
        apiUnits.forEach(u => {
          if (u.commercialStock !== "Disponível") return;
          if (selectedCompanies.size > 0 && u.companyName && !selectedCompanies.has(u.companyName)) return;
          if (!ovIsAptoLike(u.name)) return;
          ovEstoqueArea += u.privateArea || 0;
          const factor = companySettings.find(cs => cs.companyName === u.companyName)?.factor || 0;
          ovEstoqueVgv += (u.privateArea || 0) * factor * (cubData?.currentValue || 0);
        });

        // Evolução anual (só contratos ativos)
        const ovYearMap = new Map<string, { value: number; count: number }>();
        ovAtivos.forEach(c => {
          if (!c.contractDate) return;
          const y = c.contractDate.substring(0, 4);
          const e = ovYearMap.get(y) || { value: 0, count: 0 };
          e.value += c.value || 0; e.count += 1;
          ovYearMap.set(y, e);
        });
        const ovYearlyRaw = Array.from(ovYearMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([year, d]) => ({ month: year, ...d }));
        const ovChart = ovYearlyRaw.map((item, idx) => {
          const prev = idx > 0 ? ovYearlyRaw[idx - 1].value : 0;
          const pct = prev > 0 ? ((item.value - prev) / prev) * 100 : null;
          return { ...item, pct };
        });

        // Top empreendimentos por VGV
        const ovEntMap = new Map<string, { value: number; count: number }>();
        ovAtivos.forEach(c => {
          const k = c.enterpriseName || c.companyName;
          const e = ovEntMap.get(k) || { value: 0, count: 0 };
          e.value += c.value || 0; e.count += 1;
          ovEntMap.set(k, e);
        });
        const ovTopEnts = Array.from(ovEntMap.entries())
          .map(([name, d]) => {
            const entUnits = ovUnits.filter(u => u.enterprise === name);
            const entVend = entUnits.filter(u => u.status === "Vendida" || u.status === "Vendido/Terceiros").length;
            return { name, ...d, totalUn: entUnits.length, pctVend: entUnits.length > 0 ? (entVend / entUnits.length) * 100 : 0 };
          })
          .sort((a, b) => b.value - a.value)
          .slice(0, 6);
        const ovMaxEntValue = ovTopEnts.length > 0 ? ovTopEnts[0].value : 0;

        // Top clientes por valor comprado
        const ovCliMap = new Map<string, { value: number; count: number }>();
        ovAtivos.forEach(c => {
          const k = c.salesContractCustomers?.[0]?.name || "Não informado";
          const e = ovCliMap.get(k) || { value: 0, count: 0 };
          e.value += c.value || 0; e.count += 1;
          ovCliMap.set(k, e);
        });
        const ovTopClientes = Array.from(ovCliMap.entries())
          .map(([name, d]) => ({ name, ...d }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6);
        const ovTotalClientes = ovCliMap.size;

        // Últimas vendas (mais recentes primeiro)
        const ovRecentes = ovAtivos
          .filter(c => c.contractDate)
          .sort((a, b) => b.contractDate.localeCompare(a.contractDate))
          .slice(0, 8);

        const kpiCard = "border border-slate-200/50 dark:border-slate-700/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group";

        return <>
          {/* KPI hero row */}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-emerald-600/80 uppercase tracking-widest">VGV Vendido</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{formatCurrency(ovVgv)}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">{ovAtivos.length} contratos ativos</p>
                  </div>
                  <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-2xl ring-1 ring-emerald-100/50 dark:ring-emerald-900/50 shadow-sm"><Banknote className="h-5 w-5 text-emerald-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-indigo-600/80 uppercase tracking-widest">Contratos</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{ovContracts.length}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">{ovAtivos.length} ativos · {ovCancelados} cancelados · {ovTotalClientes} clientes</p>
                  </div>
                  <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/30 rounded-2xl ring-1 ring-indigo-100/50 dark:ring-indigo-900/50 shadow-sm"><FileText className="h-5 w-5 text-indigo-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-blue-600/80 uppercase tracking-widest">Ticket Médio</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{formatCurrency(ovTicket)}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">por contrato ativo</p>
                  </div>
                  <div className="p-3 bg-blue-50/80 dark:bg-blue-950/30 rounded-2xl ring-1 ring-blue-100/50 dark:ring-blue-900/50 shadow-sm"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card
              className={`${kpiCard} cursor-pointer`}
              onClick={() => { setSelectedUnitStatuses(new Set(["Disponível"])); navegar("unidades"); }}
              title="Ver unidades disponíveis"
            >
              <div className={`h-1.5 bg-gradient-to-r ${ovPctVend >= 80 ? "from-emerald-500 to-emerald-400" : ovPctVend >= 50 ? "from-blue-500 to-blue-400" : "from-amber-500 to-amber-400"} group-hover:h-2 transition-all duration-300`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-violet-600/80 uppercase tracking-widest">Estoque</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{ovPctVend.toFixed(0)}% <span className="text-lg font-bold text-slate-400">vendido</span></p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">{ovVendidasUn} vendidas · {ovDispUn} disponíveis · {ovTotalUn} total</p>
                  </div>
                  <div className="p-3 bg-violet-50/80 dark:bg-violet-950/30 rounded-2xl ring-1 ring-violet-100/50 dark:ring-violet-900/50 shadow-sm"><Building2 className="h-5 w-5 text-violet-500" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Evolução anual + Estoque à venda */}
          <div className="grid gap-6 lg:grid-cols-3 mt-6">
            <Card className="border-0 shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg text-slate-800 dark:text-slate-100">Evolução das Vendas</CardTitle>
                    <CardDescription className="text-slate-400">VGV por ano (contratos ativos)</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500 hover:text-indigo-600" onClick={() => navegar("vendas")}>
                    Ver detalhes <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {ovChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ovChart} margin={{ top: 40, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} width={80} />
                      <RechartsTooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Valor"]} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}
                        label={((props: Record<string, unknown>) => {
                          const x = Number(props.x ?? 0), y = Number(props.y ?? 0), w = Number(props.width ?? 0), value = Number(props.value ?? 0), index = Number(props.index ?? 0);
                          const entry = ovChart[index];
                          const pct = entry?.pct;
                          return (
                            <g>
                              <text x={x + w / 2} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={700} fill={chartColors.valueText}>
                                {formatCompactCurrency(value)}
                              </text>
                              {pct !== null && pct !== undefined && (
                                <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={pct >= 0 ? chartColors.green : chartColors.red}>
                                  {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                                </text>
                              )}
                            </g>
                          );
                        }) as unknown as undefined}
                      >
                        {(() => {
                          const values = ovChart.map(d => d.value);
                          const maxVal = Math.max(...values);
                          return ovChart.map((entry, idx) => (
                            <Cell key={idx} fill={entry.value === maxVal ? "#22c55e" : "#6366f1"} />
                          ));
                        })()}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-slate-400 text-sm">Sem dados para o período</div>
                )}
              </CardContent>
            </Card>

            {/* Estoque à venda */}
            <Card
              className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => { setSelectedUnitStatuses(new Set(["Disponível"])); navegar("unidades"); }}
              title="Ver unidades disponíveis"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-slate-800 dark:text-slate-100">Estoque à Venda</CardTitle>
                <CardDescription className="text-slate-400">Unidades disponíveis e potencial de venda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-black text-emerald-600 tabular-nums leading-none">{ovDispUn}</p>
                  <p className="text-sm font-semibold text-slate-500">unidades disponíveis</p>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  {ovTotalUn > 0 && <>
                    <div className="h-full bg-red-400 dark:bg-red-300/60" style={{ width: `${(ovVendidasUn / ovTotalUn) * 100}%` }} title={`Vendidas: ${ovVendidasUn}`} />
                    <div className="h-full bg-emerald-400" style={{ width: `${(ovDispUn / ovTotalUn) * 100}%` }} title={`Disponíveis: ${ovDispUn}`} />
                  </>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">VGV Potencial</p>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">{ovEstoqueVgv > 0 ? formatCompactCurrency(ovEstoqueVgv) : "—"}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Área Privativa</p>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">{ovEstoqueArea > 0 ? `${ovEstoqueArea.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²` : "—"}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  VGV potencial estimado: área privativa × fator da empresa × CUB atual{cubData?.currentMonth ? ` (${cubData.currentMonth})` : ""}. Considera só unidades tipo apartamento.
                </p>
                <div className="flex items-center text-xs font-semibold text-emerald-600">
                  Ver unidades disponíveis <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rankings: empreendimentos, clientes e últimas vendas */}
          <div className="grid gap-6 lg:grid-cols-3 mt-6">
            {/* Top empreendimentos */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Top Empreendimentos</CardTitle>
                <CardDescription className="text-xs text-slate-400">Por VGV vendido — clique para detalhar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ovTopEnts.length > 0 ? ovTopEnts.map((ent, i) => (
                  <div
                    key={ent.name}
                    className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 cursor-pointer transition-colors"
                    onClick={() => { setSelectedUnitEnterprises(new Set([ent.name])); setSelectedUnitTypes(new Set()); setSelectedUnits(new Set()); navegar("vendas"); }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`flex-shrink-0 w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>{i + 1}</span>
                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate" title={ent.name}>{shortEnterpriseName(ent.name)}</span>
                      </div>
                      <span className="text-[12px] font-black text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">{formatCompactCurrency(ent.value)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${ovMaxEntValue > 0 ? (ent.value / ovMaxEntValue) * 100 : 0}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">{ent.count} contr. · {ent.pctVend.toFixed(0)}% vend.</span>
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-400 text-center py-6">Sem dados</p>}
              </CardContent>
            </Card>

            {/* Top clientes */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Top Clientes</CardTitle>
                    <CardDescription className="text-xs text-slate-400">Por valor comprado — clique para detalhar</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500 hover:text-rose-600" onClick={() => { setClienteSearch(""); navegar("clientes"); }}>
                    Todos <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {ovTopClientes.length > 0 ? ovTopClientes.map((cli, i) => (
                  <div
                    key={cli.name}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50/40 dark:hover:bg-rose-950/20 cursor-pointer transition-colors"
                    onClick={() => { setClienteSearch(cli.name); navegar("clientes"); }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {i === 0 ? (
                        <span className="flex-shrink-0 w-5 h-5 rounded-md bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center"><Crown className="h-3 w-3 text-amber-600 dark:text-amber-400" /></span>
                      ) : (
                        <span className="flex-shrink-0 w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{i + 1}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate" title={cli.name}>{cli.name}</p>
                        <p className="text-[10px] text-slate-400">{cli.count} contrato{cli.count > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <span className="text-[12px] font-black text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">{formatCompactCurrency(cli.value)}</span>
                  </div>
                )) : <p className="text-sm text-slate-400 text-center py-6">Sem dados</p>}
              </CardContent>
            </Card>

            {/* Últimas vendas */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Últimas Vendas</CardTitle>
                <CardDescription className="text-xs text-slate-400">Contratos mais recentes do período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ovRecentes.length > 0 ? ovRecentes.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate" title={c.salesContractCustomers?.[0]?.name || "—"}>
                        {c.salesContractCustomers?.[0]?.name || "—"}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {formatDate(c.contractDate)} · {shortEnterpriseName(c.enterpriseName || c.companyName)}
                        {(() => { const un = c.salesContractUnits?.filter(u => u.main)?.map(u => u.name).join(", "); return un ? ` · ${un}` : ""; })()}
                      </p>
                    </div>
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">{formatCompactCurrency(c.value || 0)}</span>
                  </div>
                )) : <p className="text-sm text-slate-400 text-center py-6">Sem dados</p>}
              </CardContent>
            </Card>
          </div>
        </>;
      })()}

      {/* ─── VENDAS SUB-TAB ─── */}
      {aba === "vendas" && <>
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
          selected={selectedContractStatuses}
          onToggle={(name) => { setSelectedContractStatuses(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
          onSelectAll={() => setSelectedContractStatuses(new Set(allVendasStatuses))}
          onClear={() => setSelectedContractStatuses(new Set())}
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Contar por</span>
          <Tabs value={contarPor} onValueChange={v => setContarPor(v as "unidades" | "contratos")}>
            <TabsList className="h-8">
              <TabsTrigger value="unidades" className="text-xs px-3 h-7">Unidades</TabsTrigger>
              <TabsTrigger value="contratos" className="text-xs px-3 h-7">Contratos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={uVend.length === 0}
            onClick={() => { exportarUnidades().catch(() => toast.error("Não foi possível gerar a planilha")); }}>
            <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
          </Button>
        </div>
      </div>
      {/* KPI Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-slate-200/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400 group-hover:h-2 transition-all duration-300" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-indigo-600/80 uppercase tracking-widest">{porUnidade ? "Unidades Vendidas" : "Total Contratos"}</p>
                <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{vendasN}</p>
                <p className="text-[11px] font-medium text-slate-400 mt-1">{porUnidade ? (resumoPorTipo(uVend) || "nenhuma") + ` · ${totalContracts} contratos` : `${emitidos} emitidos · ${cancelados} cancelados`}</p>
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
                <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{formatCurrency(vendasValor)}</p>
                {porUnidade && selectedUnitTypes.size > 0 && <p className="text-[11px] font-medium text-slate-400 mt-1">parte das unidades filtradas no valor dos contratos</p>}
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
                <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums tracking-tight">{formatCurrency(vendasTicket)}</p>
                <p className="text-[11px] font-medium text-slate-400 mt-1">por {porUnidade ? "unidade" : "contrato"}</p>
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
                <div key={row.name} className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all bg-white dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate" title={row.name}>{shortEnterpriseName(row.name)}</p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <strong className="font-extrabold text-slate-700 dark:text-slate-200 tabular-nums">{row.n}</strong> {rotuloN} · <strong className="font-extrabold text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(row.valor)}</strong>
                      </p>
                    </div>
                    <span className={`flex-shrink-0 text-sm font-black tabular-nums px-2.5 py-1 rounded-lg ${pctVendido >= 80 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" : pctVendido >= 50 ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"}`}>
                      {pctVendido.toFixed(0)}% <span className="text-[10px] font-bold opacity-70">vendido</span>
                    </span>
                  </div>
                  {totalUn > 0 && (
                    <>
                      {/* Barra de progresso segmentada */}
                      <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex gap-[1px] mb-3">
                        {vendidas > 0 && <div className="h-full bg-red-400 dark:bg-red-300/70 transition-all" style={{ width: `${pctVendido}%` }} title={`Vendidas: ${vendidas}`} />}
                        {reserva > 0 && <div className="h-full bg-blue-400 transition-all" style={{ width: `${(reserva / totalUn) * 100}%` }} title={`Reserva: ${reserva}`} />}
                        {outros > 0 && <div className="h-full bg-amber-400 transition-all" style={{ width: `${(outros / totalUn) * 100}%` }} title={`Outros: ${outros}`} />}
                        {disponiveis > 0 && <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pctDisponivel}%` }} title={`Disponíveis: ${disponiveis}`} />}
                      </div>
                      {/* Contadores grandes por status */}
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/50 px-2 py-2 text-center">
                          <p className="text-2xl font-black text-slate-700 dark:text-slate-200 tabular-nums leading-none">{totalUn}</p>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">Unidades</p>
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-2 py-2 text-center">
                          <p className="text-2xl font-black text-red-500 dark:text-red-300/80 tabular-nums leading-none">{vendidas}</p>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-red-400/90 mt-1">Vendidas</p>
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 px-2 py-2 text-center">
                          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-300 tabular-nums leading-none">{disponiveis}</p>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500/90 mt-1">Disponíveis</p>
                        </div>
                        {reserva > 0 && (
                          <div className="flex-1 min-w-0 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 px-2 py-2 text-center">
                            <p className="text-2xl font-black text-blue-600 dark:text-blue-300 tabular-nums leading-none">{reserva}</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-500/90 mt-1">Reserva</p>
                          </div>
                        )}
                        {outros > 0 && (
                          <div className="flex-1 min-w-0 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-2 py-2 text-center">
                            <p className="text-2xl font-black text-amber-600 dark:text-amber-300 tabular-nums leading-none">{outros}</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500/90 mt-1">Outros</p>
                          </div>
                        )}
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
                  {comercialChartView === "anual" ? "Vendas por Ano" : "Vendas por Mês"}
                </CardTitle>
                <CardDescription className="text-slate-400">Evolução das vendas no período</CardDescription>
              </div>
              <Tabs value={comercialChartView} onValueChange={v => setComercialChartView(v as "anual" | "mensal")}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
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
                          <text x={x + w / 2} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={700} fill={chartColors.valueText}>
                            {formatCompactCurrency(value)}
                          </text>
                          {pct !== null && pct !== undefined && (
                            <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={pct >= 0 ? chartColors.green : chartColors.red}>
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
          <CardDescription className="text-xs text-slate-400">{vendasN} {rotuloN} · {formatCurrency(vendasValor)}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[500px] border-t border-slate-100">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-slate-200">
                {([
                  { key: "name" as const, label: "Empreendimento", align: "left" },
                  { key: "contracts" as const, label: porUnidade ? "Unidades" : "Contratos", align: "right" },
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
                const pct = vendasValor > 0 ? (row.valor / vendasValor) * 100 : 0;
                const avgTicket = row.n > 0 ? row.valor / row.n : 0;
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
                          <span className="font-semibold text-[13px] text-slate-700" title={row.name}>{shortEnterpriseName(row.name)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-[13px] text-slate-700 tabular-nums">{row.n}</TableCell>
                      <TableCell className="text-right font-bold text-[13px] text-slate-700 tabular-nums">{formatCurrency(row.valor)}</TableCell>
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
                <TableCell className="text-right font-bold text-[13px] text-indigo-800 tabular-nums">{vendasN}</TableCell>
                <TableCell className="text-right font-bold text-[14px] text-indigo-800 tabular-nums">{formatCurrency(vendasValor)}</TableCell>
                <TableCell className="text-right font-bold text-[13px] text-indigo-700 tabular-nums">{formatCurrency(vendasTicket)}</TableCell>
                <TableCell className="text-right pr-5 font-bold text-[13px] text-indigo-700">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
      </Card>
      </>}

      {/* ─── CLIENTES SUB-TAB ─── */}
      {aba === "clientes" && (() => {
        // Agrupa os contratos filtrados por cliente (1º titular do contrato).
        // Usa `filtered` — respeita os mesmos filtros da aba Vendas
        // (empresa/ano/mês + empreendimento/tipo/status/cliente).
        type CliRow = { name: string; contracts: typeof filtered; totalValue: number; units: number; enterprises: Set<string>; lastDate: string };
        const cliMap = new Map<string, CliRow>();
        filtered.forEach(c => {
          const name = c.salesContractCustomers?.[0]?.name || "Não informado";
          if (!cliMap.has(name)) cliMap.set(name, { name, contracts: [], totalValue: 0, units: 0, enterprises: new Set(), lastDate: "" });
          const row = cliMap.get(name)!;
          row.contracts.push(c);
          row.totalValue += c.value || 0;
          const mainUnits = c.salesContractUnits?.filter(u => u.main);
          row.units += (mainUnits && mainUnits.length > 0) ? mainUnits.length : (c.salesContractUnits?.length || 0);
          row.enterprises.add(c.enterpriseName || c.companyName);
          if (c.contractDate && c.contractDate > row.lastDate) row.lastDate = c.contractDate;
        });

        const search = clienteSearch.trim().toLowerCase();
        const cliRows = Array.from(cliMap.values())
          .filter(r => !search || r.name.toLowerCase().includes(search))
          .sort((a, b) => {
            const { field, dir } = clientesSort;
            let cmp = 0;
            switch (field) {
              case "name": cmp = a.name.localeCompare(b.name); break;
              case "contracts": cmp = a.contracts.length - b.contracts.length; break;
              case "units": cmp = a.units - b.units; break;
              case "lastDate": cmp = a.lastDate.localeCompare(b.lastDate); break;
              case "totalValue": cmp = a.totalValue - b.totalValue; break;
            }
            return dir === "asc" ? cmp : -cmp;
          });

        const cliTotalValue = cliRows.reduce((s, r) => s + r.totalValue, 0);
        const cliTotalContracts = cliRows.reduce((s, r) => s + r.contracts.length, 0);
        const cliTicket = cliRows.length > 0 ? cliTotalValue / cliRows.length : 0;
        const cliRecorrentes = cliRows.filter(r => r.contracts.length > 1).length;
        const cliTop = cliRows.length > 0 ? [...cliRows].sort((a, b) => b.totalValue - a.totalValue)[0] : null;

        const kpiCard = "border border-slate-200/50 dark:border-slate-700/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group";

        return <>
          {/* KPI cards */}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-rose-500 to-rose-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-rose-600/80 uppercase tracking-widest">Clientes</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{cliRows.length}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">{cliTotalContracts} contratos no período</p>
                  </div>
                  <div className="p-3 bg-rose-50/80 dark:bg-rose-950/30 rounded-2xl ring-1 ring-rose-100/50 dark:ring-rose-900/50 shadow-sm"><Users className="h-5 w-5 text-rose-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-emerald-600/80 uppercase tracking-widest">Valor Comprado</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{formatCurrency(cliTotalValue)}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">média de {formatCompactCurrency(cliTicket)} por cliente</p>
                  </div>
                  <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-2xl ring-1 ring-emerald-100/50 dark:ring-emerald-900/50 shadow-sm"><Banknote className="h-5 w-5 text-emerald-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-600/80 uppercase tracking-widest">Maior Cliente</p>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 truncate" title={cliTop?.name || "—"}>{cliTop?.name || "—"}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">{cliTop ? `${formatCurrency(cliTop.totalValue)} · ${cliTop.contracts.length} contrato${cliTop.contracts.length > 1 ? "s" : ""}` : "sem dados"}</p>
                  </div>
                  <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 rounded-2xl ring-1 ring-amber-100/50 dark:ring-amber-900/50 shadow-sm flex-shrink-0"><Crown className="h-5 w-5 text-amber-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className={kpiCard}>
              <div className="h-1.5 bg-gradient-to-r from-violet-500 to-violet-400 group-hover:h-2 transition-all duration-300" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-violet-600/80 uppercase tracking-widest">Recompra</p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums tracking-tight">{cliRecorrentes}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1">clientes com mais de 1 contrato</p>
                  </div>
                  <div className="p-3 bg-violet-50/80 dark:bg-violet-950/30 rounded-2xl ring-1 ring-violet-100/50 dark:ring-violet-900/50 shadow-sm"><Handshake className="h-5 w-5 text-violet-500" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Busca + filtros */}
          <div className="flex items-center gap-2 flex-wrap mt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={clienteSearch}
                onChange={e => setClienteSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="h-9 w-64 pl-9 pr-8 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900 focus:border-rose-300 transition-all"
              />
              {clienteSearch && (
                <button onClick={() => setClienteSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Limpar busca">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
              label="Status"
              icon={<CheckCircle className="h-4 w-4" />}
              allOptions={allVendasStatuses}
              selected={selectedContractStatuses}
              onToggle={(name) => { setSelectedContractStatuses(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; }); }}
              onSelectAll={() => setSelectedContractStatuses(new Set(allVendasStatuses))}
              onClear={() => setSelectedContractStatuses(new Set())}
              activeColor="emerald"
            />
          </div>

          {/* Tabela de clientes */}
          <Card className="border-0 shadow-sm mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">Clientes e Contratos</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {cliRows.length} cliente{cliRows.length !== 1 ? "s" : ""} · {cliTotalContracts} contratos · {formatCurrency(cliTotalValue)}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px] border-t border-slate-100 dark:border-slate-800">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-700">
                      {([
                        { key: "name" as const, label: "Cliente", align: "left" },
                        { key: "contracts" as const, label: "Contratos", align: "right" },
                        { key: "units" as const, label: "Unidades", align: "right" },
                        { key: "lastDate" as const, label: "Última Compra", align: "right" },
                        { key: "totalValue" as const, label: "Valor Total", align: "right" },
                      ] as const).map((col, i) => {
                        const isSorted = clientesSort.field === col.key;
                        const SortIcon = isSorted ? (clientesSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return (
                          <TableHead
                            key={col.key}
                            className={`font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11 cursor-pointer hover:text-slate-700 select-none ${col.align === "right" ? "text-right" : ""} ${i === 0 ? "pl-5" : ""}`}
                            onClick={() => setClientesSort(prev => ({
                              field: col.key,
                              dir: prev.field === col.key && prev.dir === "desc" ? "asc" : "desc",
                            }))}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              <SortIcon className={`h-3 w-3 ${isSorted ? "text-rose-500" : "text-slate-300"}`} />
                            </span>
                          </TableHead>
                        );
                      })}
                      <TableHead className="font-bold text-[11px] text-slate-500 uppercase tracking-widest h-11 text-right pr-5">% do Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cliRows.map(row => {
                      const pct = cliTotalValue > 0 ? (row.totalValue / cliTotalValue) * 100 : 0;
                      const key = `cliente-${row.name}`;
                      const isExpanded = expandedComercial.has(key);
                      return (
                        <React.Fragment key={row.name}>
                          <TableRow
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-800"
                            onClick={() => {
                              setExpandedComercial(prev => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key); else next.add(key);
                                return next;
                              });
                            }}
                          >
                            <TableCell className="pl-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`p-0.5 rounded transition-colors ${isExpanded ? "bg-rose-100 dark:bg-rose-950/50" : ""}`}>
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-rose-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                                </div>
                                <span className="font-semibold text-[13px] text-slate-700 dark:text-slate-200">{row.name}</span>
                                {row.contracts.length > 1 && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-violet-200 text-violet-600 bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:bg-violet-950/30 uppercase font-bold tracking-wider">Recompra</Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 ml-6 truncate" title={Array.from(row.enterprises).join(", ")}>{Array.from(row.enterprises).map(shortEnterpriseName).join(", ")}</p>
                            </TableCell>
                            <TableCell className="text-right font-bold text-[13px] text-slate-700 dark:text-slate-200 tabular-nums">{row.contracts.length}</TableCell>
                            <TableCell className="text-right text-[13px] text-slate-600 dark:text-slate-300 tabular-nums">{row.units}</TableCell>
                            <TableCell className="text-right text-[13px] text-slate-500 tabular-nums">{row.lastDate ? formatDate(row.lastDate) : "—"}</TableCell>
                            <TableCell className="text-right font-bold text-[13px] text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(row.totalValue)}</TableCell>
                            <TableCell className="text-right pr-5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                                {pct.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                          {isExpanded && row.contracts
                            .sort((a, b) => (b.contractDate || "").localeCompare(a.contractDate || ""))
                            .map(c => (
                              <TableRow key={c.id} className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100/50 dark:border-slate-800/50">
                                <TableCell className="pl-12 py-2.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-slate-400 font-mono text-[10px] bg-white dark:bg-slate-800 py-0.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 shadow-sm">{c.number}</span>
                                    <span className="text-[12px] text-slate-600 dark:text-slate-300">{shortEnterpriseName(c.enterpriseName || c.companyName)}</span>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                      c.situation === "Emitido" ? "border-emerald-200 text-emerald-600 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/30" :
                                      c.situation === "Cancelado" || c.cancellationDate ? "border-red-200 text-red-600 bg-red-50 dark:border-red-800 dark:text-red-300/70 dark:bg-red-950/30" :
                                      "border-slate-200 text-slate-500"
                                    }`}>{c.cancellationDate ? "Cancelado" : c.situation}</Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-[12px] text-slate-500 tabular-nums">{formatDate(c.contractDate)}</TableCell>
                                <TableCell className="text-right text-[12px] text-slate-500 tabular-nums">
                                  {c.salesContractUnits?.filter(u => u.main)?.map(u => u.name).join(", ") || c.salesContractUnits?.map(u => u.name).join(", ") || "—"}
                                </TableCell>
                                <TableCell />
                                <TableCell className="text-right text-[12px] text-slate-600 dark:text-slate-300 font-medium tabular-nums">{formatCurrency(c.value)}</TableCell>
                                <TableCell className="text-right pr-5 text-[12px] text-slate-400 tabular-nums">{c.paymentConditions?.length || 0} cond.</TableCell>
                              </TableRow>
                            ))}
                        </React.Fragment>
                      );
                    })}
                    {cliRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-sm text-slate-400">
                          {clienteSearch ? `Nenhum cliente encontrado para "${clienteSearch}"` : "Sem clientes para os filtros atuais"}
                        </TableCell>
                      </TableRow>
                    )}
                    {/* Total row */}
                    {cliRows.length > 0 && (
                      <TableRow className="bg-rose-50/50 dark:bg-rose-950/20 border-t-2 border-rose-200 dark:border-rose-900">
                        <TableCell className="pl-5 py-3 font-bold text-[13px] text-rose-800 dark:text-rose-300">TOTAL — {cliRows.length} clientes</TableCell>
                        <TableCell className="text-right font-bold text-[13px] text-rose-800 dark:text-rose-300 tabular-nums">{cliTotalContracts}</TableCell>
                        <TableCell className="text-right font-bold text-[13px] text-rose-800 dark:text-rose-300 tabular-nums">{cliRows.reduce((s, r) => s + r.units, 0)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-bold text-[14px] text-rose-800 dark:text-rose-300 tabular-nums">{formatCurrency(cliTotalValue)}</TableCell>
                        <TableCell className="text-right pr-5 font-bold text-[13px] text-rose-700 dark:text-rose-300">100%</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>;
      })()}

      {/* ─── CORRETORES E IMOBILIÁRIAS ─── (vinda do Financeiro da Leven, 22/10/2026)
           Contratos ativos no período (Empresas/Anos/Meses do topo). */}
      {aba === "corretores" && (
        <CorretoresView
          comissoes={comissoes}
          contratos={salesContracts.filter(c => {
            if (c.cancellationDate || c.situation === "Cancelado" || c.situation === "Distratado") return false;
            if (selectedCompanies.size > 0 && !selectedCompanies.has(c.companyName)) return false;
            if (selectedYears.size > 0 && c.contractDate && !selectedYears.has(c.contractDate.substring(0, 4))) return false;
            if (selectedMonths.size > 0 && c.contractDate && !selectedMonths.has(c.contractDate.substring(5, 7))) return false;
            return true;
          })}
        />
      )}

      {/* ─── UNIDADES SUB-TAB ─── */}
      {aba === "unidades" && (() => {
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
              {filteredUnits.length} unidades {selectedUnitEnterprises.size > 0 && selectedUnitEnterprises.size <= 3 ? `em ${Array.from(selectedUnitEnterprises).map(shortEnterpriseName).join(", ")}` : `em ${enterpriseGroupRows.length} empreendimentos`}
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
                            <span className="font-bold text-[13px] text-slate-700" title={group.name}>{shortEnterpriseName(group.name)}</span>
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
                            <TableCell className="text-[12px] text-slate-500" title={u.enterprise}>{shortEnterpriseName(u.enterprise)}</TableCell>
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
      {aba === "quadro" && (() => {
        // Cascading filters using shared Set-based states
        const qEnterpriseOptions = Array.from(new Set(allUnits.map(u => u.enterprise))).sort();
        const qUnitsForEnterprise = selectedUnitEnterprises.size === 0 ? allUnits : allUnits.filter(u => selectedUnitEnterprises.has(u.enterprise));
        const qTypeOptions = Array.from(new Set(qUnitsForEnterprise.map(u => u.tipo))).sort();
        const qUnitsForType = selectedUnitTypes.size === 0 ? qUnitsForEnterprise : qUnitsForEnterprise.filter(u => selectedUnitTypes.has(u.tipo));
        const qUnitNames = Array.from(new Set(qUnitsForType.map(u => u.unit))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const qCustomerOptions = Array.from(new Set(allUnits.map(u => u.customer).filter(c => c && c !== "—"))).sort();

        // Filter units
        const qUnits = allUnits.filter(u => {
          if (selectedUnitEnterprises.size > 0 && !selectedUnitEnterprises.has(u.enterprise)) return false;
          if (selectedUnitTypes.size > 0 && !selectedUnitTypes.has(u.tipo)) return false;
          if (selectedUnits.size > 0 && !selectedUnits.has(u.unit)) return false;
          if (selectedUnitCustomers.size > 0 && !selectedUnitCustomers.has(u.customer)) return false;
          return true;
        }).sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));

        // Situações (situacao-unidade.ts): ordem da legenda + as que o Sienge
        // trouxer fora da lista, com o nome dele.
        const qSitOrdem = [...SITUACOES.map(s => s.nome as string), ...Array.from(new Set(qUnits.map(u => u.situacao))).filter(s => !SITUACOES.some(x => x.nome === s)).sort()];
        const qContagem = qSitOrdem.map(nome => ({ nome, n: qUnits.filter(u => u.situacao === nome).length })).filter(x => x.n > 0);
        const qSitOptions = Array.from(new Set(allUnits.map(u => u.situacao))).sort((a, b) => qSitOrdem.indexOf(a) - qSitOrdem.indexOf(b));
        const qVendidas = qUnits.filter(u => ehVendida(u.situacao)).length;

        // Filter by situação if active
        const qVisible = selectedSituacoes.size === 0 ? qUnits : qUnits.filter(u => selectedSituacoes.has(u.situacao));

        // Cores por situação (classes literais aqui: src/lib não entra no content do Tailwind)
        const ESTILO: Record<string, { cell: string; card: string; dot: string; text: string; bar: string; num: string }> = {
          "Vendido": { cell: "bg-red-100 border-red-300 text-red-800 hover:bg-red-200", card: "bg-red-50/70 border-red-200 border-l-[4px] border-l-red-500 hover:bg-red-100/80 hover:border-red-300 hover:shadow-md", dot: "bg-red-500", text: "text-red-700", bar: "bg-red-400", num: "text-red-600 dark:text-red-300/80" },
          "Disponível": { cell: "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200", card: "bg-emerald-50/70 border-emerald-200 border-l-[4px] border-l-emerald-500 hover:bg-emerald-100/80 hover:border-emerald-300 hover:shadow-md", dot: "bg-emerald-500", text: "text-emerald-700", bar: "bg-emerald-400", num: "text-emerald-600" },
          "Permutante": { cell: "bg-violet-100 border-violet-300 text-violet-800 hover:bg-violet-200", card: "bg-violet-50/70 border-violet-200 border-l-[4px] border-l-violet-500 hover:bg-violet-100/80 hover:border-violet-300 hover:shadow-md", dot: "bg-violet-500", text: "text-violet-700", bar: "bg-violet-400", num: "text-violet-600" },
          "Reservado": { cell: "bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200", card: "bg-yellow-50/70 border-yellow-200 border-l-[4px] border-l-yellow-500 hover:bg-yellow-100/80 hover:border-yellow-300 hover:shadow-md", dot: "bg-yellow-500", text: "text-yellow-700", bar: "bg-yellow-400", num: "text-yellow-600" },
          "Proposta": { cell: "bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300", card: "bg-slate-50/70 border-slate-200 border-l-[4px] border-l-slate-400 hover:bg-slate-100/80 hover:border-slate-300 hover:shadow-md", dot: "bg-slate-400", text: "text-slate-600", bar: "bg-slate-400", num: "text-slate-600" },
          "Vendido/Terceiros": { cell: "bg-pink-100 border-pink-300 text-pink-800 hover:bg-pink-200", card: "bg-pink-50/70 border-pink-200 border-l-[4px] border-l-pink-500 hover:bg-pink-100/80 hover:border-pink-300 hover:shadow-md", dot: "bg-pink-500", text: "text-pink-700", bar: "bg-pink-400", num: "text-pink-600" },
        };
        const OUTRO = { cell: "bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200", card: "bg-amber-50/70 border-amber-200 border-l-[4px] border-l-amber-500 hover:bg-amber-100/80 hover:border-amber-300 hover:shadow-md", dot: "bg-amber-500", text: "text-amber-700", bar: "bg-amber-400", num: "text-amber-600" };
        const estilo = (sit: string) => ESTILO[sit] || OUTRO;
        // Com Valores desligado, nenhum R$ aparece no Quadro (tela mostrada a cliente).
        const temDono = (sit: string) => ehVendida(sit) || sit === "Vendido/Terceiros";
        const dica = (u: (typeof qUnits)[number]) => [
          `${u.unit} — ${u.situacao}`,
          temDono(u.situacao) && u.customer && u.customer !== "—" ? `Cliente: ${u.customer}` : "",
          mostrarValores && temDono(u.situacao) && u.value ? `Valor: ${formatCurrency(u.value)}` : "",
          mostrarValores && precoTabela(u) ? `Preço de tabela: ${formatCurrency(precoTabela(u))}` : "",
          u.area ? `Área: ${u.area} m²` : "",
        ].filter(Boolean).join("\n");

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
              label="Situação"
              icon={<CheckCircle className="h-3.5 w-3.5" />}
              allOptions={qSitOptions}
              selected={selectedSituacoes}
              onToggle={v => setSelectedSituacoes(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; })}
              onSelectAll={() => setSelectedSituacoes(new Set(qSitOptions))}
              onClear={() => setSelectedSituacoes(new Set())}
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
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-bold text-slate-700">{qUnits.length} unidades</span>
                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      {qContagem.map(c => (
                        <button
                          key={c.nome}
                          type="button"
                          onClick={() => setSelectedSituacoes(prev => { const n = new Set(prev); if (n.has(c.nome)) n.delete(c.nome); else n.add(c.nome); return n; })}
                          className={`flex items-center gap-1.5 rounded px-1 -mx-1 transition-opacity ${selectedSituacoes.size > 0 && !selectedSituacoes.has(c.nome) ? "opacity-40" : ""}`}
                          title={`Mostrar só ${c.nome}`}
                        >
                          <span className={`w-3 h-3 rounded-sm ${estilo(c.nome).bar}`} />
                          <span className="text-slate-500">{c.nome}: <strong className={estilo(c.nome).num}>{c.n}</strong></span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    {qUnits.length > 0 ? ((qVendidas / qUnits.length) * 100).toFixed(0) : 0}% vendido
                  </span>
                </div>
                <div className="w-full h-4 flex gap-[2px]">
                  {qContagem.map(c => (
                    <div key={c.nome} className={`h-full ${estilo(c.nome).bar} transition-all rounded-full shadow-inner`} style={{ width: `${(c.n / qUnits.length) * 100}%` }} title={`${c.nome}: ${c.n}`} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Valores + visualização: Espelho (torre) x Grade */}
          {selectedUnitEnterprises.size > 0 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setMostrarValores(!mostrarValores)}
                aria-pressed={mostrarValores}
                title={mostrarValores ? "Esconder os valores (R$) do Quadro" : "Mostrar os valores (R$) no Quadro"}
                className={`inline-flex items-center gap-1.5 px-3 h-7 text-xs font-bold rounded-lg border ${mostrarValores ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200/50 bg-slate-100/80 text-slate-500 hover:text-slate-700"}`}
              >
                {mostrarValores ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Valores
              </button>
              <div className="inline-flex items-center p-0.5 bg-slate-100/80 rounded-lg border border-slate-200/50 shadow-inner">
                <button
                  onClick={() => setQuadroView("espelho")}
                  className={`px-3 h-7 text-xs font-bold rounded-md transition-all ${quadroView === "espelho" ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Espelho (Torre)
                </button>
                <button
                  onClick={() => setQuadroView("3d")}
                  className={`px-3 h-7 text-xs font-bold rounded-md transition-all ml-0.5 ${quadroView === "3d" ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
                >
                  3D
                </button>
                <button
                  onClick={() => setQuadroView("grade")}
                  className={`px-3 h-7 text-xs font-bold rounded-md transition-all ml-0.5 ${quadroView === "grade" ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Grade
                </button>
              </div>
            </div>
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
          ) : quadroView === "3d" ? (() => {
            // ── Maquete 3D: um empreendimento por vez, só apartamentos (vagas e salas ficam na Torre) ──
            const ents = Array.from(new Set(qUnits.map(u => u.enterprise))).sort();
            const ent = ents.includes(emp3d) ? emp3d : (ents.find(e => /PALACIO ELIZABETH/i.test(e.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) || ents[0] || "");
            const visiveis = new Set(qVisible.map(u => `${u.enterprise}||${u.unit}`));
            const unidades3d = qUnits
              .filter(u => u.enterprise === ent && u.tipo === "Apartamento")
              .flatMap(u => {
                const pos = andarEFinal(u.unit, normalizeFloor(u.floor));
                if (!pos) return [];
                return [{ id: `${u.enterprise}||${u.unit}`, unit: u.unit, andar: pos.andar, final: pos.final, situacao: u.situacao, area: u.area, cliente: u.customer, valor: u.value, preco: precoTabela(u), apagada: !visiveis.has(`${u.enterprise}||${u.unit}`) }];
              });
            return (
              <Card className="border-0 shadow-sm mt-3">
                <CardContent className="p-4 space-y-3">
                  {ents.length > 1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500 font-semibold">Maquete de</span>
                      <select value={ent} onChange={e => setEmp3d(e.target.value)} className="h-7 rounded-md border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 px-2 text-xs">
                        {ents.map(e => <option key={e} value={e}>{shortEnterpriseName(e)}</option>)}
                      </select>
                    </div>
                  )}
                  <Torre3D unidades={unidades3d} empreendimento={shortEnterpriseName(ent)} mostrarValores={mostrarValores} temContrato={id => contratoPorUnidade.has(id)} onAbrirContrato={setFichaKey} />
                </CardContent>
              </Card>
            );
          })() : quadroView === "espelho" ? (() => {
            // ── Espelho (torre): um bloco por empreendimento, unidades agrupadas por pavimento ──
            const shortLabel = (name: string) => { const p = name.split(".").pop() || name; return p.length > 10 ? p.slice(-9) : p; };
            const entNames = Array.from(new Set(qVisible.map(u => u.enterprise))).sort();
            return (
              <div className="mt-3 space-y-3">
                {/* Legenda (vale para todos os empreendimentos) */}
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      {SITUACOES.map(s => (
                        <span key={s.nome} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm border ${estilo(s.nome).cell}`} /><span className="text-slate-500">{s.nome}</span></span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                {entNames.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6">
                      <p className="text-sm text-slate-400 text-center">Nenhuma unidade para os filtros atuais</p>
                    </CardContent>
                  </Card>
                ) : entNames.map(ent => {
                  const entUnits = qUnits.filter(u => u.enterprise === ent);
                  const entVisible = qVisible.filter(u => u.enterprise === ent);
                  const numFloors = new Set(entUnits.map(u => normalizeFloor(u.floor)).filter(Boolean)).size;
                  const areaTotal = entUnits.reduce((s, u) => s + (u.area || 0), 0);
                  const vgvVendido = entUnits.filter(u => ehVendida(u.situacao)).reduce((s, u) => s + (u.value || 0), 0);
                  const entVend = entUnits.filter(u => ehVendida(u.situacao)).length;
                  const entPerm = entUnits.filter(u => u.situacao === "Permutante").length;
                  const entDisp = entUnits.filter(u => u.situacao === "Disponível").length;
                  const pctVend = entUnits.length > 0 ? (entVend / entUnits.length) * 100 : 0;
                  const fmap = new Map<string, typeof entVisible>();
                  entVisible.forEach(u => { const f = normalizeFloor(u.floor) || "—"; if (!fmap.has(f)) fmap.set(f, []); fmap.get(f)!.push(u); });
                  const floorGroups = Array.from(fmap.entries())
                    .sort((a, b) => floorSortKey(b[0]) - floorSortKey(a[0]) || b[0].localeCompare(a[0], undefined, { numeric: true }))
                    .map(([floor, units]) => ({ floor, units: [...units].sort((x, y) => x.unit.localeCompare(y.unit, undefined, { numeric: true })) }));
                  return (
                    <Card key={ent} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        {/* Cabeçalho do empreendimento */}
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200/60 dark:border-slate-700/60">
                          <div className="min-w-0">
                            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 truncate" title={ent}>{shortEnterpriseName(ent)}</h3>
                            <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                              {numFloors} pavimento(s) · {entUnits.length} unidade(s) · {areaTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m² priv.
                            </p>
                          </div>
                          <div className="flex items-center gap-5 text-center">
                            <div><p className="text-xl font-black text-emerald-600 tabular-nums leading-none">{entDisp}</p><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1">Disponíveis</p></div>
                            <div><p className="text-xl font-black text-red-500 dark:text-red-300/80 tabular-nums leading-none">{entVend}</p><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1">Vendidas</p></div>
                            {entPerm > 0 && <div><p className="text-xl font-black text-violet-600 tabular-nums leading-none">{entPerm}</p><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1">Permutantes</p></div>}
                            <div><p className="text-xl font-black text-slate-700 dark:text-slate-200 tabular-nums leading-none">{pctVend.toFixed(0)}%</p><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1">Vendido</p></div>
                            {mostrarValores && <div><p className="text-xl font-black text-blue-600 tabular-nums leading-none">{formatCompactCurrency(vgvVendido)}</p><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1">VGV Vendido</p></div>}
                          </div>
                        </div>
                        {/* Torre por pavimento */}
                        {floorGroups.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-6">Nenhuma unidade para os filtros atuais</p>
                        ) : (
                          <div className="space-y-1.5 mt-3">
                            {floorGroups.map(g => (
                              <div key={g.floor} className="flex items-start gap-2">
                                <div className="w-16 flex-shrink-0 flex items-center justify-end pr-2 pt-1.5 border-r border-slate-100 dark:border-slate-800 self-stretch">
                                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">{g.floor}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {g.units.map((u, i) => (
                                    <div
                                      key={`${u.unit}-${i}`}
                                      title={dica(u)}
                                      onClick={() => abrirFicha(u)}
                                      className={`min-w-[60px] rounded-md border px-2 py-1.5 text-center transition-colors ${contratoPorUnidade.has(`${u.enterprise}||${u.unit}`) ? "cursor-pointer hover:ring-2 hover:ring-slate-400/60" : "cursor-default"} ${estilo(u.situacao).cell}`}
                                    >
                                      <span className="block text-xs font-bold leading-none truncate max-w-[88px]">{shortLabel(u.unit)}</span>
                                      <span className="block text-[8px] font-semibold uppercase tracking-wide mt-1 opacity-75">
                                        {u.situacao === "Disponível" ? "Livre" : u.situacao}
                                      </span>
                                      {(() => {
                                        const v = precoTabela(u) || (u.situacao !== "Disponível" ? u.value : 0);
                                        return mostrarValores && v > 0 ? <span className="block text-[9px] font-semibold tabular-nums mt-0.5 opacity-80">{formatCompactCurrency(v)}</span> : null;
                                      })()}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })() : (
            <div className="mt-4 space-y-6">
              {Array.from(new Set(qVisible.map(u => u.enterprise))).sort().map(ent => (
                <div key={ent}>
                  <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-200 mb-2">
                    {shortEnterpriseName(ent)} <span className="text-[11px] font-semibold text-slate-400">({qVisible.filter(u => u.enterprise === ent).length} un.)</span>
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {qVisible.filter(u => u.enterprise === ent).map((u, idx) => (
                <div
                  key={`${u.unit}-${idx}`}
                  onClick={() => abrirFicha(u)}
                  className={`relative rounded-xl border p-3 cursor-pointer transition-all duration-300 hover:-translate-y-1 group ${estilo(u.situacao).card}`}
                  title={dica(u)}
                >
                  <div className="flex justify-between items-start">
                    <p className="text-lg font-extrabold text-slate-800 leading-none">{u.unit}</p>
                    <div className={`w-2 h-2 rounded-full ${estilo(u.situacao).dot}`} />
                  </div>
                  <p className={`text-[10px] font-bold mt-2 uppercase tracking-wide ${estilo(u.situacao).text}`}>{u.situacao}</p>
                  {u.tipo !== "Apartamento" && (
                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">{u.tipo}</p>
                  )}
                  {/* Hover overlay with details */}
                  {ehVendida(u.situacao) && (
                    <div className="absolute z-10 -inset-x-2 -inset-y-3 bg-white/95 backdrop-blur-md rounded-xl p-4 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-100 flex flex-col justify-center scale-95 group-hover:scale-100 origin-center">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-base font-black text-slate-800">{u.unit}</p>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 uppercase font-bold tracking-wider rounded-md ${u.situacao === "Permutante" ? "bg-violet-50 text-violet-600 border-violet-200" : "bg-red-50 text-red-600 border-red-200"}`}>{u.situacao}</Badge>
                      </div>
                      <div className="mb-2">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Cliente</span>
                        <p className="text-[11px] text-slate-700 font-semibold leading-tight line-clamp-2" title={u.customer}>{u.customer || "Não informado"}</p>
                      </div>
                      {mostrarValores && <p className="text-[13px] font-black text-slate-800 tabular-nums bg-slate-50 px-2 py-1 rounded inline-block w-max">{formatCurrency(u.value)}</p>}
                      <p className="text-[10px] text-slate-400 mt-1 font-medium">{formatDate(u.contractDate)}</p>
                    </div>
                  )}
                </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>;
      })()}      </div>
      {(() => {
        const c = fichaKey ? contratoPorUnidade.get(fichaKey) : undefined;
        const un = fichaKey ? allUnits.find(x => `${x.enterprise}||${x.unit}` === fichaKey) : undefined;
        const [entF, unitF] = (fichaKey || "||").split("||");
        const porNome = new Map(allUnits.filter(x => x.enterprise === entF).map(x => [x.unit, { tipo: x.tipo, area: x.area }]));
        return (
          <FichaContrato
            unidade={fichaKey ? { enterprise: entF, unit: unitF, tipo: un?.tipo || "", area: un?.area || 0, floor: un?.floor || "", situacao: un?.situacao || "" } : null}
            contrato={c} unidadesPorNome={porNome} mostrarValores={mostrarValores} onClose={() => setFichaKey(null)} />
        );
      })()}
    </div>
  );
}
