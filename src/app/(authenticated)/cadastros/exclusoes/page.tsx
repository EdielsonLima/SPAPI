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
  clientName: string;
  dueDate: string;
  originalAmount: number;
  observation: string;
  reason: string;
  createdAt: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    if (dateStr.includes("T")) {
      return new Date(dateStr).toLocaleDateString("pt-BR");
    }
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
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
  const [newClientName, setNewClientName] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newOriginalAmount, setNewOriginalAmount] = useState("");
  const [newObservation, setNewObservation] = useState("");
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
        e.clientName.toLowerCase().includes(s) ||
        e.reason.toLowerCase().includes(s) ||
        e.observation.toLowerCase().includes(s)
    );
  }, [exclusions, search]);

  const resetForm = () => {
    setNewBillId("");
    setNewClientName("");
    setNewDueDate("");
    setNewOriginalAmount("");
    setNewObservation("");
    setNewReason("");
  };

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

    if (exclusions.some((e) => e.companyId === company.id && e.billId === billId)) {
      toast.error("Este titulo ja esta na lista de exclusoes");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyId: company.id,
        billId,
        companyName: company.name,
        clientName: newClientName.trim(),
        dueDate: newDueDate,
        originalAmount: parseFloat(newOriginalAmount) || 0,
        observation: newObservation.trim(),
        reason: newReason.trim(),
      };

      const res = await fetch("/api/bill-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("API error");

      setExclusions((prev) => [
        ...prev,
        { ...payload, createdAt: new Date().toISOString() },
      ]);

      resetForm();
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Empresa *</label>
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

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Titulo (Bill ID) *</label>
              <Input
                type="number"
                placeholder="Ex: 109"
                value={newBillId}
                onChange={(e) => setNewBillId(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Cliente</label>
              <Input
                placeholder="Nome do cliente"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Dt. Vencimento</label>
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Valor Original</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={newOriginalAmount}
                onChange={(e) => setNewOriginalAmount(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Observacao</label>
              <Input
                placeholder="Observacao sobre o titulo"
                value={newObservation}
                onChange={(e) => setNewObservation(e.target.value)}
                className="h-10"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Motivo da Exclusao</label>
              <Input
                placeholder="Ex: Lancamento indevido"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleAdd}
              disabled={saving || !selectedCompanyId || !newBillId}
              className="h-10 bg-red-700 hover:bg-red-800"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar Exclusao
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
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar empresa, titulo ou cliente..."
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs">Empresa</TableHead>
                    <TableHead className="text-xs w-[80px]">Titulo</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs w-[110px]">Vencimento</TableHead>
                    <TableHead className="text-xs text-right w-[130px]">Valor Original</TableHead>
                    <TableHead className="text-xs">Observacao</TableHead>
                    <TableHead className="text-xs">Motivo</TableHead>
                    <TableHead className="text-xs w-[100px]">Excluido em</TableHead>
                    <TableHead className="text-xs w-[50px]" />
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
                      <TableCell className="text-sm">{e.clientName || "-"}</TableCell>
                      <TableCell className="text-sm font-mono">{formatDateBR(e.dueDate)}</TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {e.originalAmount > 0 ? formatCurrency(e.originalAmount) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{e.observation || "-"}</TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{e.reason || "-"}</TableCell>
                      <TableCell className="text-sm text-slate-400">{formatDateBR(e.createdAt)}</TableCell>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
