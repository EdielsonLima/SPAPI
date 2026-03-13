"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
  Loader2,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { SiengePurchaseRequest, SiengePurchaseRequestItem, SiengeDeliveryRequirement } from "@/types/sienge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_SIZE = 30;

// Status derivado dos itens da solicitação
type ItemStatus = "pendente" | "autorizado" | "reprovado" | "parcial";

function getGroupStatus(items: SiengePurchaseRequestItem[]): ItemStatus {
  if (items.length === 0) return "pendente";
  const allAuthorized = items.every((i) => i.authorized && !i.disapproved);
  const allDisapproved = items.every((i) => i.disapproved);
  const someAuthorized = items.some((i) => i.authorized);
  if (allAuthorized) return "autorizado";
  if (allDisapproved) return "reprovado";
  if (someAuthorized) return "parcial";
  return "pendente";
}

function GroupStatusBadge({ status }: { status: ItemStatus }) {
  if (status === "autorizado") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 font-medium">
        <CheckCircle2 className="h-3 w-3" /> Autorizado
      </Badge>
    );
  }
  if (status === "reprovado") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 font-medium">
        <XCircle className="h-3 w-3" /> Reprovado
      </Badge>
    );
  }
  if (status === "parcial") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 font-medium">
        <CheckCircle2 className="h-3 w-3" /> Parc. Autorizado
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 font-medium">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  );
}

function ItemStatusBadge({ item }: { item: SiengePurchaseRequestItem }) {
  if (item.disapproved) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-[10px]">
        <XCircle className="h-2.5 w-2.5" /> Reprovado
      </Badge>
    );
  }
  if (item.authorized) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px]">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Autorizado{item.competenceLevel != null && item.competenceLevel > 0 && ` (${item.competenceLevel}ª)`}
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-[10px]">
      <Clock className="h-2.5 w-2.5" /> Pendente
    </Badge>
  );
}

interface RequestGroup {
  id: number;
  items: SiengePurchaseRequestItem[];
  status: ItemStatus;
}

type StatusFilter = "todos" | "pendente" | "autorizado" | "reprovado" | "parcial";

export default function SolicitacoesPage() {
  const [allItems, setAllItems] = useState<SiengePurchaseRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetched, setFetched] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  // Details loaded per request (date, requester, etc.)
  const [requestDetails, setRequestDetails] = useState<Record<number, SiengePurchaseRequest>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const detailsRef = useRef(requestDetails);
  detailsRef.current = requestDetails;

  // Delivery requirements per item: key = "requestId:itemNumber"
  const [deliveryReqs, setDeliveryReqs] = useState<Record<string, SiengeDeliveryRequirement[]>>({});
  const [loadingDelivery, setLoadingDelivery] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [page, setPage] = useState(0);

  const fetchAll = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(false);
    if (forceRefresh) {
      setExpandedIds(new Set());
      setRequestDetails({});
    }
    setAllItems([]);
    setFetched(0);
    setTotal(0);

    try {
      const apiLimit = 200;
      let offset = 0;
      const collected: SiengePurchaseRequestItem[] = [];

      while (true) {
        const res = await fetch(
          `/api/sienge/purchase-requests?limit=${apiLimit}&offset=${offset}`
        );
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        const results: SiengePurchaseRequestItem[] = data.results || [];
        collected.push(...results);
        const count: number = data.resultSetMetadata?.count ?? 0;
        setTotal(count);
        setFetched(collected.length);
        if (collected.length >= count || results.length === 0) break;
        offset += apiLimit;
        setLoadingMore(true);
      }

      setAllItems(collected);
      toast.success(`${collected.length} itens carregados`);
    } catch {
      setAllItems([]);
      setError(true);
      toast.error("Erro ao carregar dados do Sienge");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Group items by purchaseRequestId
  const groups: RequestGroup[] = (() => {
    const map = new Map<number, SiengePurchaseRequestItem[]>();
    for (const item of allItems) {
      const id = item.purchaseRequestId;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(item);
    }
    return Array.from(map.entries())
      .map(([id, items]) => ({ id, items, status: getGroupStatus(items) }))
      .sort((a, b) => b.id - a.id); // most recent first
  })();

  const counts = {
    todos: groups.length,
    pendente: groups.filter((g) => g.status === "pendente").length,
    parcial: groups.filter((g) => g.status === "parcial").length,
    autorizado: groups.filter((g) => g.status === "autorizado").length,
    reprovado: groups.filter((g) => g.status === "reprovado").length,
  };

  const filtered = groups.filter((g) => {
    const detail = requestDetails[g.id];
    const matchesSearch =
      search === "" ||
      String(g.id).includes(search) ||
      detail?.requesterUser?.toLowerCase().includes(search.toLowerCase()) ||
      g.items.some((i) => i.productDescription?.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "todos" || g.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleExpand = async (id: number) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
      setExpandedIds(next);
      return;
    }
    next.add(id);
    setExpandedIds(next);

    // Lazy-load request details if not yet loaded
    if (detailsRef.current[id]) return;
    setLoadingDetails((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/sienge/purchase-requests/${id}`);
      if (res.ok) {
        const data: SiengePurchaseRequest = await res.json();
        setRequestDetails((prev) => ({ ...prev, [id]: data }));
      }
    } catch {
      // Details not critical — continue without them
    } finally {
      setLoadingDetails((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  };

  const toggleItem = async (requestId: number, itemNumber: number) => {
    const key = `${requestId}:${itemNumber}`;
    const next = new Set(expandedItems);
    if (next.has(key)) {
      next.delete(key);
      setExpandedItems(next);
      return;
    }
    next.add(key);
    setExpandedItems(next);

    if (deliveryReqs[key]) return;
    setLoadingDelivery((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(
        `/api/sienge/purchase-requests/${requestId}/items/${itemNumber}/delivery-requirements`
      );
      if (res.ok) {
        const data = await res.json();
        setDeliveryReqs((prev) => ({ ...prev, [key]: data.results ?? [] }));
      }
    } catch {
      setDeliveryReqs((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingDelivery((prev) => {
        const s = new Set(prev);
        s.delete(key);
        return s;
      });
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Solicitações de Compra", 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Total: ${filtered.length} sol.  |  Pendentes: ${counts.pendente}  |  Parc. Autorizados: ${counts.parcial}  |  Autorizados: ${counts.autorizado}  |  Reprovados: ${counts.reprovado}`,
      14, 23
    );
    const rows: string[][] = [];
    for (const g of filtered) {
      const detail = requestDetails[g.id];
      for (const item of g.items) {
        rows.push([
          String(g.id),
          detail?.requestDate ? new Date(detail.requestDate + "T00:00:00").toLocaleDateString("pt-BR") : "-",
          detail?.requesterUser || "-",
          item.productDescription || "",
          item.quantity?.toLocaleString("pt-BR") ?? "-",
          item.unitySymbol || "",
          item.disapproved ? "Reprovado" : item.authorized ? `Autorizado (${item.competenceLevel ?? 0}ª)` : "Pendente",
        ]);
      }
    }
    autoTable(doc, {
      startY: 28,
      head: [["Nº Sol.", "Data", "Solicitante", "Insumo", "Qtde", "Un", "Status Item"]],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138] },
    });
    doc.save("solicitacoes-compra.pdf");
    toast.success("PDF exportado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Solicitações de Compra</h1>
          <p className="text-slate-500 mt-1">Solicitações registradas no Sienge</p>
        </div>
        <div className="flex items-center gap-3">
          {(loading || loadingMore) && (
            <span className="text-sm text-slate-400 flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {fetched} / {total || "..."} itens
            </span>
          )}
          <Badge variant="secondary" className="text-sm">
            {filtered.length} solicitações
          </Badge>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-5 gap-3">
        {(
          [
            { key: "todos",      label: "Todas",          color: "slate" },
            { key: "pendente",   label: "Pendente",        color: "amber" },
            { key: "parcial",    label: "Parc. Autorizado",color: "blue" },
            { key: "autorizado", label: "Autorizado",      color: "green" },
            { key: "reprovado",  label: "Reprovado",       color: "red" },
          ] as const
        ).map(({ key, label, color }) => (
          <button
            type="button"
            key={key}
            onClick={() => { setStatusFilter(key as StatusFilter); setPage(0); }}
            className={`rounded-lg border p-3 text-left transition-all ${
              statusFilter === key
                ? color === "amber" ? "border-amber-400 bg-amber-50"
                  : color === "blue"  ? "border-blue-400 bg-blue-50"
                  : color === "green" ? "border-green-400 bg-green-50"
                  : color === "red"   ? "border-red-400 bg-red-50"
                  : "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className={`text-2xl font-bold ${
              color === "amber" ? "text-amber-600"
              : color === "blue"  ? "text-blue-600"
              : color === "green" ? "text-green-600"
              : color === "red"   ? "text-red-600"
              : "text-slate-700"
            }`}>
              {loading ? <Skeleton className="h-7 w-10" /> : counts[key as keyof typeof counts]}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nº, solicitante ou insumo..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(0); }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="parcial">Parc. Autorizado</SelectItem>
                <SelectItem value="autorizado">Autorizado</SelectItem>
                <SelectItem value="reprovado">Reprovado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => fetchAll(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF} disabled={loading || filtered.length === 0}>
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
              <p className="text-slate-500 mb-4 text-center">
                Nao foi possivel conectar ao Sienge. Verifique sua conexao.
              </p>
              <Button variant="outline" onClick={() => fetchAll()}>Tentar novamente</Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="w-24">Nº Sol.</TableHead>
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead className="w-20 text-center">Itens</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
                        </TableRow>
                      ))
                    : paginated.map((group) => {
                        const isExpanded = expandedIds.has(group.id);
                        const detail = requestDetails[group.id];
                        const isLoadingDetail = loadingDetails.has(group.id);

                        return (
                          <Fragment key={group.id}>
                            <TableRow
                              className={`hover:bg-slate-50 cursor-pointer ${isExpanded ? "bg-blue-50/40" : ""}`}
                              onClick={() => toggleExpand(group.id)}
                            >
                              <TableCell className="text-slate-400">
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-blue-500" />
                                  : <ChevronRightIcon className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="font-mono text-sm font-semibold text-slate-700">
                                #{group.id}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {isLoadingDetail ? (
                                  <Skeleton className="h-4 w-20" />
                                ) : detail?.requestDate ? (
                                  new Date(detail.requestDate + "T00:00:00").toLocaleDateString("pt-BR")
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium text-slate-800">
                                {isLoadingDetail ? (
                                  <Skeleton className="h-4 w-32" />
                                ) : detail?.requesterUser || (
                                  <span className="text-slate-300 text-sm italic">Expanda para carregar</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-sm font-medium text-slate-600">
                                {group.items.length}
                              </TableCell>
                              <TableCell>
                                <GroupStatusBadge status={group.status} />
                              </TableCell>
                            </TableRow>

                            {/* Expanded items */}
                            {isExpanded && (
                              <TableRow className="bg-slate-50/60">
                                <TableCell colSpan={6} className="p-0">
                                  <div className="px-10 py-3 border-t border-blue-100">
                                    {detail && (
                                      <div className="flex gap-6 text-xs text-slate-500 mb-3 pb-2 border-b border-slate-200">
                                        {detail.requestDate && (
                                          <span><span className="font-medium text-slate-600">Data:</span> {new Date(detail.requestDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                                        )}
                                        {detail.requesterUser && (
                                          <span><span className="font-medium text-slate-600">Solicitante:</span> {detail.requesterUser}</span>
                                        )}
                                        {detail.buildingId && (
                                          <span><span className="font-medium text-slate-600">Obra:</span> {detail.buildingId}</span>
                                        )}
                                        {detail.notes && (
                                          <span><span className="font-medium text-slate-600">Obs:</span> {detail.notes}</span>
                                        )}
                                      </div>
                                    )}
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs text-slate-500 border-b border-slate-200">
                                          <th className="text-left pb-1.5 pr-4 font-medium w-4"><span className="sr-only">Expandir</span></th>
                                          <th className="text-left pb-1.5 pr-4 font-medium">Insumo</th>
                                          <th className="text-left pb-1.5 pr-4 font-medium hidden md:table-cell">Detalhe</th>
                                          <th className="text-left pb-1.5 pr-4 font-medium hidden lg:table-cell">Marca</th>
                                          <th className="text-right pb-1.5 pr-4 font-medium w-20">Qtde</th>
                                          <th className="text-left pb-1.5 pr-4 font-medium w-12">Un</th>
                                          <th className="text-left pb-1.5 font-medium w-36">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.items.map((item) => {
                                          const itemKey = `${group.id}:${item.itemNumber}`;
                                          const isItemExpanded = expandedItems.has(itemKey);
                                          const isLoadingReqs = loadingDelivery.has(itemKey);
                                          const reqs = deliveryReqs[itemKey];
                                          return (
                                            <Fragment key={item.itemNumber}>
                                              <tr
                                                className="border-b border-slate-100 last:border-0 hover:bg-slate-100/60 cursor-pointer"
                                                onClick={() => toggleItem(group.id, item.itemNumber)}
                                              >
                                                <td className="py-1.5 pr-2 text-slate-400">
                                                  {isItemExpanded
                                                    ? <ChevronDown className="h-3 w-3 text-blue-400" />
                                                    : <ChevronRightIcon className="h-3 w-3" />}
                                                </td>
                                                <td className="py-1.5 pr-4 font-medium text-slate-700">
                                                  {item.productDescription}
                                                </td>
                                                <td className="py-1.5 pr-4 text-slate-500 hidden md:table-cell">
                                                  {item.detailDescription || "-"}
                                                </td>
                                                <td className="py-1.5 pr-4 text-slate-500 hidden lg:table-cell">
                                                  {item.trademarkDescription || "-"}
                                                </td>
                                                <td className="py-1.5 pr-4 text-right font-medium text-slate-700">
                                                  {item.quantity?.toLocaleString("pt-BR")}
                                                </td>
                                                <td className="py-1.5 pr-4 text-slate-500">
                                                  {item.unitySymbol}
                                                </td>
                                                <td className="py-1.5">
                                                  <ItemStatusBadge item={item} />
                                                </td>
                                              </tr>
                                              {isItemExpanded && (
                                                <tr className="bg-blue-50/30">
                                                  <td colSpan={7} className="pb-2 pt-1 pl-8 pr-4">
                                                    {isLoadingReqs ? (
                                                      <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                        Carregando necessidades de entrega...
                                                      </div>
                                                    ) : reqs && reqs.length > 0 ? (
                                                      <table className="w-full text-xs mt-1">
                                                        <thead>
                                                          <tr className="text-slate-400 border-b border-blue-100">
                                                            <th className="text-left pb-1 pr-4 font-medium">Nº</th>
                                                            <th className="text-left pb-1 pr-4 font-medium">Data necessidade</th>
                                                            <th className="text-right pb-1 pr-4 font-medium">Qtde necessária</th>
                                                            <th className="text-right pb-1 pr-4 font-medium">Qtde atendida</th>
                                                            <th className="text-left pb-1 font-medium">Saldo aberto</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {reqs.map((req) => (
                                                            <tr key={req.deliveryRequirementNumber} className="border-b border-blue-50 last:border-0">
                                                              <td className="py-1 pr-4 text-slate-500">{req.deliveryRequirementNumber}</td>
                                                              <td className="py-1 pr-4 text-slate-600">
                                                                {new Date(req.requirementDate + "T00:00:00").toLocaleDateString("pt-BR")}
                                                              </td>
                                                              <td className="py-1 pr-4 text-right font-medium text-slate-700">
                                                                {req.requirementQuantity?.toLocaleString("pt-BR")}
                                                              </td>
                                                              <td className="py-1 pr-4 text-right text-slate-500">
                                                                {req.attendedQuantity?.toLocaleString("pt-BR") ?? "-"}
                                                              </td>
                                                              <td className="py-1">
                                                                {req.openQuantity === true ? (
                                                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] gap-1">
                                                                    <Clock className="h-2.5 w-2.5" /> Aberto
                                                                  </Badge>
                                                                ) : req.openQuantity === false ? (
                                                                  <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]">
                                                                    Cancelado
                                                                  </Badge>
                                                                ) : "-"}
                                                              </td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    ) : reqs ? (
                                                      <p className="text-xs text-slate-400 italic py-1">Nenhuma necessidade de entrega registrada.</p>
                                                    ) : null}
                                                  </td>
                                                </tr>
                                              )}
                                            </Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                  {!loading && paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        Nenhuma solicitação encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <p className="text-sm text-slate-500">
                    Página {page + 1} de {totalPages} · {filtered.length} solicitações
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                      Próximo <ChevronRight className="h-4 w-4" />
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
