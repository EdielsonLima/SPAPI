"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Loader2, Plus, Ban } from "lucide-react";
import { SiengeCompany } from "@/types/sienge";
import { toast } from "sonner";

interface BillExclusion {
  companyId: number;
  billId: number;
  companyName: string;
  reason: string;
  createdAt: string;
}

export default function ExclusoesPage() {
  const [exclusions, setExclusions] = useState<BillExclusion[]>([]);
  const [companies, setCompanies] = useState<SiengeCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Form state
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [newBillId, setNewBillId] = useState("");
  const [newReason, setNewReason] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [exclRes, compRes] = await Promise.all([
        fetch("/api/bill-exclusions"),
        fetch("/api/sienge/companies?limit=200&offset=0"),
      ]);
      const exclData = await exclRes.json();
      const compData = await compRes.json();
      setExclusions(exclData.data || []);
      setCompanies(compData.results || []);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search) return exclusions;
    const s = search.toLowerCase();
    return exclusions.filter(
      (e) =>
        e.companyName.toLowerCase().includes(s) ||
        String(e.billId).includes(s) ||
        e.reason.toLowerCase().includes(s)
    );
  }, [exclusions, search]);

  const handleAdd = async () => {
    if (!selectedCompanyId || !newBillId) {
      toast.error("Selecione a empresa e informe o numero do titulo");
      return;
    }

    const company = companies.find((c) => String(c.id) === selectedCompanyId);
    if (!company) {
      toast.error("Empresa nao encontrada");
      return;
    }

    const billId = parseInt(newBillId, 10);
    if (isNaN(billId) || billId <= 0) {
      toast.error("Numero do titulo invalido");
      return;
    }

    // Check if already exists
    if (exclusions.some((e) => e.companyId === company.id && e.billId === billId)) {
      toast.error("Este titulo ja esta na lista de exclusoes");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/bill-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          billId,
          companyName: company.name,
          reason: newReason.trim(),
        }),
      });

      if (!res.ok) throw new Error("API error");

      setExclusions((prev) => [
        ...prev,
        {
          companyId: company.id,
          billId,
          companyName: company.name,
          reason: newReason.trim(),
          createdAt: new Date().toISOString(),
        },
      ]);

      setNewBillId("");
      setNewReason("");
      toast.success(`Titulo ${billId} da empresa ${company.name} adicionado a lista de exclusoes`);
    } catch {
      toast.error("Erro ao salvar exclusao");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (companyId: number, billId: number) => {
    try {
      const res = await fetch(
        `/api/bill-exclusions?companyId=${companyId}&billId=${billId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("API error");

      setExclusions((prev) =>
        prev.filter((e) => !(e.companyId === companyId && e.billId === billId))
      );
      toast.success(`Titulo ${billId} removido da lista de exclusoes`);
    } catch {
      toast.error("Erro ao remover exclusao");
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Exclusao de Titulos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure quais titulos devem ser excluidos dos calculos financeiros (contas recebidas, contas pagas, etc.)
        </p>
      </div>

      {/* Add Form */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-700">Adicionar Exclusao</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[250px] flex-1">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Empresa</label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.id} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[140px]">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Titulo (Bill ID)</label>
              <Input
                type="number"
                placeholder="Ex: 109"
                value={newBillId}
                onChange={(e) => setNewBillId(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Motivo (opcional)</label>
              <Input
                placeholder="Ex: Titulo cancelado"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="h-10"
              />
            </div>

            <Button
              onClick={handleAdd}
              disabled={saving || !selectedCompanyId || !newBillId}
              className="h-10 bg-red-700 hover:bg-red-800"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exclusions List */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-700">Titulos Excluidos</h2>
              <Badge variant="secondary" className="text-xs">
                {exclusions.length} {exclusions.length === 1 ? "titulo" : "titulos"}
              </Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar empresa ou titulo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Ban className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>{exclusions.length === 0 ? "Nenhum titulo excluido" : "Nenhum resultado encontrado"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs w-[100px]">Titulo</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                  <TableHead className="text-xs w-[120px]">Data</TableHead>
                  <TableHead className="text-xs w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={`${e.companyId}:${e.billId}`} className="hover:bg-slate-50/50">
                    <TableCell className="text-sm">
                      <span className="text-slate-400 text-xs mr-1">{e.companyId} -</span>
                      {e.companyName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{e.billId}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{e.reason || "-"}</TableCell>
                    <TableCell className="text-sm text-slate-400">{formatDate(e.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(e.companyId, e.billId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
