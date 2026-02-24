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
import { SiengeCompany } from "@/types/sienge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<SiengeCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/sienge/companies?limit=${limit}&offset=${offset}`
      );
      const data = await res.json();
      setCompanies(data.results || []);
      setTotalCount(data.resultSetMetadata?.count || 0);
    } catch {
      setCompanies([]);
      setError(true);
      toast.error("Erro ao carregar dados do Sienge");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleRefresh = async () => {
    toast.info("Atualizando dados direto do Sienge...");
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/sienge/companies?limit=${limit}&offset=${offset}&forceRefresh=true`
      );
      const data = await res.json();
      setCompanies(data.results || []);
      setTotalCount(data.resultSetMetadata?.count || 0);
      toast.success("Dados atualizados do Sienge!");
    } catch {
      setCompanies([]);
      setError(true);
      toast.error("Erro ao carregar dados do Sienge");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Empresas - Silva Packer", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["ID", "Nome", "Nome Fantasia", "CNPJ", "Cidade", "UF"]],
      body: filtered.map((c) => [
        c.id,
        c.name || "",
        c.tradeName || "",
        c.cnpj || "",
        c.city || "",
        c.state || "",
      ]),
    });
    doc.save("empresas.pdf");
    toast.success("PDF exportado com sucesso!");
  };

  const filtered = companies.filter(
    (c) =>
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.tradeName?.toLowerCase().includes(search.toLowerCase()) ||
      c.cnpj?.includes(search)
  );

  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Empresas</h1>
          <p className="text-slate-500 mt-1">
            Empresas cadastradas no Sienge
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
                placeholder="Buscar por nome, razao social ou CNPJ..."
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
              <Button variant="outline" onClick={fetchCompanies}>Tentar novamente</Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Nome Fantasia</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>UF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        </TableRow>
                      ))
                    : filtered.map((company) => (
                        <TableRow key={company.id} className="hover:bg-slate-50">
                          <TableCell className="font-mono text-sm">
                            {company.id}
                          </TableCell>
                          <TableCell className="font-medium">
                            {company.name}
                          </TableCell>
                          <TableCell>{company.tradeName || "-"}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {company.cnpj || "-"}
                          </TableCell>
                          <TableCell>{company.city || "-"}</TableCell>
                          <TableCell>{company.state || "-"}</TableCell>
                        </TableRow>
                      ))}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        Nenhuma empresa encontrada
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
