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
import { Search, RefreshCw, Save, Plus, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { SiengeCompany } from "@/types/sienge";
import { toast } from "sonner";

interface CompanySetting {
  companyId: number;
  companyName: string;
  areaM2: number;
  factor: number;
  status: string;
}

interface EditRow {
  companyId: number;
  companyName: string;
  areaM2: string;
  factor: string;
  status: string;
}

export default function EmpreendimentosPage() {
  const [companies, setCompanies] = useState<SiengeCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<EditRow[]>([]);
  const [showAddRow, setShowAddRow] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [companiesRes, settingsRes] = await Promise.all([
        fetch("/api/sienge/companies?limit=100&offset=0"),
        fetch("/api/company-settings"),
      ]);
      const companiesData = await companiesRes.json();
      const settingsData = await settingsRes.json();

      const allCompanies: SiengeCompany[] = companiesData.results || [];
      const allSettings: CompanySetting[] = settingsData.data || [];

      setCompanies(allCompanies);

      // Build rows from saved settings
      setRows(
        allSettings.map((s) => ({
          companyId: s.companyId,
          companyName: s.companyName,
          areaM2: String(s.areaM2),
          factor: String(s.factor),
          status: s.status || "ativa",
        }))
      );
    } catch {
      setError(true);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const availableCompanies = companies.filter(
    (c) => !rows.some((r) => r.companyId === c.id)
  );

  const handleAddCompany = (company: SiengeCompany) => {
    setRows((prev) => [
      ...prev,
      {
        companyId: company.id,
        companyName: company.name,
        areaM2: "0",
        factor: "1",
        status: "ativa",
      },
    ]);
    setShowAddRow(false);
  };

  const handleRemoveRow = async (companyId: number) => {
    try {
      await fetch(`/api/company-settings?companyId=${companyId}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.companyId !== companyId));
      toast.success("Empreendimento removido");
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const updateRow = (companyId: number, field: "areaM2" | "factor", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.companyId === companyId ? { ...r, [field]: value } : r))
    );
  };

  const toggleStatus = (companyId: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.companyId === companyId
          ? { ...r, status: r.status === "ativa" ? "finalizada" : "ativa" }
          : r
      )
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(
        rows.map((r) =>
          fetch("/api/company-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: r.companyId,
              companyName: r.companyName,
              areaM2: parseFloat(r.areaM2) || 0,
              factor: parseFloat(r.factor) || 1,
              status: r.status,
            }),
          })
        )
      );
      toast.success("Configuracoes salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar configuracoes");
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter(
    (r) =>
      r.companyName.toLowerCase().includes(search.toLowerCase()) ||
      String(r.companyId).includes(search)
  );

  const ativasCount = rows.filter((r) => r.status === "ativa").length;
  const finalizadasCount = rows.filter((r) => r.status === "finalizada").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Empreendimentos</h1>
          <p className="text-slate-500 mt-1">
            Configure a metragem (M²), fator e status de cada empreendimento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-sm">
            {ativasCount} ativas
          </Badge>
          <Badge className="bg-slate-200 text-slate-500 hover:bg-slate-200 text-sm">
            {finalizadasCount} finalizadas
          </Badge>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou codigo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddRow(!showAddRow)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={saving || rows.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Tudo
              </Button>
            </div>
          </div>

          {/* Add company dropdown */}
          {showAddRow && (
            <div className="mt-3 border rounded-lg p-3 bg-slate-50 max-h-60 overflow-y-auto">
              <p className="text-xs text-slate-500 mb-2 font-medium">Selecione um empreendimento para adicionar:</p>
              {availableCompanies.length === 0 ? (
                <p className="text-sm text-slate-400">Todos os empreendimentos ja foram adicionados</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {availableCompanies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAddCompany(c)}
                      className="text-left px-3 py-2 rounded-md hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors"
                    >
                      <span className="font-mono text-xs text-slate-400 mr-2">{c.id}</span>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {error && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-1">Erro ao carregar dados</h3>
              <p className="text-slate-500 mb-4 text-center">Nao foi possivel conectar. Verifique sua conexao.</p>
              <Button variant="outline" onClick={fetchData}>Tentar novamente</Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow>
                  <TableHead className="w-20">Cod</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="w-32 text-center">Status</TableHead>
                  <TableHead className="w-40 text-right">M²</TableHead>
                  <TableHead className="w-32 text-right">Fator</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-28 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      </TableRow>
                    ))
                  : filtered.map((row) => (
                      <TableRow
                        key={row.companyId}
                        className={row.status === "finalizada" ? "bg-slate-50/50 opacity-70 hover:opacity-100" : "hover:bg-slate-50"}
                      >
                        <TableCell className="font-mono text-sm text-slate-500">
                          {row.companyId}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.companyName}
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() => toggleStatus(row.companyId)}
                            className="inline-flex items-center gap-1.5 transition-colors"
                          >
                            {row.status === "ativa" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer">
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                                Ativa
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-200 text-slate-500 hover:bg-slate-300 cursor-pointer">
                                <span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5" />
                                Finalizada
                              </Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={row.areaM2}
                            onChange={(e) => updateRow(row.companyId, "areaM2", e.target.value)}
                            className="w-32 text-right ml-auto h-8"
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={row.factor}
                            onChange={(e) => updateRow(row.companyId, "factor", e.target.value)}
                            className="w-24 text-right ml-auto h-8"
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRow(row.companyId)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      {rows.length === 0
                        ? "Nenhum empreendimento configurado. Clique em \"Adicionar\" para comecar."
                        : "Nenhum empreendimento encontrado"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
