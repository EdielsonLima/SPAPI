"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { SiengePurchaseOrder } from "@/types/sienge";
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
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
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
  const limit = 200;
  const year = new Date().getFullYear();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/sienge/purchase-orders?limit=${limit}&offset=${offset}&startDate=${year}-01-01&endDate=${year}-12-31`
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
  }, [offset, year]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleRefresh = () => {
    toast.info("Atualizando pedidos...");
    fetchOrders();
  };

  const filtered = orders.filter(
    (o) =>
      o.formattedPurchaseOrderId?.toLowerCase().includes(search.toLowerCase()) ||
      o.buyerId?.toLowerCase().includes(search.toLowerCase()) ||
      String(o.supplierId).includes(search) ||
      String(o.id).includes(search) ||
      o.notes?.toLowerCase().includes(search.toLowerCase()) ||
      o.internalNotes?.toLowerCase().includes(search.toLowerCase())
  );

  const pageSize = 20;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const paginatedItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Pedidos de Compra - Silva Packer", 14, 16);
    doc.setFontSize(10);
    doc.text(`Periodo: ${year}`, 14, 22);
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
    doc.save(`pedidos-compra-${year}.pdf`);
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
            Pedidos de compra registrados no Sienge — {year}
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
                      <TableHead className="w-24">Fornecedor</TableHead>
                      <TableHead className="w-24">Centro Custo</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="text-right w-32">Valor Total</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 8 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      : paginatedItems.map((order) => (
                          <React.Fragment key={order.id}>
                            <TableRow
                              className={`hover:bg-slate-50 cursor-pointer ${expandedOrder === order.id ? "bg-blue-50/50" : ""}`}
                              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
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
                              <TableCell className="font-mono text-sm">
                                {order.supplierId}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {order.costCenterId}
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(order.status, order.authorized, order.disapproved)}
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
                                <TableCell colSpan={8} className="p-0">
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
                                    {!order.notes && !order.internalNotes && (
                                      <div className="text-xs text-slate-400">Nenhuma observacao registrada para este pedido.</div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                    {!loading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-500">
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
