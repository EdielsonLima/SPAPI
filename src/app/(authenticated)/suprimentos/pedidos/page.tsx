"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Ban,
  Loader2,
  Truck,
  PackageCheck,
  Building2,
  Filter,
  CalendarDays,
  Package,
} from "lucide-react";
import { SiengePurchaseOrder, SiengePurchaseOrderItem, SiengeDeliverySchedule, SiengeDeliveryAttended } from "@/types/sienge";
import type { ArrivalConfirmation } from "@/lib/db";
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

function isCancelledOrder(status: string) {
  return status === "CANCELED" || status === "CANCELLED";
}

function getStatusBadge(authorized: boolean, disapproved: boolean) {
  if (disapproved) {
    return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="h-3 w-3" />Reprovado</Badge>;
  }
  if (authorized) {
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Autorizado</Badge>;
  }
  return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Pendente</Badge>;
}

function getSituacaoBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="text-xs gap-1 text-slate-500"><Clock className="h-3 w-3" />Pendente</Badge>;
    case "PARTIALLY_DELIVERED":
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs gap-1"><Truck className="h-3 w-3" />Parcial</Badge>;
    case "FULLY_DELIVERED":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs gap-1"><PackageCheck className="h-3 w-3" />Atendido</Badge>;
    case "CANCELED":
      return <Badge className="bg-red-100 text-red-600 hover:bg-red-100 text-xs gap-1"><Ban className="h-3 w-3" />Cancelado</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
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
  const orderDeliveryStatusRef = useRef(orderDeliveryStatus);
  orderDeliveryStatusRef.current = orderDeliveryStatus;
  const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterCostCenter, setFilterCostCenter] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string[]>(["pendente"]);
  const [filterSituacao, setFilterSituacao] = useState<string[]>(["PENDING", "PARTIALLY_DELIVERED", "FULLY_DELIVERED"]);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [filterYear, setFilterYear] = useState<string[]>([String(currentYear)]);
  const [filterMonth, setFilterMonth] = useState<string[]>([String(currentMonth)]);
  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const [itemSort, setItemSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "itemNumber", dir: "asc" });
  const toggleItemSort = (key: string) =>
    setItemSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const [mainSort, setMainSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const toggleMainSort = (key: string) =>
    setMainSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  const [authorizingOrder, setAuthorizingOrder] = useState<number | null>(null);
  const [confirmingAuthorize, setConfirmingAuthorize] = useState<number | null>(null);
  const [orderArrivalConfs, setOrderArrivalConfs] = useState<Record<number, ArrivalConfirmation[]>>({});
  const [arrivalDialog, setArrivalDialog] = useState<{ orderId: number; itemNumber: number; description: string } | null>(null);
  const [arrivalForm, setArrivalForm] = useState<{ confirmedBy: string; quantity: string; notes: string; file: File | null }>({ confirmedBy: "", quantity: "", notes: "", file: null });
  const [submittingArrival, setSubmittingArrival] = useState(false);
  const [arrivalCounts, setArrivalCounts] = useState<Record<number, number>>({});
  const [activeTab, setActiveTab] = useState<"pedidos" | "itens" | "chegada-obra">("pedidos");
  const [loadingArrivalsBatch, setLoadingArrivalsBatch] = useState(false);
  const [chegadaSearch, setChegadaSearch] = useState("");
  const [chegadaCostCenter, setChegadaCostCenter] = useState<string>("all");
  const [chegadaSituacao, setChegadaSituacao] = useState<string[]>(["PENDING", "PARTIALLY_DELIVERED", "FULLY_DELIVERED"]);
  const [chegadaHideFull, setChegadaHideFull] = useState(false);
  const [obraFilterYear, setObraFilterYear] = useState<string[]>([String(currentYear)]);
  const [obraFilterMonth, setObraFilterMonth] = useState<string[]>([]);
  const [obraFilterStatus, setObraFilterStatus] = useState<string[]>(["pendente", "autorizado", "reprovado"]);
  const [obraOrders, setObraOrders] = useState<SiengePurchaseOrder[]>([]);
  const [loadingObraOrders, setLoadingObraOrders] = useState(false);
  const [loadingAllItems, setLoadingAllItems] = useState(false);
  const [itemsLoadedCount, setItemsLoadedCount] = useState(0);
  const [itemSearch, setItemSearch] = useState("");
  const [itemTabSort, setItemTabSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [itemTabPage, setItemTabPage] = useState(1);
  const hasActiveFilters = search !== "" || filterYear.join(",") !== String(currentYear) || filterMonth.join(",") !== String(currentMonth) || (filterStatus.length !== 3 && filterStatus.join(",") !== "pendente") || filterCompany !== "all" || filterCostCenter !== "all" || filterSituacao.includes("CANCELED") || filterSituacao.length !== 3;
  const clearFilters = () => {
    setSearch(""); setFilterYear([String(currentYear)]); setFilterMonth([String(currentMonth)]);
    setFilterStatus(["pendente"]); setFilterSituacao(["PENDING", "PARTIALLY_DELIVERED", "FULLY_DELIVERED"]); setFilterCompany("all"); setFilterCostCenter("all");
    setOffset(0);
  };
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: number; name: string; idCompany: number }[]>([]);
  const [supplierNames, setSupplierNames] = useState<Record<number, string>>({});
  const supplierNamesRef = useRef(supplierNames);
  supplierNamesRef.current = supplierNames;
  const limit = 200;

  const getDateRange = useCallback(() => {
    const years = filterYear.length === 0 ? [2020, currentYear] : filterYear.map(Number);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    if (filterMonth.length === 0) {
      return { startDate: `${minYear}-01-01`, endDate: `${maxYear}-12-31` };
    }
    const months = filterMonth.map(Number);
    const minMonth = Math.min(...months);
    const maxMonth = Math.max(...months);
    const lastDay = new Date(maxYear, maxMonth, 0).getDate();
    return {
      startDate: `${minYear}-${String(minMonth).padStart(2, "0")}-01`,
      endDate: `${maxYear}-${String(maxMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [filterYear, filterMonth, currentYear]);

  const [loadingAll, setLoadingAll] = useState(false);

  const fetchOrders = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(false);
    try {
      const { startDate, endDate } = getDateRange();
      const res = await fetch(
        `/api/sienge/purchase-orders?limit=${limit}&offset=${offset}&startDate=${startDate}&endDate=${endDate}` +
        (refresh ? "&forceRefresh=true" : "")
      );
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const results = data.results || [];
      if (offset === 0) {
        setOrders(results);
      } else {
        setOrders(prev => {
          const existingIds = new Set(prev.map(o => o.id));
          return [...prev, ...results.filter((o: SiengePurchaseOrder) => !existingIds.has(o.id))];
        });
      }
      setTotalCount(data.resultSetMetadata?.count || 0);
      if (offset === 0 && results.length > 0) {
        toast.success(`${data.resultSetMetadata?.count || 0} pedidos carregados`);
      }
    } catch {
      if (offset === 0) setOrders([]);
      setError(true);
      toast.error("Erro ao carregar pedidos do Sienge");
    } finally {
      setLoading(false);
    }
  }, [offset, getDateRange]);

  const loadAllLotes = useCallback(async () => {
    if (loadingAll) return;
    setLoadingAll(true);
    const { startDate, endDate } = getDateRange();
    const totalLotes = Math.ceil(totalCount / limit);
    const startPage = Math.floor(orders.length / limit) + 1;
    for (let page = startPage + 1; page <= totalLotes; page++) {
      try {
        const res = await fetch(
          `/api/sienge/purchase-orders?limit=${limit}&offset=${(page - 1) * limit}&startDate=${startDate}&endDate=${endDate}`
        );
        if (!res.ok) break;
        const data = await res.json();
        const results = data.results || [];
        setOrders(prev => {
          const existingIds = new Set(prev.map(o => o.id));
          return [...prev, ...results.filter((o: SiengePurchaseOrder) => !existingIds.has(o.id))];
        });
      } catch { break; }
    }
    setLoadingAll(false);
    toast.success("Todos os lotes carregados");
  }, [loadingAll, getDateRange, totalCount, limit, orders.length]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fetchObraOrders = useCallback(async () => {
    if (loadingObraOrders) return;
    setLoadingObraOrders(true);
    try {
      const years = obraFilterYear.length === 0 ? [2020, currentYear] : obraFilterYear.map(Number);
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      const startDate = `${minYear}-01-01`;
      const endDate   = `${maxYear}-12-31`;
      const pageLimit = 200;
      let pageOffset  = 0;
      const collected: SiengePurchaseOrder[] = [];
      while (true) {
        const res = await fetch(
          `/api/sienge/purchase-orders?limit=${pageLimit}&offset=${pageOffset}&startDate=${startDate}&endDate=${endDate}`
        );
        if (!res.ok) break;
        const data = await res.json();
        const results: SiengePurchaseOrder[] = data.results || [];
        collected.push(...results);
        const total: number = data.resultSetMetadata?.count ?? 0;
        if (collected.length >= total || results.length === 0) break;
        pageOffset += pageLimit;
      }
      setObraOrders(collected);
    } catch {
      setObraOrders([]);
    } finally {
      setLoadingObraOrders(false);
    }
  }, [loadingObraOrders, obraFilterYear, currentYear]);

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
    fetchOrders(true);
  };

  const handleAuthorize = async (orderId: number) => {
    setConfirmingAuthorize(null);
    setAuthorizingOrder(orderId);
    try {
      const res = await fetch(`/api/sienge/purchase-orders/${orderId}/authorize`, { method: "PUT" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(`Erro ao autorizar pedido: ${(data as { error?: string }).error || res.status}`);
        return;
      }
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, authorized: true, authorizedAt: new Date().toISOString() } : o
      ));
      toast.success("Pedido autorizado com sucesso!");
    } catch {
      toast.error("Erro de conexão ao autorizar pedido.");
    } finally {
      setAuthorizingOrder(null);
    }
  };

  const handleArrivalSubmit = async () => {
    if (!arrivalDialog || !arrivalForm.file) return;
    setSubmittingArrival(true);
    try {
      const fd = new FormData();
      fd.append("orderId", String(arrivalDialog.orderId));
      fd.append("itemNumber", String(arrivalDialog.itemNumber));
      fd.append("confirmedBy", arrivalForm.confirmedBy);
      if (arrivalForm.quantity !== "") fd.append("quantity", arrivalForm.quantity);
      fd.append("notes", arrivalForm.notes);
      fd.append("file", arrivalForm.file);
      const res = await fetch("/api/arrival-confirmations", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || "Erro ao registrar chegada");
        return;
      }
      const { id } = await res.json() as { id: number };
      const newConf: ArrivalConfirmation = {
        id,
        purchaseOrderId: arrivalDialog.orderId,
        itemNumber: arrivalDialog.itemNumber,
        confirmedBy: arrivalForm.confirmedBy,
        quantity: arrivalForm.quantity !== "" ? Number(arrivalForm.quantity) : null,
        notes: arrivalForm.notes,
        fileName: arrivalForm.file.name,
        fileMimeType: arrivalForm.file.type,
        createdAt: new Date().toISOString(),
      };
      setOrderArrivalConfs(prev => ({
        ...prev,
        [arrivalDialog.orderId]: [newConf, ...(prev[arrivalDialog.orderId] || [])],
      }));
      setArrivalCounts(prev => ({
        ...prev,
        [arrivalDialog.orderId]: (prev[arrivalDialog.orderId] || 0) + 1,
      }));
      toast.success("Chegada registrada com sucesso!");
      setArrivalDialog(null);
      setArrivalForm({ confirmedBy: "", quantity: "", notes: "", file: null });

      // Send attachment to Sienge (non-blocking — local record already saved above)
      const fileToUpload = arrivalForm.file;
      const dialog = arrivalDialog;
      const qty = arrivalForm.quantity;
      const by = arrivalForm.confirmedBy;
      if (fileToUpload && dialog) {
        const siengeFd = new FormData();
        const desc = `Chegada obra · ${dialog.description}${qty ? ` · ${qty} un` : ""} · Por: ${by} · ${new Date().toLocaleDateString("pt-BR")}`.slice(0, 200);
        siengeFd.append("description", desc);
        siengeFd.append("file", fileToUpload);
        fetch(`/api/sienge/purchase-orders/${dialog.orderId}/attachments`, {
          method: "POST",
          body: siengeFd,
        }).then(async (r) => {
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            console.warn("Sienge attachment upload failed:", d);
            toast.warning("Registrado localmente. Falha ao anexar no Sienge.");
          }
        }).catch((e) => {
          console.warn("Sienge attachment upload error:", e);
          toast.warning("Registrado localmente. Falha ao anexar no Sienge.");
        });
      }
    } finally {
      setSubmittingArrival(false);
    }
  };

  const toggleExpand = async (orderId: number) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      return;
    }
    setExpandedOrder(orderId);
    setLoadingItems((prev) => new Set(prev).add(orderId));
    try {
      // Load items if not yet loaded, or use already-loaded items
      let currentItems: SiengePurchaseOrderItem[] = orderItems[orderId] || [];
      if (!orderItems[orderId]) {
        const res = await fetch(`/api/sienge/purchase-orders/${orderId}/items`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        currentItems = data.results || [];
        setOrderItems((prev) => ({ ...prev, [orderId]: currentItems }));
      }

      // Load delivery schedules for items that don't have them yet
      // (items pre-loaded by loadItemsForObraTab won't have schedules)
      const itemsNeedingSchedules = currentItems.filter(item => {
        const key = `${orderId}-${item.itemNumber}`;
        return !(key in deliverySchedules);
      });
      if (itemsNeedingSchedules.length > 0) {
        const deliveryPromises = itemsNeedingSchedules.map(async (item) => {
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
      }
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
    if (!deliveriesAttended[orderId]) {
      try {
        const daRes = await fetch(`/api/sienge/purchase-invoices/deliveries-attended?purchaseOrderId=${orderId}`);
        if (daRes.ok) {
          const daData = await daRes.json();
          setDeliveriesAttended((prev) => ({ ...prev, [orderId]: daData.results || [] }));
        }
      } catch {}
    }
    if (!orderArrivalConfs[orderId]) {
      fetch(`/api/arrival-confirmations?orderId=${orderId}`)
        .then(r => r.json())
        .then(data => setOrderArrivalConfs(prev => ({ ...prev, [orderId]: Array.isArray(data) ? data : [] })))
        .catch(() => {});
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
    let orderStatus = "pendente";
    if (o.disapproved) orderStatus = "reprovado";
    else if (o.authorized) orderStatus = "autorizado";
    const matchesStatus = filterStatus.length === 0 || filterStatus.length === 3 || filterStatus.includes(orderStatus);
    const matchesSituacao = filterSituacao.length === 0 || filterSituacao.length === 4 || filterSituacao.includes(o.status);
    const matchesYearMonth = (() => {
      if (filterYear.length === 0 && filterMonth.length === 0) return true;
      const parts = o.date?.split("-") || [];
      const oy = parts[0];
      const om = parts[1] ? String(Number(parts[1])) : undefined;
      if (!oy || !om) return true;
      const yearOk = filterYear.length === 0 || filterYear.includes(oy);
      const monthOk = filterMonth.length === 0 || filterMonth.includes(om);
      return yearOk && monthOk;
    })();
    return matchesSearch && matchesCompany && matchesCostCenter && matchesStatus && matchesYearMonth && matchesSituacao;
  });

  const pageSize = 20;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, filterCompany, filterCostCenter, filterStatus, filterSituacao, filterYear, filterMonth]);

  // Auto-load all lotes when user filters by a specific situação (counts would be inaccurate otherwise)
  useEffect(() => {
    const isNonDefault = filterSituacao.length !== 3 || filterSituacao.includes("CANCELED");
    if (isNonDefault && orders.length < totalCount && totalCount > 0 && !loadingAll && !loading) {
      loadAllLotes();
    }
  }, [filterSituacao]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadItemsForTab = useCallback(async () => {
    if (loadingAllItems) return;
    const ordersToLoad = filtered.filter(o => !orderItems[o.id]);
    if (ordersToLoad.length === 0) return;
    setLoadingAllItems(true);
    setItemsLoadedCount(0);
    for (let i = 0; i < ordersToLoad.length; i++) {
      const order = ordersToLoad[i];
      try {
        const res = await fetch(`/api/sienge/purchase-orders/${order.id}/items`);
        if (res.ok) {
          const data = await res.json();
          const items: SiengePurchaseOrderItem[] = data.results || [];
          setOrderItems(prev => ({ ...prev, [order.id]: items }));
          const schedulePromises = items.map(async (item) => {
            const key = `${order.id}-${item.itemNumber}`;
            if (deliverySchedules[key]) return;
            try {
              const dRes = await fetch(`/api/sienge/purchase-orders/${order.id}/items/${item.itemNumber}/delivery-schedules`);
              if (dRes.ok) {
                const dData = await dRes.json();
                setDeliverySchedules(prev => ({ ...prev, [key]: dData.results || [] }));
              }
            } catch {}
          });
          await Promise.all(schedulePromises);
          if (!deliveriesAttended[order.id]) {
            try {
              const daRes = await fetch(`/api/sienge/purchase-invoices/deliveries-attended?purchaseOrderId=${order.id}`);
              if (daRes.ok) {
                const daData = await daRes.json();
                setDeliveriesAttended(prev => ({ ...prev, [order.id]: daData.results || [] }));
              }
            } catch {}
          }
        }
      } catch {}
      setItemsLoadedCount(i + 1);
    }
    setLoadingAllItems(false);
  }, [loadingAllItems, filtered, orderItems, deliverySchedules, deliveriesAttended]);

  useEffect(() => {
    if (activeTab === "itens") {
      loadItemsForTab();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadArrivalsBatch = useCallback(async () => {
    if (loadingArrivalsBatch) return;
    const ordersWithoutConfs = obraOrders.filter(o => !(o.id in orderArrivalConfs));
    if (ordersWithoutConfs.length === 0) return;
    setLoadingArrivalsBatch(true);
    try {
      const ids = ordersWithoutConfs.map(o => o.id);
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const res = await fetch(`/api/arrival-confirmations/batch?orderIds=${chunk.join(",")}`);
        if (!res.ok) continue;
        const data: Record<number, ArrivalConfirmation[]> = await res.json();
        setOrderArrivalConfs(prev => ({ ...prev, ...data }));
        setArrivalCounts(prev => {
          const next = { ...prev };
          for (const [idStr, confs] of Object.entries(data)) {
            next[Number(idStr)] = confs.length;
          }
          return next;
        });
      }
    } finally {
      setLoadingArrivalsBatch(false);
    }
  }, [loadingArrivalsBatch, obraOrders, orderArrivalConfs]);

  const loadItemsForObraTab = useCallback(async () => {
    if (loadingAllItems) return;
    const ordersToLoad = obraOrders.filter(o => !isCancelledOrder(o.status) && !orderItems[o.id]);
    if (ordersToLoad.length === 0) return;
    setLoadingAllItems(true);
    setItemsLoadedCount(0);
    for (let i = 0; i < ordersToLoad.length; i++) {
      const order = ordersToLoad[i];
      try {
        const res = await fetch(`/api/sienge/purchase-orders/${order.id}/items`);
        if (res.ok) {
          const data = await res.json();
          const items: SiengePurchaseOrderItem[] = data.results || [];
          setOrderItems(prev => ({ ...prev, [order.id]: items }));
          // Load delivery schedules for each item (needed for Chegou/Saldo in cards)
          const schedulePromises = items.map(async (item) => {
            const key = `${order.id}-${item.itemNumber}`;
            if (deliverySchedules[key]) return;
            try {
              const dRes = await fetch(`/api/sienge/purchase-orders/${order.id}/items/${item.itemNumber}/delivery-schedules`);
              if (dRes.ok) {
                const dData = await dRes.json();
                setDeliverySchedules(prev => ({ ...prev, [key]: dData.results || [] }));
              }
            } catch {}
          });
          await Promise.all(schedulePromises);
        }
      } catch {}
      setItemsLoadedCount(i + 1);
    }
    setLoadingAllItems(false);
  }, [loadingAllItems, obraOrders, orderItems, deliverySchedules]);

  // Fetch obraOrders whenever tab is active and orders are empty (first open or year change)
  useEffect(() => {
    if (activeTab === "chegada-obra" && obraOrders.length === 0 && !loadingObraOrders) {
      fetchObraOrders();
    }
  }, [activeTab, obraOrders.length, loadingObraOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once obraOrders is populated, load items and arrivals
  useEffect(() => {
    if (activeTab === "chegada-obra" && obraOrders.length > 0) {
      loadItemsForObraTab();
      loadArrivalsBatch();
    }
  }, [obraOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedFiltered = [...filtered].sort((a, b) => {
    const dir = mainSort.dir === "asc" ? 1 : -1;
    switch (mainSort.key) {
      case "id": return (a.id - b.id) * dir;
      case "date": return a.date.localeCompare(b.date) * dir;
      case "buyerId": return (a.buyerId || "").localeCompare(b.buyerId || "") * dir;
      case "supplierId": return (supplierNames[a.supplierId] || String(a.supplierId)).localeCompare(supplierNames[b.supplierId] || String(b.supplierId)) * dir;
      case "costCenterId": return (costCenterMap[a.costCenterId] || String(a.costCenterId)).localeCompare(costCenterMap[b.costCenterId] || String(b.costCenterId)) * dir;
      case "autorizacao": {
        const ord = { "autorizado": 0, "pendente": 1, "reprovado": 2 };
        const getS = (o: typeof a) => o.disapproved ? "reprovado" : o.authorized ? "autorizado" : "pendente";
        return ((ord[getS(a) as keyof typeof ord] ?? 4) - (ord[getS(b) as keyof typeof ord] ?? 4)) * dir;
      }
      case "situacao": {
        const sOrd = { "PENDING": 0, "PARTIALLY_DELIVERED": 1, "FULLY_DELIVERED": 2, "CANCELED": 3 };
        return ((sOrd[a.status as keyof typeof sOrd] ?? 4) - (sOrd[b.status as keyof typeof sOrd] ?? 4)) * dir;
      }
      case "delivery": {
        const dOrd = { "Entregue": 0, "Parcial": 1, "Aguardando": 2, "error": 3 };
        const da = orderDeliveryStatus[a.id] ?? "";
        const db = orderDeliveryStatus[b.id] ?? "";
        return ((dOrd[da as keyof typeof dOrd] ?? 4) - (dOrd[db as keyof typeof dOrd] ?? 4)) * dir;
      }
      case "totalAmount": return (a.totalAmount - b.totalAmount) * dir;
      default: return 0;
    }
  });
  const paginatedItems = sortedFiltered.slice((page - 1) * pageSize, page * pageSize);

  const paginatedIds = paginatedItems.map((o) => o.id).join(",");
  useEffect(() => {
    if (!paginatedIds) return;
    const ids = paginatedIds.split(",").map(Number);
    const idsToFetch = ids.filter((id) => !(id in orderDeliveryStatusRef.current));
    if (idsToFetch.length === 0) return;

    let cancelled = false;

    const fetchSequentialIds = async (idsToLoad: number[]) => {
      for (let i = 0; i < idsToLoad.length; i++) {
        if (cancelled) break;
        const id = idsToLoad[i];
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
        if (i < idsToLoad.length - 1 && !cancelled) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    };

    const fetchWithCache = async () => {
      let remaining = idsToFetch;
      try {
        const cacheRes = await fetch(`/api/sienge/purchase-orders/delivery-cache?ids=${idsToFetch.join(",")}`);
        if (cacheRes.ok) {
          const { cached } = await cacheRes.json();
          if (Object.keys(cached).length > 0) {
            const updates: Record<number, string> = {};
            for (const [idStr, status] of Object.entries(cached)) {
              updates[Number(idStr)] = status as string;
            }
            setOrderDeliveryStatus((prev) => ({ ...prev, ...updates }));
            const cachedIds = new Set(Object.keys(cached).map(Number));
            remaining = idsToFetch.filter((id) => !cachedIds.has(id));
          }
        }
      } catch {
      }
      if (remaining.length > 0 && !cancelled) {
        await fetchSequentialIds(remaining);
      }
    };
    fetchWithCache();
    return () => { cancelled = true; };
  }, [paginatedIds, deliveryRefreshKey]);

  useEffect(() => {
    if (!paginatedIds) return;
    const ids = paginatedIds.split(",").map(Number);
    fetch(`/api/arrival-confirmations/counts?orderIds=${ids.join(",")}`)
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<number, number>) => setArrivalCounts(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, [paginatedIds]);

  useEffect(() => {
    if (orders.length === 0) return;
    const uniqueIds = [...new Set(orders.map((o) => o.supplierId))].filter((id) => !(id in supplierNamesRef.current));
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

  const [extraCostCenterNames, setExtraCostCenterNames] = useState<Record<number, string>>({});
  const extraCostCenterNamesRef = useRef(extraCostCenterNames);
  extraCostCenterNamesRef.current = extraCostCenterNames;

  useEffect(() => {
    if (orders.length === 0) return;
    const knownIds = new Set(costCenters.map((cc) => cc.id));
    const missingIds = [...new Set(orders.map((o) => o.costCenterId))].filter(
      (id) => !knownIds.has(id) && !(id in extraCostCenterNamesRef.current)
    );
    if (missingIds.length === 0) return;
    const fetchCCNames = async () => {
      try {
        const res = await fetch(`/api/sienge/cost-centers/lookup?ids=${missingIds.join(",")}`);
        if (res.ok) {
          const data = await res.json();
          setExtraCostCenterNames((prev) => ({ ...prev, ...data }));
        }
      } catch {}
    };
    fetchCCNames();
  }, [orders, costCenters]);

  const costCenterMap = React.useMemo(() => {
    const map: Record<number, string> = {};
    costCenters.forEach((cc) => { map[cc.id] = cc.name; });
    Object.entries(extraCostCenterNames).forEach(([id, name]) => { map[Number(id)] = name; });
    return map;
  }, [costCenters, extraCostCenterNames]);

  const exportPDF = () => {
    const yearLabel = filterYear.length === 0 ? "Todos" : filterYear.join(", ");
    const monthLabel = filterMonth.length === 0 ? "Todos" : filterMonth.map(m => monthNames[Number(m) - 1]).join(", ");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Pedidos de Compra", 14, 16);
    doc.setFontSize(10);
    doc.text(`Periodo: ${yearLabel} / ${monthLabel}`, 14, 22);
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
    const slug = filterYear.length === 0 ? "todos" : filterYear.join("-");
    doc.save(`pedidos-compra-${slug}.pdf`);
    toast.success("PDF exportado com sucesso!");
  };

  const totalAmount = filtered.reduce((sum, o) => sum + o.totalAmount, 0);
  const authorizedCount = filtered.filter((o) => o.authorized).length;
  const pendingCount = filtered.filter((o) => !o.authorized && !o.disapproved).length;
  const situacaoPendente = filtered.filter((o) => o.status === "PENDING").length;
  const situacaoParcial = filtered.filter((o) => o.status === "PARTIALLY_DELIVERED").length;
  const situacaoAtendido = filtered.filter((o) => o.status === "FULLY_DELIVERED").length;
  const situacaoCancelado = filtered.filter((o) => isCancelledOrder(o.status)).length;

  const apiTotalPages = Math.ceil(totalCount / limit);

  const allItemRows = React.useMemo(() => {
    return filtered.flatMap(order => {
      const items = orderItems[order.id] || [];
      return items.map(item => {
        const dsKey = `${order.id}-${item.itemNumber}`;
        const schedules = deliverySchedules[dsKey];
        const totalDelivered = schedules?.reduce((s, d) => s + d.deliveredQuantity, 0) ?? 0;
        const totalOpen = schedules?.reduce((s, d) => s + d.openQuantity, 0) ?? 0;
        const nextDate = schedules?.filter(d => d.openQuantity > 0)
          .sort((a, b) => a.sheduledDate.localeCompare(b.sheduledDate))[0]?.sheduledDate
          ?? schedules?.sort((a, b) => a.sheduledDate.localeCompare(b.sheduledDate))[0]?.sheduledDate;
        const attended = (deliveriesAttended[order.id] || [])
          .filter(d => d.purchaseOrderItemNumber === item.itemNumber)
          .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
        const lastDeliveryDate = attended[0]?.deliveryDate;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diasDesdePedido = order.date
          ? Math.round((today.getTime() - new Date(order.date + "T00:00:00").getTime()) / 86400000)
          : null;
        const diasPrevisto = nextDate
          ? Math.round((new Date(nextDate + "T00:00:00").getTime() - today.getTime()) / 86400000)
          : null;
        let itemStatus: "complete" | "partial" | "pending" | "none" | "loading" = "none";
        if (!schedules) itemStatus = "loading";
        else if (schedules.length === 0) itemStatus = "none";
        else if (totalOpen === 0 && totalDelivered > 0) itemStatus = "complete";
        else if (totalDelivered > 0 && totalOpen > 0) itemStatus = "partial";
        else itemStatus = "pending";
        return { order, item, schedules, totalDelivered, totalOpen, nextDate, lastDeliveryDate,
                 diasDesdePedido, diasPrevisto, itemStatus, saldo: item.quantity - totalDelivered };
      });
    });
  }, [filtered, orderItems, deliverySchedules, deliveriesAttended]);

  const itemKpis = React.useMemo(() => ({
    total: allItemRows.length,
    complete: allItemRows.filter(r => r.itemStatus === "complete").length,
    partial: allItemRows.filter(r => r.itemStatus === "partial").length,
    pending: allItemRows.filter(r => r.itemStatus === "pending").length,
    cancelled: allItemRows.filter(r => isCancelledOrder(r.order.status)).length,
    valorTotal: allItemRows.reduce((s, r) => s + r.item.netPrice, 0),
  }), [allItemRows]);

  const chegadaBaseRows = React.useMemo(() =>
    obraOrders.flatMap(order =>
      (orderItems[order.id] || []).map(item => ({ order, item }))
    )
  , [obraOrders, orderItems]);

  const chegadaItemRows = React.useMemo(() => {
    return chegadaBaseRows
      .filter(row => {
        if (isCancelledOrder(row.order.status)) return false;
        // Situação do pedido
        if (chegadaSituacao.length > 0 && chegadaSituacao.length < 4 && !chegadaSituacao.includes(row.order.status)) return false;
        // Centro de custo
        if (chegadaCostCenter !== "all" && row.order.costCenterId !== Number(chegadaCostCenter)) return false;
        // Mês (local, sobre obraOrders já filtradas por ano)
        if (obraFilterMonth.length > 0) {
          const om = String(new Date(row.order.date + "T00:00:00").getMonth() + 1);
          if (!obraFilterMonth.includes(om)) return false;
        }
        // Autorização
        if (obraFilterStatus.length > 0 && obraFilterStatus.length < 3) {
          let orderAuthStatus = "pendente";
          if (row.order.disapproved) orderAuthStatus = "reprovado";
          else if (row.order.authorized) orderAuthStatus = "autorizado";
          if (!obraFilterStatus.includes(orderAuthStatus)) return false;
        }
        // Busca
        if (chegadaSearch) {
          const q = chegadaSearch.toLowerCase();
          if (!row.item.resourceDescription.toLowerCase().includes(q) &&
              !(row.order.formattedPurchaseOrderId || "").toLowerCase().includes(q)) return false;
        }
        // Ocultar completos (pelo saldo do Sienge)
        if (chegadaHideFull) {
          const key = `${row.order.id}-${row.item.itemNumber}`;
          const schedules = deliverySchedules[key];
          if (schedules) {
            const open = schedules.reduce((s, d) => s + d.openQuantity, 0);
            if (open <= 0) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aHas = (orderArrivalConfs[a.order.id] || []).some(c => c.itemNumber === a.item.itemNumber) ? 1 : 0;
        const bHas = (orderArrivalConfs[b.order.id] || []).some(c => c.itemNumber === b.item.itemNumber) ? 1 : 0;
        if (aHas !== bHas) return aHas - bHas;
        return b.order.date.localeCompare(a.order.date);
      });
  }, [chegadaBaseRows, chegadaCostCenter, chegadaSituacao, chegadaSearch, chegadaHideFull,
      obraFilterMonth, obraFilterStatus, orderArrivalConfs, deliverySchedules]);

  const filteredItemRows = React.useMemo(() => {
    if (!itemSearch) return allItemRows;
    const q = itemSearch.toLowerCase();
    return allItemRows.filter(r =>
      r.item.resourceDescription.toLowerCase().includes(q) ||
      (r.item.resourceCode || "").toLowerCase().includes(q) ||
      String(r.order.id).includes(q) ||
      (r.order.formattedPurchaseOrderId || "").toLowerCase().includes(q)
    );
  }, [allItemRows, itemSearch]);

  const sortedItemRows = React.useMemo(() => {
    return [...filteredItemRows].sort((a, b) => {
      const dir = itemTabSort.dir === "asc" ? 1 : -1;
      switch (itemTabSort.key) {
        case "id": return (a.order.id - b.order.id) * dir;
        case "date": return (a.order.date || "").localeCompare(b.order.date || "") * dir;
        case "supplier": return (supplierNames[a.order.supplierId] || "").localeCompare(supplierNames[b.order.supplierId] || "") * dir;
        case "resourceCode": return (a.item.resourceCode || "").localeCompare(b.item.resourceCode || "") * dir;
        case "resourceDescription": return a.item.resourceDescription.localeCompare(b.item.resourceDescription) * dir;
        case "quantity": return (a.item.quantity - b.item.quantity) * dir;
        case "nextDate": return ((a.nextDate || "9999").localeCompare(b.nextDate || "9999")) * dir;
        case "totalDelivered": return (a.totalDelivered - b.totalDelivered) * dir;
        case "saldo": return (a.saldo - b.saldo) * dir;
        case "lastDeliveryDate": return ((a.lastDeliveryDate || "").localeCompare(b.lastDeliveryDate || "")) * dir;
        case "itemStatus": {
          const ord = { complete: 0, partial: 1, pending: 2, none: 3, loading: 4 };
          return ((ord[a.itemStatus] ?? 5) - (ord[b.itemStatus] ?? 5)) * dir;
        }
        default: return 0;
      }
    });
  }, [filteredItemRows, itemTabSort, supplierNames]);

  const itemTabPageSize = 20;
  const itemTabTotalPages = Math.ceil(sortedItemRows.length / itemTabPageSize);
  const paginatedItemRows = sortedItemRows.slice((itemTabPage - 1) * itemTabPageSize, itemTabPage * itemTabPageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pedidos de Compra</h1>
          <p className="text-slate-500 mt-1">
            Pedidos de compra registrados no Sienge — {filterYear.length === 0 ? "Todos anos" : filterYear.join(", ")} / {filterMonth.length === 0 ? "Todos meses" : filterMonth.map(m => monthNames[Number(m) - 1]).join(", ")}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {totalCount} registros
        </Badge>
      </div>

      {orders.length < totalCount && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{orders.length.toLocaleString("pt-BR")}</strong> de <strong>{totalCount.toLocaleString("pt-BR")}</strong> pedidos carregados — os totais abaixo podem estar incompletos.{" "}
            <button type="button" onClick={loadAllLotes} disabled={loadingAll} className="underline font-medium hover:text-amber-700 disabled:opacity-50">
              {loadingAll ? "Carregando..." : "Carregar todos agora"}
            </button>
          </span>
        </div>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
        <Card className="border-0 shadow-sm col-span-2 sm:col-span-1">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Valor Total</p>
            <p className="text-base font-bold text-slate-800 mt-0.5">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Autorizados</p>
            <p className="text-base font-bold text-green-600 mt-0.5">{authorizedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Pend. Aprov.</p>
            <p className="text-base font-bold text-amber-600 mt-0.5">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm border-l-2 border-l-slate-200">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Sit. Pendente</p>
            <p className="text-base font-bold text-slate-700 mt-0.5">{situacaoPendente}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Parc. Entregue</p>
            <p className="text-base font-bold text-amber-600 mt-0.5">{situacaoParcial}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Tot. Atendido</p>
            <p className="text-base font-bold text-green-600 mt-0.5">{situacaoAtendido}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Cancelado</p>
            <p className="text-base font-bold text-red-500 mt-0.5">{situacaoCancelado}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "pedidos" | "itens" | "chegada-obra"); setItemTabPage(1); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="itens">
            Itens do Pedido
            {activeTab === "itens" && loadingAllItems && (
              <Loader2 className="h-3 w-3 ml-1.5 animate-spin" />
            )}
          </TabsTrigger>
          <TabsTrigger value="chegada-obra">
            Chegada Obra
            {activeTab === "chegada-obra" && (loadingObraOrders || loadingAllItems || loadingArrivalsBatch) && (
              <Loader2 className="h-3 w-3 ml-1.5 animate-spin" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5 flex-1 min-w-[200px] max-w-sm">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Buscar</span>
              <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por pedido, comprador, fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={search ? "pl-10 pr-8" : "pl-10"}
              />
              {search && (
                <button
                  type="button"
                  title="Limpar busca"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Ano</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[120px] justify-start text-left font-normal">
                  <CalendarDays className="h-4 w-4 mr-1 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {filterYear.length === 0 ? "Todos Anos" : filterYear.join(", ")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[150px] p-2" align="start">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm font-medium">
                  <Checkbox
                    checked={filterYear.length === 0}
                    onCheckedChange={(checked) => {
                      if (checked) { setFilterYear([]); setOffset(0); }
                    }}
                  />
                  Todos Anos
                </label>
                {Array.from({ length: currentYear - 2021 }, (_, i) => currentYear - i).map((y) => (
                  <label key={y} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                    <Checkbox
                      checked={filterYear.includes(String(y))}
                      onCheckedChange={(checked) => {
                        setFilterYear((prev) => checked ? [...prev, String(y)] : prev.filter((v) => v !== String(y)));
                        setOffset(0);
                      }}
                    />
                    {y}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Mês</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[150px] justify-start text-left font-normal">
                  <span className="truncate">
                    {filterMonth.length === 0 ? "Todos Meses" : filterMonth.map(m => monthNames[Number(m) - 1].slice(0, 3)).join(", ")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[160px] p-2" align="start">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm font-medium">
                  <Checkbox
                    checked={filterMonth.length === 0}
                    onCheckedChange={(checked) => {
                      if (checked) { setFilterMonth([]); setOffset(0); }
                    }}
                  />
                  Todos Meses
                </label>
                {monthNames.map((name, i) => (
                  <label key={i + 1} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                    <Checkbox
                      checked={filterMonth.includes(String(i + 1))}
                      onCheckedChange={(checked) => {
                        setFilterMonth((prev) => checked ? [...prev, String(i + 1)] : prev.filter((v) => v !== String(i + 1)));
                        setOffset(0);
                      }}
                    />
                    {name}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Autorização</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[160px] justify-start text-left font-normal">
                  <CheckCircle2 className="h-4 w-4 mr-1 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {filterStatus.length === 0 || filterStatus.length === 3 ? "Todos Status" : filterStatus.map(s => s === "pendente" ? "Pend." : s === "autorizado" ? "Aut." : "Repr.").join(", ")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[180px] p-2" align="start">
                {[
                  { value: "pendente", label: "Pendente" },
                  { value: "autorizado", label: "Autorizado" },
                  { value: "reprovado", label: "Reprovado" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                    <Checkbox
                      checked={filterStatus.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        setFilterStatus((prev) =>
                          checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value)
                        );
                      }}
                    />
                    {opt.label}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Situação</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[150px] justify-start text-left font-normal">
                  <Ban className="h-4 w-4 mr-1 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {filterSituacao.length === 0 || filterSituacao.length === 4 ? "Todas Situações" : filterSituacao.includes("CANCELED") && filterSituacao.length === 1 ? "Cancelado" : filterSituacao.includes("CANCELED") ? "Canc. + outros" : filterSituacao.length === 3 ? "Sem cancelados" : `${filterSituacao.length} seleç.`}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-2" align="start">
                <p className="text-[11px] font-semibold text-slate-400 px-2 pb-1 uppercase tracking-wide">Situação do Pedido</p>
                {[
                  { value: "PENDING", label: "Pendente" },
                  { value: "PARTIALLY_DELIVERED", label: "Parcialmente entregue" },
                  { value: "FULLY_DELIVERED", label: "Totalmente atendido" },
                  { value: "CANCELED", label: "Cancelado" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                    <Checkbox
                      checked={filterSituacao.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        setFilterSituacao((prev) =>
                          checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value)
                        );
                      }}
                    />
                    {opt.label}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Empresa</span>
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
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Centro de Custo</span>
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
            </div>
            <div className="flex gap-2 self-end">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-red-600">
                  <XCircle className="h-4 w-4 mr-1" />
                  Limpar Filtros
                </Button>
              )}
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
              <Button variant="outline" onClick={() => fetchOrders()}>Tentar novamente</Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100/80">
                    <TableRow>
                      {(() => {
                        const SI = ({ col }: { col: string }) => mainSort.key === col
                          ? (mainSort.dir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5 text-slate-600" /> : <ArrowDown className="h-3 w-3 inline ml-0.5 text-slate-600" />)
                          : <ArrowUpDown className="h-3 w-3 inline ml-0.5 text-slate-300 group-hover:text-slate-500" />;
                        const Th = ({ col, label, className }: { col: string; label: string; className?: string }) => (
                          <TableHead className={`cursor-pointer select-none ${className ?? ""}`} onClick={() => toggleMainSort(col)}>
                            <span className="group flex items-center gap-0 whitespace-nowrap">{label}<SI col={col} /></span>
                          </TableHead>
                        );
                        return (<>
                          <Th col="id"          label="Pedido"      className="w-20" />
                          <Th col="date"        label="Data"        className="w-24" />
                          <Th col="buyerId"     label="Comprador" />
                          <Th col="supplierId"  label="Fornecedor" />
                          <Th col="costCenterId" label="Centro Custo" />
                          <Th col="autorizacao" label="Autorização" className="w-28" />
                          <Th col="situacao"    label="Situação"    className="w-28" />
                          <Th col="totalAmount" label="Valor Total" className="text-right w-32" />
                          <TableHead className="w-8"></TableHead>
                        </>);
                      })()}
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
                                {getStatusBadge(order.authorized, order.disapproved)}
                              </TableCell>
                              <TableCell>
                                {getSituacaoBadge(order.status)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-medium">
                                <div className="flex items-center justify-end gap-2">
                                  {arrivalCounts[order.id] > 0 && (
                                    <span title={`${arrivalCounts[order.id]} chegada(s) registrada(s)`} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-1.5 py-0.5">
                                      <PackageCheck className="h-3 w-3" />{arrivalCounts[order.id]}
                                    </span>
                                  )}
                                  {formatCurrency(order.totalAmount)}
                                </div>
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
                                    {!order.authorized && !order.disapproved && (
                                      <div className="mt-3 pt-3 border-t flex items-center gap-3">
                                        {confirmingAuthorize === order.id ? (
                                          <>
                                            <span className="text-sm text-slate-600 font-medium">
                                              Confirmar autorização do pedido {order.formattedPurchaseOrderId}?
                                            </span>
                                            <Button
                                              size="sm"
                                              className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                                              onClick={(e) => { e.stopPropagation(); handleAuthorize(order.id); }}
                                              disabled={authorizingOrder === order.id}
                                            >
                                              {authorizingOrder === order.id
                                                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Autorizando...</>
                                                : <><CheckCircle2 className="h-3 w-3 mr-1" />Confirmar</>}
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 text-xs"
                                              onClick={(e) => { e.stopPropagation(); setConfirmingAuthorize(null); }}
                                              disabled={authorizingOrder === order.id}
                                            >
                                              Cancelar
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                            onClick={(e) => { e.stopPropagation(); setConfirmingAuthorize(order.id); }}
                                          >
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Autorizar Pedido
                                          </Button>
                                        )}
                                      </div>
                                    )}
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
                                                {(() => {
                                                  const SortIcon = ({ col }: { col: string }) => itemSort.key === col
                                                    ? (itemSort.dir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5 text-slate-600" /> : <ArrowDown className="h-3 w-3 inline ml-0.5 text-slate-600" />)
                                                    : <ArrowUpDown className="h-3 w-3 inline ml-0.5 text-slate-300 group-hover:text-slate-500" />;
                                                  const Th = ({ col, label, className }: { col: string; label: string; className: string }) => (
                                                    <TableHead className={`${className} cursor-pointer select-none`} onClick={() => toggleItemSort(col)}>
                                                      <span className="group flex items-center gap-0 whitespace-nowrap">
                                                        {label}<SortIcon col={col} />
                                                      </span>
                                                    </TableHead>
                                                  );
                                                  return (<>
                                                    <Th col="itemNumber"   label="#"           className="text-xs py-1.5 w-12" />
                                                    <Th col="resourceCode" label="Codigo"       className="text-xs py-1.5 w-24" />
                                                    <Th col="resourceDescription" label="Descricao" className="text-xs py-1.5" />
                                                    <TableHead className="text-xs py-1.5 w-16">Unid</TableHead>
                                                    <Th col="quantity"     label="Qtde"         className="text-xs py-1.5 text-right w-20" />
                                                    <Th col="unitPrice"    label="Preco Unit."  className="text-xs py-1.5 text-right w-28" />
                                                    <Th col="netPrice"     label="Valor Liq."   className="text-xs py-1.5 text-right w-28" />
                                                    <Th col="nextDate"     label="Previsao"     className="text-xs py-1.5 text-center w-24" />
                                                    <Th col="lastDeliveryDate" label="Dt. Entrega" className="text-xs py-1.5 text-center w-28" />
                                                    <Th col="totalDelivered"   label="Entregue"    className="text-xs py-1.5 text-right w-20" />
                                                    <Th col="totalOpen"        label="Pendente"    className="text-xs py-1.5 text-right w-20" />
                                                    <Th col="deliveryStatus"   label="Situacao"    className="text-xs py-1.5 text-center w-28" />
                                                    <TableHead className="text-xs py-1.5 text-center w-36">Chegada Obra</TableHead>
                                                  </>);
                                                })()}
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {[...orderItems[order.id]].sort((a, b) => {
                                                const dir = itemSort.dir === "asc" ? 1 : -1;
                                                const ak = `${order.id}-${a.itemNumber}`;
                                                const bk = `${order.id}-${b.itemNumber}`;
                                                const sa = deliverySchedules[ak];
                                                const sb = deliverySchedules[bk];
                                                switch (itemSort.key) {
                                                  case "itemNumber": return (a.itemNumber - b.itemNumber) * dir;
                                                  case "resourceCode": return (a.resourceCode || "").localeCompare(b.resourceCode || "") * dir;
                                                  case "resourceDescription": return a.resourceDescription.localeCompare(b.resourceDescription) * dir;
                                                  case "quantity": return (a.quantity - b.quantity) * dir;
                                                  case "unitPrice": return (a.unitPrice - b.unitPrice) * dir;
                                                  case "netPrice": return (a.netPrice - b.netPrice) * dir;
                                                  case "nextDate": {
                                                    const an = sa?.filter(d => d.openQuantity > 0).sort((x,y) => x.sheduledDate.localeCompare(y.sheduledDate))[0]?.sheduledDate ?? sa?.sort((x,y) => x.sheduledDate.localeCompare(y.sheduledDate))[0]?.sheduledDate ?? "";
                                                    const bn = sb?.filter(d => d.openQuantity > 0).sort((x,y) => x.sheduledDate.localeCompare(y.sheduledDate))[0]?.sheduledDate ?? sb?.sort((x,y) => x.sheduledDate.localeCompare(y.sheduledDate))[0]?.sheduledDate ?? "";
                                                    return an.localeCompare(bn) * dir;
                                                  }
                                                  case "lastDeliveryDate": {
                                                    const ad = (deliveriesAttended[order.id] || []).filter(d => d.purchaseOrderItemNumber === a.itemNumber).sort((x,y) => y.deliveryDate.localeCompare(x.deliveryDate))[0]?.deliveryDate ?? "";
                                                    const bd = (deliveriesAttended[order.id] || []).filter(d => d.purchaseOrderItemNumber === b.itemNumber).sort((x,y) => y.deliveryDate.localeCompare(x.deliveryDate))[0]?.deliveryDate ?? "";
                                                    return ad.localeCompare(bd) * dir;
                                                  }
                                                  case "totalDelivered": return ((sa?.reduce((s,d) => s+d.deliveredQuantity,0)??0) - (sb?.reduce((s,d) => s+d.deliveredQuantity,0)??0)) * dir;
                                                  case "totalOpen": return ((sa?.reduce((s,d) => s+d.openQuantity,0)??0) - (sb?.reduce((s,d) => s+d.openQuantity,0)??0)) * dir;
                                                  case "deliveryStatus": {
                                                    const order_ = {"complete":0,"partial":1,"pending":2,"none":3,"loading":4};
                                                    const getS = (sc: typeof sa) => { if(!sc) return "loading"; const td=sc.reduce((s,d)=>s+d.deliveredQuantity,0); const to=sc.reduce((s,d)=>s+d.openQuantity,0); if(sc.length===0) return "none"; if(to===0&&td>0) return "complete"; if(td>0&&to>0) return "partial"; return "pending"; };
                                                    return (order_[getS(sa) as keyof typeof order_] - order_[getS(sb) as keyof typeof order_]) * dir;
                                                  }
                                                  default: return 0;
                                                }
                                              }).map((item) => {
                                                const dsKey = `${order.id}-${item.itemNumber}`;
                                                const schedules = deliverySchedules[dsKey];
                                                const totalDelivered = schedules?.reduce((s, d) => s + d.deliveredQuantity, 0) ?? 0;
                                                const totalOpen = schedules?.reduce((s, d) => s + d.openQuantity, 0) ?? 0;
                                                const nextDate = schedules?.filter(d => d.openQuantity > 0).sort((a, b) => a.sheduledDate.localeCompare(b.sheduledDate))[0]?.sheduledDate
                                                  ?? schedules?.sort((a, b) => a.sheduledDate.localeCompare(b.sheduledDate))[0]?.sheduledDate;

                                                const itemDeliveries = (deliveriesAttended[order.id] || [])
                                                  .filter((da) => da.purchaseOrderItemNumber === item.itemNumber)
                                                  .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
                                                const lastDeliveryDate = itemDeliveries[0]?.deliveryDate;
                                                const daysToDeliver = lastDeliveryDate && order.date
                                                  ? Math.round((new Date(lastDeliveryDate).getTime() - new Date(order.date + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24))
                                                  : null;

                                                let deliveryStatus: "loading" | "complete" | "partial" | "pending" | "none" = "none";
                                                if (!schedules) deliveryStatus = "loading";
                                                else if (schedules.length === 0) deliveryStatus = "none";
                                                else if (totalOpen === 0 && totalDelivered > 0) deliveryStatus = "complete";
                                                else if (totalDelivered > 0 && totalOpen > 0) deliveryStatus = "partial";
                                                else deliveryStatus = "pending";

                                                const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
                                                const daysUntil = nextDate && (deliveryStatus === "pending" || deliveryStatus === "partial")
                                                  ? Math.round((new Date(nextDate + "T00:00:00").getTime() - todayMs) / (1000 * 60 * 60 * 24))
                                                  : null;

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
                                                    ) : nextDate ? (
                                                      <div className="flex flex-col items-center gap-0.5">
                                                        <span>{formatDate(nextDate)}</span>
                                                        {daysUntil !== null && (
                                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                            daysUntil < 0
                                                              ? "bg-red-100 text-red-700"
                                                              : daysUntil === 0
                                                              ? "bg-orange-100 text-orange-700"
                                                              : daysUntil <= 7
                                                              ? "bg-amber-100 text-amber-700"
                                                              : "bg-blue-50 text-blue-600"
                                                          }`}>
                                                            {daysUntil < 0
                                                              ? `${Math.abs(daysUntil)}d atraso`
                                                              : daysUntil === 0
                                                              ? "Hoje"
                                                              : `${daysUntil}d`}
                                                          </span>
                                                        )}
                                                      </div>
                                                    ) : "-"}
                                                  </TableCell>
                                                  <TableCell className="py-1.5 text-center font-mono">
                                                    {lastDeliveryDate ? (
                                                      <div className="flex flex-col items-center gap-0.5">
                                                        <span>{formatDate(lastDeliveryDate)}</span>
                                                        {daysToDeliver !== null && (
                                                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                                            daysToDeliver <= 7
                                                              ? "bg-green-100 text-green-700"
                                                              : daysToDeliver <= 14
                                                              ? "bg-amber-100 text-amber-700"
                                                              : "bg-red-100 text-red-700"
                                                          }`}>
                                                            {daysToDeliver}d
                                                          </span>
                                                        )}
                                                      </div>
                                                    ) : "-"}
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
                                                  <TableCell className="py-1.5 text-center">
                                                    {(() => {
                                                      const confs = (orderArrivalConfs[order.id] || []).filter(c => c.itemNumber === item.itemNumber);
                                                      const totalQty = confs.reduce((sum, c) => sum + (c.quantity ?? 0), 0);
                                                      return (
                                                        <div className="flex flex-col items-center gap-1">
                                                          {confs.length > 0 && (
                                                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px] gap-0.5 cursor-default">
                                                              <PackageCheck className="h-3 w-3" />
                                                              {totalQty > 0 ? `${totalQty.toLocaleString("pt-BR")} un` : `${confs.length}x`}
                                                            </Badge>
                                                          )}
                                                          <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 text-[10px] px-1.5 border-blue-200 text-blue-600 hover:bg-blue-50"
                                                            onClick={(e) => { e.stopPropagation(); setArrivalDialog({ orderId: order.id, itemNumber: item.itemNumber, description: item.resourceDescription }); }}
                                                          >
                                                            + Registrar
                                                          </Button>
                                                        </div>
                                                      );
                                                    })()}
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
                    {loadingAll
                      ? `Carregando... ${orders.length} de ${totalCount}`
                      : orders.length < totalCount
                      ? `${orders.length} de ${totalCount} pedidos carregados`
                      : `Todos os ${totalCount} pedidos carregados`}
                  </p>
                  <div className="flex gap-2">
                    {orders.length < totalCount && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-blue-600 hover:text-blue-700"
                        disabled={loadingAll}
                        onClick={loadAllLotes}
                      >
                        {loadingAll ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                        Carregar todos
                      </Button>
                    )}
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
        </TabsContent>

        <TabsContent value="itens">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              {loadingAllItems && (
                <div className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando itens: {itemsLoadedCount} de {filtered.filter(o => !orderItems[o.id]).length + itemsLoadedCount} pedidos...
                </div>
              )}
              {/* KPI cards */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
                <Card className="border-0 shadow-none bg-slate-50">
                  <CardContent className="pt-2 pb-2 px-3">
                    <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Total Itens</p>
                    <p className="text-base font-bold text-slate-800 mt-0.5">{itemKpis.total}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-none bg-green-50">
                  <CardContent className="pt-2 pb-2 px-3">
                    <p className="text-[10px] text-green-600 uppercase font-medium leading-tight">Atendidos</p>
                    <p className="text-base font-bold text-green-700 mt-0.5">{itemKpis.complete}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-none bg-amber-50">
                  <CardContent className="pt-2 pb-2 px-3">
                    <p className="text-[10px] text-amber-600 uppercase font-medium leading-tight">Parc. Atendido</p>
                    <p className="text-base font-bold text-amber-700 mt-0.5">{itemKpis.partial}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-none bg-slate-50">
                  <CardContent className="pt-2 pb-2 px-3">
                    <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Pendentes</p>
                    <p className="text-base font-bold text-slate-700 mt-0.5">{itemKpis.pending}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-none bg-red-50">
                  <CardContent className="pt-2 pb-2 px-3">
                    <p className="text-[10px] text-red-500 uppercase font-medium leading-tight">Cancelados</p>
                    <p className="text-base font-bold text-red-600 mt-0.5">{itemKpis.cancelled}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-none bg-slate-50">
                  <CardContent className="pt-2 pb-2 px-3">
                    <p className="text-[10px] text-slate-500 uppercase font-medium leading-tight">Valor Total</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(itemKpis.valorTotal)}</p>
                  </CardContent>
                </Card>
              </div>
              {/* Search */}
              <div className="relative mb-3 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por código, descrição, pedido..."
                  value={itemSearch}
                  onChange={(e) => { setItemSearch(e.target.value); setItemTabPage(1); }}
                  className={itemSearch ? "pl-10 pr-8" : "pl-10"}
                />
                {itemSearch && (
                  <button
                    type="button"
                    title="Limpar busca"
                    onClick={() => { setItemSearch(""); setItemTabPage(1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* Table */}
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader className="bg-slate-100/80">
                    <TableRow>
                      {(() => {
                        const SI = ({ col }: { col: string }) => itemTabSort.key === col
                          ? (itemTabSort.dir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5 text-slate-600" /> : <ArrowDown className="h-3 w-3 inline ml-0.5 text-slate-600" />)
                          : <ArrowUpDown className="h-3 w-3 inline ml-0.5 text-slate-300 group-hover:text-slate-500" />;
                        const Th = ({ col, label, className }: { col: string; label: string; className?: string }) => (
                          <TableHead
                            className={`cursor-pointer select-none ${className ?? ""}`}
                            onClick={() => setItemTabSort(prev => prev.key === col ? { key: col, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: col, dir: "asc" })}
                          >
                            <span className="group flex items-center gap-0 whitespace-nowrap">{label}<SI col={col} /></span>
                          </TableHead>
                        );
                        return (<>
                          <Th col="id"                  label="Pedido"      className="w-24" />
                          <Th col="date"                label="Data"        className="w-24" />
                          <Th col="supplier"            label="Fornecedor" />
                          <Th col="resourceCode"        label="Cód."        className="w-24" />
                          <Th col="resourceDescription" label="Descrição" />
                          <TableHead className="w-14">Unid</TableHead>
                          <Th col="quantity"            label="Qtde"        className="text-right w-20" />
                          <Th col="nextDate"            label="Dt. Previsão" className="text-center w-28" />
                          <Th col="totalDelivered"      label="Entregue"    className="text-right w-20" />
                          <Th col="saldo"               label="Saldo"       className="text-right w-20" />
                          <Th col="lastDeliveryDate"    label="Dt. Entrega" className="text-center w-28" />
                          <Th col="itemStatus"          label="Situação"    className="text-center w-28" />
                        </>);
                      })()}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItemRows.length === 0 && !loadingAllItems ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-8 text-slate-400">
                          {filtered.length === 0 ? "Nenhum pedido nos filtros atuais." : "Nenhum item carregado. Troque para esta aba para iniciar o carregamento."}
                        </TableCell>
                      </TableRow>
                    ) : paginatedItemRows.map((row, idx) => {
                      const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
                      const daysUntil = row.nextDate && (row.itemStatus === "pending" || row.itemStatus === "partial")
                        ? Math.round((new Date(row.nextDate + "T00:00:00").getTime() - todayMs) / (1000 * 60 * 60 * 24))
                        : null;
                      return (
                        <TableRow key={`${row.order.id}-${row.item.itemNumber}-${idx}`} className="hover:bg-slate-50">
                          <TableCell className="font-mono text-xs font-medium">{row.order.formattedPurchaseOrderId}</TableCell>
                          <TableCell className="text-xs">{formatDate(row.order.date)}</TableCell>
                          <TableCell className="text-xs">
                            {supplierNames[row.order.supplierId] || <span className="font-mono text-slate-400">{row.order.supplierId}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.item.resourceCode || "-"}</TableCell>
                          <TableCell className="text-xs">{row.item.resourceDescription}</TableCell>
                          <TableCell className="text-xs">{row.item.unitOfMeasure}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{row.item.quantity.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-xs text-center font-mono">
                            {row.itemStatus === "loading" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-slate-400 mx-auto" />
                            ) : row.nextDate ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span>{formatDate(row.nextDate)}</span>
                                {daysUntil !== null && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    daysUntil < 0 ? "bg-red-100 text-red-700"
                                    : daysUntil === 0 ? "bg-orange-100 text-orange-700"
                                    : daysUntil <= 7 ? "bg-amber-100 text-amber-700"
                                    : "bg-blue-50 text-blue-600"
                                  }`}>
                                    {daysUntil < 0 ? `${Math.abs(daysUntil)}d atraso` : daysUntil === 0 ? "Hoje" : `${daysUntil}d`}
                                  </span>
                                )}
                              </div>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {row.itemStatus === "loading" ? "-" : row.totalDelivered.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {row.itemStatus === "loading" ? "-" : row.saldo.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono">
                            {row.lastDeliveryDate ? formatDate(row.lastDeliveryDate) : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-center">
                            {row.itemStatus === "loading" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-slate-400 mx-auto" />
                            ) : row.itemStatus === "complete" ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px] gap-0.5"><PackageCheck className="h-3 w-3" />Atendido</Badge>
                            ) : row.itemStatus === "partial" ? (
                              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] gap-0.5"><Truck className="h-3 w-3" />Parcial</Badge>
                            ) : row.itemStatus === "pending" ? (
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
              {itemTabTotalPages > 1 && (
                <div className="flex items-center justify-between px-2 pt-4 border-t mt-2">
                  <p className="text-sm text-slate-500">
                    Página {itemTabPage} de {itemTabTotalPages} ({sortedItemRows.length} itens)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={itemTabPage <= 1} onClick={() => setItemTabPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={itemTabPage >= itemTabTotalPages} onClick={() => setItemTabPage(p => p + 1)}>
                      Próximo<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba Chegada Obra ─────────────────────────────────────────────── */}
        <TabsContent value="chegada-obra">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-6 px-6">

              {/* Filtros da aba */}
              <div className="flex flex-wrap gap-3 mb-5 items-end">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      value={chegadaSearch}
                      onChange={e => setChegadaSearch(e.target.value)}
                      placeholder="Buscar produto ou nº pedido..."
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                </div>
                {/* ANO — dispara novo fetch, independente da aba Pedidos */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Ano</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-[120px] justify-start text-left font-normal">
                        <CalendarDays className="h-4 w-4 mr-1 text-slate-400 shrink-0" />
                        {loadingObraOrders
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                          : <span className="truncate">{obraFilterYear.length === 0 ? "Todos Anos" : obraFilterYear.join(", ")}</span>
                        }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[150px] p-2" align="start">
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm font-medium">
                        <Checkbox
                          checked={obraFilterYear.length === 0}
                          onCheckedChange={checked => { if (checked) { setObraFilterYear([]); setObraOrders([]); } }}
                        />
                        Todos Anos
                      </label>
                      {Array.from({ length: currentYear - 2021 }, (_, i) => currentYear - i).map(y => (
                        <label key={y} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                          <Checkbox
                            checked={obraFilterYear.includes(String(y))}
                            onCheckedChange={checked => {
                              setObraFilterYear(prev => checked ? [...prev, String(y)] : prev.filter(v => v !== String(y)));
                              setObraOrders([]);
                            }}
                          />
                          {y}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* MÊS — filtro local */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Mês</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-[150px] justify-start text-left font-normal">
                        <span className="truncate">
                          {obraFilterMonth.length === 0 ? "Todos Meses" : obraFilterMonth.map(m => monthNames[Number(m) - 1].slice(0, 3)).join(", ")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[160px] p-2" align="start">
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm font-medium">
                        <Checkbox
                          checked={obraFilterMonth.length === 0}
                          onCheckedChange={checked => { if (checked) setObraFilterMonth([]); }}
                        />
                        Todos Meses
                      </label>
                      {monthNames.map((name, i) => (
                        <label key={i + 1} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                          <Checkbox
                            checked={obraFilterMonth.includes(String(i + 1))}
                            onCheckedChange={checked =>
                              setObraFilterMonth(prev => checked ? [...prev, String(i + 1)] : prev.filter(v => v !== String(i + 1)))
                            }
                          />
                          {name}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* AUTORIZAÇÃO — filtro local */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Autorização</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-[155px] justify-start text-left font-normal">
                        <CheckCircle2 className="h-4 w-4 mr-1 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {obraFilterStatus.length === 0 || obraFilterStatus.length === 3 ? "Todos Status"
                            : obraFilterStatus.map(s => s === "pendente" ? "Pend." : s === "autorizado" ? "Aut." : "Repr.").join(", ")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[180px] p-2" align="start">
                      {[
                        { value: "pendente",   label: "Pendente" },
                        { value: "autorizado", label: "Autorizado" },
                        { value: "reprovado",  label: "Reprovado" },
                      ].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                          <Checkbox
                            checked={obraFilterStatus.includes(opt.value)}
                            onCheckedChange={checked =>
                              setObraFilterStatus(prev => checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value))
                            }
                          />
                          {opt.label}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* CENTRO DE CUSTO */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Centro de Custo</span>
                  <Select value={chegadaCostCenter} onValueChange={setChegadaCostCenter}>
                    <SelectTrigger className="h-9 text-sm w-[220px]">
                      <SelectValue placeholder="Todos Centros de Custo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Centros de Custo</SelectItem>
                      {costCenters.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* SITUAÇÃO DO PEDIDO */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Situação</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-sm font-normal justify-start w-[155px]">
                        <Filter className="h-4 w-4 mr-1.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {chegadaSituacao.length === 3 ? "Todas" :
                           chegadaSituacao.length === 0 ? "Nenhuma" :
                           chegadaSituacao.map(s =>
                             s === "PENDING" ? "Pendente" :
                             s === "PARTIALLY_DELIVERED" ? "Parcial" : "Atendido"
                           ).join(", ")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[190px] p-2" align="start">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase px-2 mb-1">Situação do Pedido</p>
                      {[
                        { value: "PENDING",             label: "Pendente" },
                        { value: "PARTIALLY_DELIVERED", label: "Parc. Entregue" },
                        { value: "FULLY_DELIVERED",     label: "Totalmente atendido" },
                      ].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-sm">
                          <Checkbox
                            checked={chegadaSituacao.includes(opt.value)}
                            onCheckedChange={checked =>
                              setChegadaSituacao(prev =>
                                checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value)
                              )
                            }
                          />
                          {opt.label}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600 h-9 px-3 rounded-md border border-input bg-background hover:bg-slate-50 self-end">
                  <Checkbox
                    checked={chegadaHideFull}
                    onCheckedChange={v => setChegadaHideFull(!!v)}
                  />
                  Ocultar completos
                </label>
                {(chegadaSearch || chegadaCostCenter !== "all" || chegadaHideFull || chegadaSituacao.length !== 3
                  || obraFilterMonth.length > 0 || (obraFilterStatus.length > 0 && obraFilterStatus.length < 3)) && (
                  <Button variant="ghost" size="sm" className="h-9 text-slate-500 hover:text-red-600 self-end"
                    onClick={() => {
                      setChegadaSearch(""); setChegadaCostCenter("all");
                      setChegadaSituacao(["PENDING", "PARTIALLY_DELIVERED", "FULLY_DELIVERED"]);
                      setChegadaHideFull(false); setObraFilterMonth([]); setObraFilterStatus(["pendente", "autorizado", "reprovado"]);
                    }}>
                    <XCircle className="h-4 w-4 mr-1" />Limpar
                  </Button>
                )}
                <span className="text-xs text-slate-400 self-center ml-auto">
                  {chegadaItemRows.length} {chegadaItemRows.length === 1 ? "item" : "itens"}
                </span>
              </div>

              {/* Loading */}
              {(loadingObraOrders || loadingAllItems || loadingArrivalsBatch) && chegadaItemRows.length === 0 ? (
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {loadingObraOrders
                      ? `Buscando pedidos de ${obraFilterYear.length === 0 ? "todos os anos" : obraFilterYear.join(", ")}...`
                      : loadingAllItems
                      ? `Carregando itens... (${itemsLoadedCount} de ${obraOrders.length})`
                      : "Carregando confirmações..."}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-xl border bg-white p-4 space-y-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-2/3" />
                        <div className="flex justify-between mt-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <Skeleton className="h-2 w-full rounded-full" />
                        <Skeleton className="h-8 w-full rounded-md" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : chegadaItemRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Package className="h-12 w-12 mb-3 opacity-40" />
                  <p className="text-sm font-medium text-slate-500">Nenhum item para registrar chegada</p>
                  <p className="text-xs mt-1">
                    {chegadaSearch || chegadaCostCenter !== "all" || chegadaHideFull || chegadaSituacao.length !== 3
                      ? "Tente ajustar os filtros acima"
                      : "Nenhum pedido com itens carregados"}
                  </p>
                  {(chegadaSearch || chegadaCostCenter !== "all" || chegadaHideFull || chegadaSituacao.length !== 3) && (
                    <Button variant="outline" size="sm" className="mt-3"
                      onClick={() => { setChegadaSearch(""); setChegadaCostCenter("all"); setChegadaSituacao(["PENDING", "PARTIALLY_DELIVERED", "FULLY_DELIVERED"]); setChegadaHideFull(false); }}>
                      Limpar filtros
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chegadaItemRows.map(row => {
                    const confs = (orderArrivalConfs[row.order.id] || []).filter(c => c.itemNumber === row.item.itemNumber);
                    const schedKey = `${row.order.id}-${row.item.itemNumber}`;
                    const schedules = deliverySchedules[schedKey];
                    const schedulesLoaded = !!schedules;
                    const siengeDelivered = schedules?.reduce((s, d) => s + d.deliveredQuantity, 0) ?? 0;
                    const siengeOpen = schedules?.reduce((s, d) => s + d.openQuantity, 0) ?? 0;
                    const pct = row.item.quantity > 0 ? Math.min(100, Math.round((siengeDelivered / row.item.quantity) * 100)) : 0;
                    const barColor = pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-slate-200";
                    const supplierName = supplierNames[row.order.supplierId] || "";
                    const costCenterName = costCenterMap[row.order.costCenterId] || String(row.order.costCenterId);
                    return (
                      <div key={`${row.order.id}-${row.item.itemNumber}`}
                        className="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col p-4 gap-3">

                        {/* Cabeçalho: nome + badge situação */}
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">
                            {row.item.resourceDescription}
                          </p>
                          {getSituacaoBadge(row.order.status)}
                        </div>

                        {/* Meta */}
                        <div className="text-xs text-slate-500 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-slate-400">{row.order.formattedPurchaseOrderId}</span>
                            <span className="text-slate-300">·</span>
                            <span>{formatDate(row.order.date)}</span>
                          </div>
                          {supplierName && <div className="truncate text-slate-500">{supplierName}</div>}
                          <div className="font-medium text-slate-600 truncate">
                            {row.order.costCenterId} {costCenterName}
                          </div>
                        </div>

                        {/* Quantidades (dados do Sienge) */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-slate-50 rounded-lg px-2 py-2">
                            <p className="text-slate-400 text-[10px] uppercase tracking-wide">Pedido</p>
                            <p className="font-bold text-slate-700 text-sm leading-tight">
                              {row.item.quantity.toLocaleString("pt-BR")}
                              <span className="text-[10px] font-normal text-slate-400 ml-0.5">{row.item.unitOfMeasure}</span>
                            </p>
                          </div>
                          <div className={`rounded-lg px-2 py-2 ${!schedulesLoaded ? "bg-slate-50" : pct >= 100 ? "bg-emerald-50" : pct > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
                            <p className={`text-[10px] uppercase tracking-wide ${!schedulesLoaded ? "text-slate-400" : pct >= 100 ? "text-emerald-500" : pct > 0 ? "text-amber-500" : "text-slate-400"}`}>Chegou</p>
                            {!schedulesLoaded ? (
                              <div className="h-4 w-10 bg-slate-200 rounded animate-pulse mt-0.5" />
                            ) : (
                              <p className={`font-bold text-sm leading-tight ${pct >= 100 ? "text-emerald-700" : pct > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                {siengeDelivered > 0 ? siengeDelivered.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—"}
                                {siengeDelivered > 0 && <span className="text-[10px] font-normal ml-0.5">{row.item.unitOfMeasure}</span>}
                              </p>
                            )}
                          </div>
                          <div className={`rounded-lg px-2 py-2 ${!schedulesLoaded ? "bg-slate-50" : siengeOpen <= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                            <p className={`text-[10px] uppercase tracking-wide ${!schedulesLoaded ? "text-slate-400" : siengeOpen <= 0 ? "text-emerald-500" : "text-red-400"}`}>Saldo</p>
                            {!schedulesLoaded ? (
                              <div className="h-4 w-10 bg-slate-200 rounded animate-pulse mt-0.5" />
                            ) : (
                              <p className={`font-bold text-sm leading-tight ${siengeOpen <= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                {siengeOpen > 0 ? siengeOpen.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "0"}
                                <span className="text-[10px] font-normal ml-0.5">{row.item.unitOfMeasure}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Barra de progresso (Sienge) */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>{schedulesLoaded ? (pct > 0 ? "Entregue pelo fornecedor" : "Aguardando entrega") : "Carregando..."}</span>
                            {schedulesLoaded && <span className={pct >= 100 ? "text-emerald-600 font-medium" : pct > 0 ? "text-amber-600 font-medium" : ""}>{pct}%</span>}
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            {/* eslint-disable-next-line react/forbid-component-props */}
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        {/* Histórico de registros locais */}
                        {confs.length > 0 && (
                          <div className="border-t border-slate-100 pt-2 space-y-1.5">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Registros da obra</p>
                            {confs.map((conf) => (
                              <div key={conf.id} className="flex items-start justify-between gap-2 text-xs">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="font-medium text-slate-700">
                                      {conf.quantity != null ? `${conf.quantity.toLocaleString("pt-BR")} ${row.item.unitOfMeasure}` : "—"}
                                    </span>
                                    <span className="text-slate-400 ml-1">· {conf.confirmedBy}</span>
                                    {conf.notes && <div className="text-[10px] text-slate-400 truncate">{conf.notes}</div>}
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                                  {new Date(conf.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Botão */}
                        <Button
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm mt-auto"
                          onClick={() => setArrivalDialog({ orderId: row.order.id, itemNumber: row.item.itemNumber, description: row.item.resourceDescription })}
                        >
                          <Truck className="h-4 w-4 mr-2" />
                          Registrar Chegada
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Dialog: Registrar Chegada de Insumo */}
      <Dialog
        open={!!arrivalDialog}
        onOpenChange={(o) => {
          if (!o) {
            setArrivalDialog(null);
            setArrivalForm({ confirmedBy: "", quantity: "", notes: "", file: null });
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Registrar Chegada de Insumo</DialogTitle>
            {arrivalDialog && (
              <p className="text-xs text-slate-500 mt-0.5">{arrivalDialog.description}</p>
            )}
          </DialogHeader>
          {(() => {
            const prevConfs = arrivalDialog
              ? (orderArrivalConfs[arrivalDialog.orderId] || []).filter(c => c.itemNumber === arrivalDialog.itemNumber)
              : [];
            const hasHistory = prevConfs.length > 0;
            return (
              <div className={`mt-1 flex gap-5 ${hasHistory ? "items-start" : ""}`}>
                {/* Formulário */}
                <div className={`space-y-3 ${hasHistory ? "flex-1 min-w-0" : "w-full"}`}>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600">Registrado por *</label>
                      <Input
                        value={arrivalForm.confirmedBy}
                        onChange={e => setArrivalForm(p => ({ ...p, confirmedBy: e.target.value }))}
                        placeholder="Seu nome"
                        className="mt-1"
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-xs font-medium text-slate-600">Qtde chegou</label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={arrivalForm.quantity}
                        onChange={e => setArrivalForm(p => ({ ...p, quantity: e.target.value }))}
                        placeholder="Ex: 30"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Observação *</label>
                    <textarea
                      value={arrivalForm.notes}
                      onChange={e => setArrivalForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Ex: Material chegou completo, aguardando lançamento de nota pelo escritório..."
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Foto / PDF da Nota Fiscal *</label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      className="mt-1 cursor-pointer"
                      onChange={e => setArrivalForm(p => ({ ...p, file: e.target.files?.[0] || null }))}
                    />
                    {arrivalForm.file && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {arrivalForm.file.name} ({(arrivalForm.file.size / 1024).toFixed(0)} KB)
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setArrivalDialog(null); setArrivalForm({ confirmedBy: "", quantity: "", notes: "", file: null }); }}
                      disabled={submittingArrival}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={submittingArrival || !arrivalForm.confirmedBy.trim() || !arrivalForm.notes.trim() || !arrivalForm.file}
                      onClick={handleArrivalSubmit}
                    >
                      {submittingArrival
                        ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Enviando...</>
                        : "Registrar Chegada"}
                    </Button>
                  </div>
                </div>

                {/* Painel de histórico (lado direito) */}
                {hasHistory && (
                  <div className="w-64 border-l pl-5 flex flex-col">
                    <p className="text-[11px] font-semibold text-slate-500 mb-0.5">Registros anteriores</p>
                    <p className="text-[10px] text-slate-400 mb-2">Clique para preencher o formulário</p>
                    <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
                      {prevConfs.map(c => (
                        <div
                          key={c.id}
                          className="text-xs bg-slate-50 rounded p-2 border border-slate-100 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                          onClick={() => setArrivalForm(p => ({
                            ...p,
                            confirmedBy: c.confirmedBy,
                            quantity: c.quantity != null ? String(c.quantity) : "",
                            notes: c.notes,
                          }))}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-medium text-slate-700 group-hover:text-blue-700">{c.confirmedBy}</span>
                            {c.quantity != null && (
                              <span className="text-[10px] font-semibold bg-green-100 text-green-700 rounded px-1.5 py-0.5 shrink-0">{c.quantity.toLocaleString("pt-BR")} un</span>
                            )}
                          </div>
                          <p className="text-slate-400 text-[10px] mb-0.5">{new Date(c.createdAt).toLocaleString("pt-BR")}</p>
                          <p className="text-slate-600 line-clamp-2">{c.notes}</p>
                          <a
                            href={`/api/arrival-confirmations/${c.id}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline text-[11px] mt-1 inline-block"
                            onClick={e => e.stopPropagation()}
                          >
                            Ver nota fiscal
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
