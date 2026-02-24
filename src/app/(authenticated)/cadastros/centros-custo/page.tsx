"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Search, ChevronLeft, ChevronRight, RefreshCw, FileDown, AlertCircle } from "lucide-react";
import { SiengeCostCenter } from "@/types/sienge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function CentrosCustoPage() {
  const [items, setItems] = useState<SiengeCostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/sienge/cost-centers?limit=${limit}&offset=${offset}`
      );
      const data = await res.json();
      setItems(data.results || []);
      setTotalCount(data.resultSetMetadata?.count || 0);
    } catch {
      setItems([]);
      setError(true);
      toast.error("Erro ao carregar dados do Sienge");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    toast.info("Atualizando dados direto do Sienge...");
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/sienge/cost-centers?limit=${limit}&offset=${offset}&forceRefresh=true`
      );
      const data = await res.json();
      setItems(data.results || []);
      setTotalCount(data.resultSetMetadata?.count || 0);
      toast.success("Dados atualizados do Sienge!");
    } catch {
      setItems([]);
      setError(true);
      toast.error("Erro ao carregar dados do Sienge");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Centros de Custo - Silva Packer", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["ID", "Nome", "CNPJ", "ID Empresa"]],
      body: filtered.map((item) => [
        item.id,
        item.name || "",
        item.cnpj || "",
        item.idCompany ?? "",
      ]),
    });
    doc.save("centros-custo.pdf");
    toast.success("PDF exportado com sucesso!");
  };

  const filtered = items.filter((item) =>
    item.name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Centros de Custo
          </h1>
          <p className="text-slate-500 mt-1">
            Centros de custo cadastrados no Sienge
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {totalCount} registros
        </Badge>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome..."
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
              <Button variant="outline" onClick={fetchData}>Tentar novamente</Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="w-32">ID Empresa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        </TableRow>
                      ))
                    : filtered.map((item) => (
                        <TableRow key={item.id} className="hover:bg-slate-50">
                          <TableCell className="font-mono text-sm">
                            {item.id}
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.cnpj || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.idCompany ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-slate-500"
                      >
                        Nenhum centro de custo encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <p className="text-sm text-slate-500">
                    Pagina {currentPage} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + limit >= totalCount}
                      onClick={() => setOffset(offset + limit)}
                    >
                      Proximo
                      <ChevronRight className="h-4 w-4" />
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
