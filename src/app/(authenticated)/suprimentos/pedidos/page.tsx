"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  Loader2,
  Truck,
  PackageCheck,
  Building2,
  Filter,
  CalendarDays,
} from "lucide-react";
import { SiengePurchaseOrder, SiengePurchaseOrderItem, SiengeDeliverySchedule, SiengeDeliveryAttended } from "@/types/sienge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function getStatusBadge(status: string, authorized: boolean, disapproved: boolean) {
  if (disapproved) {
    return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="h-3 w-3" />Reprovado</Badge>;
  }
  if (authorized) {
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Autorizado</Badge>;
  }
  if (status === "PENDING") {
    return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Pendente</Badge>;
  }
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<SiengePurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [orderItems, setOrderItems] = useState<Record<number, SiengePurchaseOrderItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<number>>(new Set());
  const [deliverySchedules, setDeliverySchedules] = useState<Record<string, SiengeDeliverySchedule[]>>({});
  const [deliveriesAttended, setDeliveriesAttended] = useState<Record<number, SiengeDeliveryAttended[]>>({});
  const [orderDeliveryStatus, setOrderDeliveryStatus] = useState<Record<number, string>>({});
  const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterCostCenter, setFilterCostCenter] = useState<string>("all");
  const [filterDelivery, setFilterDelivery] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("pendente");
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth));
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: number; name: string; idCompany: number }[]>([]);
  const [supplierNames, setSupplierNames] = useState<Record<number, string>>({});
  const limit = 200;

  const getDateRange = useCallback(() => {
    const y = Number(filterYear);
    if (filterMonth === "all") {
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }
    const m = Number(filterMonth);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      startDate: `${y}-${String(m).padStart(2, "0")}-01`,
      endDate: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [filterYear, filterMonth]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { startDate, endDate } = getDateRange();
      const res = await fetch(
        `/api/sienge/purchase-orders?limit=${limit}&offset=${offset}&startDate=${startDate}&endDate=${endDate}`
      );
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setOrders(data.results || []);
      setTotalCount(data.resultSetMetadata?.count || 0);
      if (data.results?.length > 0) {
        toast.success(`${data.resultSetMetadata?.count || 0} pedidos carregados`);
      }
    } catch {
      setOrders([]);
      setError(true);
      toast.error("Erro ao carregar pedidos do Sienge");
    } finally {
      setLoading(false);
    }
  }, [offset, getDateRange]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [compRes, ccRes] = await Promise.all([
          fetch("/api/sienge/companies?limit=200&offset=0"),
          fetch("/api/sienge/cost-centers?limit=200&offset=0"),
        ]);
        if (compRes.ok) {
          const compData = await compRes.json();
          setCompanies((compData.results || []).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)));
        }
        if (ccRes.ok) {
          const ccData = await ccRes.json();
          setCostCenters((ccData.results || []).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)));
        }
      } catch {}
    };
    loadFilters();
  }, []);

  const handleRefresh = () => {
    toast.info("Atualizando pedidos...");
    setOrderDeliveryStatus({});
    setDeliveryRefreshKey((k) => k + 1);
    fetchOrders();
  };

  const toggleExpand = async (orderId: number) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      return;
    }
    setExpandedOrder(orderId);
    if (!orderItems[orderId]) {
      setLoadingItems((prev) => new Set(prev).add(orderId));
      try {
        const res = await fetch(`/api/sienge/purchase-orders/${orderId}/items`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        const items: SiengePurchaseOrderItem[] = data.results || [];
        setOrderItems((prev) => ({ ...prev, [orderId]: items }));

        const deliveryPromises = items.map(async (item) => {
          const key = `${orderId}-${item.itemNumber}`;
          try {
            const dRes = await fetch(`/api/sienge/purchase-orders/${orderId}/items/${item.itemNumber}/delivery-schedules`);
            if (!dRes.ok) return { key, schedules: [] };
            const dData = await dRes.json();
            return { key, schedules: dData.results || [] };
          } catch {
            return { key, schedules: [] };
          }
        });
        const deliveryResults = await Promise.all(deliveryPromises);
        setDeliverySchedules((prev) => {
          const next = { ...prev };
          deliveryResults.forEach(({ key, schedules }) => { next[key] = schedules; });
          return next;
        });
      } catch {
        toast.error(`Erro ao carregar itens do pedido ${orderId}`);
        setOrderItems((prev) => ({ ...prev, [orderId]: [] }));
      } finally {
        setLoadingItems((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    }
    if (!deliveriesAttended[orderId]) {
      try {
        const daRes = await fetch(`/api/sienge/purchase-invoices/deliveries-attended?purchaseOrderId=${orderId}`);
        if (daRes.ok) {
          const daData = await daRes.json();
          setDeliveriesAttended((prev) => ({ ...prev, [orderId]: daData.results || [] }));
        }
      } catch {}
    }
  };

  const filtered = orders.filter((o) => {
    const matchesSearch =
      !search ||
      o.formattedPurchaseOrderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.buyerId?.toLowerCase().includes(search.toLowerCase()) ||
      String(o.supplierId).includes(search) ||
      String(o.id).includes(search) ||
      o.notes?.toLowerCase().includes(search.toLowerCase()) ||
      o.internalNotes?.toLowerCase().includes(search.toLowerCase());
    const matchesCompany = filterCompany === "all" || costCenters.filter(cc => cc.idCompany === Number(filterCompany)).some(cc => cc.id === o.costCenterId);
    const matchesCostCenter = filterCostCenter === "all" || o.costCenterId === Number(filterCostCenter);
    const ds = orderDeliveryStatus[o.id];
    const matchesDelivery = filterDelivery === "all" || ds === filterDelivery || (filterDelivery !== "all" && ds === "error");
    let matchesStatus = true;
    if (filterStatus === "autorizado") matchesStatus = o.authorized === true;
    else if (filterStatus === "pendente") matchesStatus = !o.authorized && !o.disapproved;
    else if (filterStatus === "reprovado") matchesStatus = o.disapproved === true;
    return matchesSearch && matchesCompany && matchesCostCenter && matchesDelivery && matchesStatus;
  });

  const pageSize = 20;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, filterCompany, filterCostCenter, filterDelivery, filterStatus]);

  const paginatedItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const paginatedIds = paginatedItems.map((o) => o.id).join(",");
  useEffect(() => {
    if (!paginatedIds) return;
    const ids = paginatedIds.split(",").map(Number);
    const idsToFetch = ids.filter((id) => !(id in orderDeliveryStatus));
    if (idsToFetch.length === 0) return;

    let cancelled = false;
    const fetchSequential = async () => {
      for (let i = 0; i < idsToFetch.length; i++) {
        if (cancelled) break;
        const id = idsToFetch[i];
        try {
          const res = await fetch(`/api/sienge/purchase-orders/${id}/delivery-status`);
          if (!res.ok) {
            setOrderDeliveryStatus((prev) => ({ ...prev, [id]: "error" }));
          } else {
            const data = await res.json();
            setOrderDeliveryStatus((prev) => ({ ...prev, [id]: data.status }));
          }
        } catch {
          setOrderDeliveryStatus((prev) => ({ ...prev, [id]: "error" }));
        }
        if (i < idsToFetch.length - 1 && !cancelled) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    };
    fetchSequential();
    return () => { cancelled = true; };
  }, [paginatedIds, deliveryRefreshKey]);

  useEffect(() => {
    if (orders.length === 0) return;
    const uniqueIds = [...new Set(orders.map((o) => o.supplierId))].filter((id) => !(id in supplierNames));
    if (uniqueIds.length === 0) return;
    const fetchNames = async () => {
      const batchSize = 50;
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        try {
          const res = await fetch(`/api/sienge/creditors?ids=${batch.join(",")}`);
          if (res.ok) {
            const data = await res.json();
            setSupplierNames((prev) => ({ ...prev, ...data }));
          }
        } catch {}
      }
    };
    fetchNames();
  }, [orders]);

  const costCenterMap = React.useMemo(() => {
    const map: Record<number, string> = {};
    costCenters.forEach((cc) => { map[cc.id] = cc.name; });
    return map;
  }, [costCenters]);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Pedidos de Compra - Silva Packer", 14, 16);
    doc.setFontSize(10);
    doc.text(`Periodo: ${filterYear}${filterMonth !== "all" ? "/" + String(filterMonth).padStart(2, "0") : ""}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Pedido", "Data", "Comprador", "Fornecedor", "Centro Custo", "Status", "Valor Total"]],
      body: filtered.map((o) => [
        o.formattedPurchaseOrderId,
        formatDate(o.date),
        o.buyerId || "-",
        o.supplierId,
        o.costCenterId,
        o.authorized ? "Autorizado" : o.disapproved ? "Reprovado" : "Pendente",
        formatCurrency(o.totalAmount),
      ]),
      styles: { fontSize: 8 },
    });
    doc.save(`pedidos-compra-${filterYear}${filterMonth !== "all" ? "-" + String(filterMonth).padStart(2, "0") : ""}.pdf`);
    toast.success("PDF exportado com sucesso!");
  };

  const totalAmount = filtered.reduce((sum, o) => sum + o.totalAmount, 0);
  const authorizedCount = filtered.filter((o) => o.authorized).length;
  const pendingCount = filtered.filter((o) => !o.authorized && !o.disapproved).length;

  const apiTotalPages = Math.ceil(totalCount / limit);
  const apiCurrentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pedidos de Compra</h1>
          <p className="text-slate-500 mt-1">
            Pedidos de compra registrados no Sienge — {filterYear}{filterMonth !== "all" ? `/${String(filterMonth).padStart(2, "0")}` : ""}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {totalCount} registros
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase font-medium">Valor Total</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase font-medium">Autorizados</p>
            <p className="text-xl font-bold text-green-600 mt-1">{authorizedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase font-medium">Pendentes</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por pedido, comprador, fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setOffset(0); }}>
              <SelectTrigger className="w-[110px]">
                <CalendarDays className="h-4 w-4 mr-1 text-slate-400" />
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: currentYear - 2025 + 1 }, (_, i) => currentYear - i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setOffset(0); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Meses</SelectItem>
                {["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <CheckCircle2 className="h-4 w-4 mr-1 text-slate-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="autorizado">Autorizado</SelectItem>
                <SelectItem value="reprovado">Reprovado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-[220px]">
                <Building2 className="h-4 w-4 mr-1 text-slate-400" />
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCostCenter} onValueChange={setFilterCostCenter}>
              <SelectTrigger className="w-[240px]">
                <Filter className="h-4 w-4 mr-1 text-slate-400" />
                <SelectValue placeholder="Centro de Custo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Centros de Custo</SelectItem>
                {costCenters.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDelivery} onValueChange={setFilterDelivery}>
              <SelectTrigger className="w-[170px]">
                <Truck className="h-4 w-4 mr-1 text-slate-400" />
                <SelectValue placeholder="Entrega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Entregas</SelectItem>
                <SelectItem value="complete">Entregue</SelectItem>
                <SelectItem value="partial">Parcial</SelectItem>
                <SelectItem value="pending">Aguardando</SelectItem>
                <SelectItem value="none">Sem previsao</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF}>
                <FileDown className="h-4 w-4 mr-1" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {error && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-1">Erro ao carregar dados</h3>
              <p className="text-slate-500 mb-4 text-center">Nao foi possivel conectar ao Sienge. Verifique sua conexao.</p>
              <Button variant="outline" onClick={fetchOrders}>Tentar novamente</Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100/80">
                    <TableRow>
                      <TableHead className="w-20">Pedido</TableHead>
                      <TableHead className="w-24">Data</TableHead>
                      <TableHead>Comprador</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-28">Entrega</TableHead>
                      <TableHead className="text-right w-32">Valor Total</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      : paginatedItems.map((order) => (
                          <React.Fragment key={order.id}>
                            <TableRow
                              className={`hover:bg-slate-50 cursor-pointer ${expandedOrder === order.id ? "bg-blue-50/50" : ""}`}
                              onClick={() => toggleExpand(order.id)}
                            >
                              <TableCell className="font-mono text-sm font-medium">
                                {order.formattedPurchaseOrderId}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(order.date)}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {order.buyerId || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                <span className="font-mono text-xs text-slate-400">{order.supplierId}</span>{" "}
                                <span className="truncate">{supplierNames[order.supplierId] || ""}</span>
                              </TableCell>
                              <TableCell className="text-sm">
                                <span className="font-mono text-xs text-slate-400">{order.costCenterId}</span>{" "}
                                <span className="truncate">{costCenterMap[order.costCenterId] || ""}</span>
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(order.status, order.authorized, order.disapproved)}
                              </TableCell>
                              <TableCell>
                                {!(order.id in orderDeliveryStatus) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                ) : orderDeliveryStatus[order.id] === "complete" ? (
                                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs gap-1"><PackageCheck className="h-3 w-3" />Entregue</Badge>
                                ) : orderDeliveryStatus[order.id] === "partial" ? (
                                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs gap-1"><Truck className="h-3 w-3" />Parcial</Badge>
                                ) : orderDeliveryStatus[order.id] === "pending" ? (
                                  <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Aguardando</Badge>
                                ) : orderDeliveryStatus[order.id] === "none" ? (
                                  <span className="text-slate-400 text-xs">-</span>
                                ) : (
                                  <span className="text-slate-400 text-xs">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-medium">
                                {formatCurrency(order.totalAmount)}
                              </TableCell>
                              <TableCell>
                                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedOrder === order.id ? "rotate-180" : ""}`} />
                              </TableCell>
                            </TableRow>
                            {expandedOrder === order.id && (
                              <TableRow className="bg-blue-50/30">
                                <TableCell colSpan={9} className="p-0">
                                  <div className="px-8 py-4 border-l-4 border-blue-400 ml-4 space-y-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                      <div>
                                        <span className="font-semibold text-slate-600">Empresa: </span>
                                        <span className="text-slate-700">{order.companyBillId}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Obra: </span>
                                        <span className="text-slate-700">{order.buildingId}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Doc Previsao: </span>
                                        <span className="text-slate-700">{order.forecastDocumentId || "-"}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Desconto: </span>
                                        <span className="text-slate-700">{formatCurrency(order.discount)}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Acrescimo: </span>
                                        <span className="text-slate-700">{formatCurrency(order.increase)}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Frete Total: </span>
                                        <span className="text-slate-700">{formatCurrency(order.totalFreight)}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Tipo Frete: </span>
                                        <span className="text-slate-700">{order.freightType || "-"}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Cond. Pagamento: </span>
                                        <span className="text-slate-700">{order.paymentCondition || "-"}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-600">Criado por: </span>
                                        <span className="text-slate-700">{order.createdBy}</span>
                                      </div>
                                      {order.authorizedAt && (
                                        <div>
                                          <span className="font-semibold text-slate-600">Autorizado em: </span>
                                          <span className="text-slate-700">{new Date(order.authorizedAt).toLocaleString("pt-BR")}</span>
                                        </div>
                                      )}
                                    </div>
                                    {order.notes && (
                                      <div className="text-sm mt-2">
                                        <span className="font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Observacoes:</span>
                                        <span className="ml-2 text-slate-600">{order.notes}</span>
                                      </div>
                                    )}
                                    {order.internalNotes && (
                                      <div className="text-sm">
                                        <span className="font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Notas Internas:</span>
                                        <span className="ml-2 text-slate-600">{order.internalNotes}</span>
                                      </div>
                                    )}

                                    <div className="mt-3">
                                      <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-2">
                                        Itens do Pedido
                                        {orderItems[order.id] && (
                                          <Badge variant="secondary" className="text-xs">{orderItems[order.id].length} {orderItems[order.id].length === 1 ? "item" : "itens"}</Badge>
                                        )}
                                      </div>
                                      {loadingItems.has(order.id) ? (
                                        <div className="space-y-2">
                                          <Skeleton className="h-4 w-full" />
                                          <Skeleton className="h-4 w-3/4" />
                                          <Skeleton className="h-4 w-1/2" />
                                        </div>
                                      ) : orderItems[order.id] && orderItems[order.id].length > 0 ? (
                                        <div className="overflow-x-auto">
                                          <Table className="text-xs">
                                            <TableHeader>
                                              <TableRow className="bg-slate-100/50">
                                                <TableHead className="text-xs py-1.5 w-12">#</TableHead>
                                                <TableHead className="text-xs py-1.5 w-24">Codigo</TableHead>
                                                <TableHead className="text-xs py-1.5">Descricao</TableHead>
                                                <TableHead className="text-xs py-1.5 w-16">Unid</TableHead>
                                                <TableHead className="text-xs py-1.5 text-right w-20">Qtde</TableHead>
                                                <TableHead className="text-xs py-1.5 text-right w-28">Preco Unit.</TableHead>
                                                <TableHead className="text-xs py-1.5 text-right w-28">Valor Liq.</TableHead>
                                                <TableHead className="text-xs py-1.5 text-center w-24">Previsao</TableHead>
                                                <TableHead className="text-xs py-1.5 text-center w-24">Dt. Entrega</TableHead>
                                                <TableHead className="text-xs py-1.5 text-right w-20">Entregue</TableHead>
                                                <TableHead className="text-xs py-1.5 text-right w-20">Pendente</TableHead>
                                                <TableHead className="text-xs py-1.5 text-center w-28">Situacao</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {orderItems[order.id].map((item) => {
                                                const dsKey = `${order.id}-${item.itemNumber}`;
                                                const schedules = deliverySchedules[dsKey];
                                                const totalScheduled = schedules?.reduce((s, d) => s + d.sheduledQuantity, 0) ?? 0;
                                                const totalDelivered = schedules?.reduce((s, d) => s + d.deliveredQuantity, 0) ?? 0;
                                                const totalOpen = schedules?.reduce((s, d) => s + d.openQuantity, 0) ?? 0;
                                                const nextDate = schedules?.filter(d => d.openQuantity > 0).sort((a, b) => a.sheduledDate.localeCompare(b.sheduledDate))[0]?.sheduledDate;

                                                const itemDeliveries = (deliveriesAttended[order.id] || [])
                                                  .filter((da) => da.purchaseOrderItemNumber === item.itemNumber)
                                                  .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
                                                const lastDeliveryDate = itemDeliveries[0]?.deliveryDate;

                                                let deliveryStatus: "loading" | "complete" | "partial" | "pending" | "none" = "none";
                                                if (!schedules) deliveryStatus = "loading";
                                                else if (schedules.length === 0) deliveryStatus = "none";
                                                else if (totalOpen === 0 && totalDelivered > 0) deliveryStatus = "complete";
                                                else if (totalDelivered > 0 && totalOpen > 0) deliveryStatus = "partial";
                                                else deliveryStatus = "pending";

                                                return (
                                                <TableRow key={item.itemNumber} className="hover:bg-white/50">
                                                  <TableCell className="py-1.5 font-mono">{item.itemNumber}</TableCell>
                                                  <TableCell className="py-1.5 font-mono">{item.resourceCode}</TableCell>
                                                  <TableCell className="py-1.5">{item.resourceDescription}</TableCell>
                                                  <TableCell className="py-1.5">{item.unitOfMeasure}</TableCell>
                                                  <TableCell className="py-1.5 text-right font-mono">{item.quantity.toLocaleString("pt-BR")}</TableCell>
                                                  <TableCell className="py-1.5 text-right font-mono">{formatCurrency(item.unitPrice)}</TableCell>
                                                  <TableCell className="py-1.5 text-right font-mono font-medium">{formatCurrency(item.netPrice)}</TableCell>
                                                  <TableCell className="py-1.5 text-center font-mono">
                                                    {deliveryStatus === "loading" ? (
                                                      <Loader2 className="h-3 w-3 animate-spin text-slate-400 mx-auto" />
                                                    ) : nextDate ? formatDate(nextDate) : "-"}
                                                  </TableCell>
                                                  <TableCell className="py-1.5 text-center font-mono">
                                                    {lastDeliveryDate ? formatDate(lastDeliveryDate) : "-"}
                                                  </TableCell>
                                                  <TableCell className="py-1.5 text-right font-mono">
                                                    {deliveryStatus === "loading" ? "-" : totalDelivered.toLocaleString("pt-BR")}
                                                  </TableCell>
                                                  <TableCell className="py-1.5 text-right font-mono">
                                                    {deliveryStatus === "loading" ? "-" : totalOpen.toLocaleString("pt-BR")}
                                                  </TableCell>
                                                  <TableCell className="py-1.5 text-center">
                                                    {deliveryStatus === "loading" ? (
                                                      <Loader2 className="h-3 w-3 animate-spin text-slate-400 mx-auto" />
                                                    ) : deliveryStatus === "complete" ? (
                                                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px] gap-0.5"><PackageCheck className="h-3 w-3" />Entregue</Badge>
                                                    ) : deliveryStatus === "partial" ? (
                                                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] gap-0.5"><Truck className="h-3 w-3" />Parcial</Badge>
                                                    ) : deliveryStatus === "pending" ? (
                                                      <Badge variant="secondary" className="text-[10px] gap-0.5"><Clock className="h-3 w-3" />Aguardando</Badge>
                                                    ) : (
                                                      <span className="text-slate-400">-</span>
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      ) : orderItems[order.id] ? (
                                        <div className="text-xs text-slate-400">Nenhum item encontrado para este pedido.</div>
                                      ) : null}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                    {!loading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                          Nenhum pedido encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <p className="text-sm text-slate-500">
                    Pagina {page} de {totalPages} ({filtered.length} itens)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Proximo
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {apiTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 px-6 py-3 border-t bg-slate-50/50">
                  <p className="text-xs text-slate-400">
                    Lote {apiCurrentPage} de {apiTotalPages} do Sienge
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      disabled={offset === 0}
                      onClick={() => { setOffset(Math.max(0, offset - limit)); setPage(1); }}
                    >
                      Lote anterior
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      disabled={offset + limit >= totalCount}
                      onClick={() => { setOffset(offset + limit); setPage(1); }}
                    >
                      Proximo lote
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
