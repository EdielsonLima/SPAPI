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
import { Search } from "lucide-react";
import { SiengePaymentCategory } from "@/types/sienge";

const tipoConta: Record<string, string> = {
  R: "Receita",
  T: "Titulo",
  D: "Despesa",
};

export default function PlanoFinanceiroPage() {
  const [items, setItems] = useState<SiengePaymentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sienge/financial-plans");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = items.filter(
    (item) =>
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Plano Financeiro
          </h1>
          <p className="text-slate-500 mt-1">
            Categorias de pagamento cadastradas no Sienge
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {items.length} registros
        </Badge>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por codigo ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow>
                  <TableHead className="w-32">Codigo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-28">Tipo Conta</TableHead>
                  <TableHead className="w-24">Redutora</TableHead>
                  <TableHead className="w-24">Ativa</TableHead>
                  <TableHead className="w-28">Adiantamento</TableHead>
                  <TableHead className="w-24">Imposto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
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
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {tipoConta[item.tpConta || ""] || item.tpConta || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={item.flRedutora === "S" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {item.flRedutora === "S" ? "Sim" : "Nao"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              item.flAtiva === "S"
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.flAtiva === "S" ? "Sim" : "Nao"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {item.flAdiantamento === "S" ? "Sim" : "Nao"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {item.flImposto === "S" ? "Sim" : "Nao"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-slate-500"
                    >
                      Nenhuma categoria encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
