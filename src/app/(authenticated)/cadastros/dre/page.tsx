"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface DreMapping {
  dreCategory: string;
  financialPlanId: string;
  financialPlanName: string;
}

interface FinancialPlan {
  id: string;
  name: string;
  tpConta?: string;
  flAtiva?: string;
}

const DRE_CATEGORIES = [
  { key: "receita_operacional", label: "1. RECEITA OPERACIONAL", description: "Vendas, servicos e outras receitas da atividade principal", color: "bg-emerald-50 border-emerald-200" },
  { key: "custo_variavel", label: "2. CUSTO VARIAVEL", description: "Custos diretamente ligados a producao/servico (materiais, mao de obra direta)", color: "bg-red-50 border-red-200" },
  { key: "custo_fixo", label: "4. CUSTO FIXO", description: "Custos que nao variam com a producao (aluguel, salarios administrativos)", color: "bg-orange-50 border-orange-200" },
  { key: "despesas_financeiras", label: "6. DESPESAS FINANCEIRAS", description: "Juros, tarifas bancarias, IOF e outras despesas financeiras", color: "bg-violet-50 border-violet-200" },
  { key: "despesas_tributarias", label: "7. DESPESAS TRIBUTARIAS", description: "Impostos, taxas e contribuicoes (IR, CSLL, PIS, COFINS)", color: "bg-pink-50 border-pink-200" },
  { key: "imobilizacoes", label: "9. IMOBILIZACOES", description: "Investimentos em ativos fixos (maquinas, equipamentos, imoveis)", color: "bg-slate-50 border-slate-200" },
  { key: "retiradas", label: "10. RETIRADAS", description: "Pro-labore, distribuicao de lucros e retiradas dos socios", color: "bg-amber-50 border-amber-200" },
  { key: "entradas_nao_operacionais", label: "12. ENTRADAS NAO OPERACIONAIS", description: "Receitas nao relacionadas a atividade principal (emprestimos, vendas de ativos)", color: "bg-teal-50 border-teal-200" },
  { key: "saidas_nao_operacionais", label: "13. SAIDAS NAO OPERACIONAIS", description: "Despesas nao operacionais (amortizacoes de emprestimos, etc.)", color: "bg-gray-50 border-gray-200" },
];

export default function DrePage() {
  const [mappings, setMappings] = useState<Record<string, DreMapping[]>>({});
  const [financialPlans, setFinancialPlans] = useState<FinancialPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mappingsRes, plansRes] = await Promise.all([
        fetch("/api/dre-mappings"),
        fetch("/api/sienge/financial-plans"),
      ]);
      const mappingsData = await mappingsRes.json();
      const plansData = await plansRes.json();
      setMappings(mappingsData.data || {});
      setFinancialPlans(Array.isArray(plansData) ? plansData : plansData.results || plansData.data || []);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // All currently mapped financial plan IDs
  const mappedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const arr of Object.values(mappings)) {
      for (const m of arr) ids.add(m.financialPlanId);
    }
    return ids;
  }, [mappings]);

  // Available plans (not yet mapped to any category)
  const availablePlans = useMemo(() =>
    financialPlans.filter(p => p.flAtiva === "S" && !mappedIds.has(p.id)),
    [financialPlans, mappedIds]
  );

  const filteredAvailable = useMemo(() => {
    if (!search) return availablePlans;
    const s = search.toLowerCase();
    return availablePlans.filter(p =>
      p.id.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)
    );
  }, [availablePlans, search]);

  const handleAdd = async (dreCategory: string, plan: FinancialPlan) => {
    setSavingCategory(dreCategory);
    try {
      const res = await fetch("/api/dre-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dreCategory,
          financialPlanId: plan.id,
          financialPlanName: plan.name,
        }),
      });
      if (!res.ok) throw new Error("API error");

      setMappings(prev => ({
        ...prev,
        [dreCategory]: [
          ...(prev[dreCategory] || []),
          { dreCategory, financialPlanId: plan.id, financialPlanName: plan.name },
        ],
      }));
      setOpenPopover(null);
      setSearch("");
      toast.success(`Conta ${plan.id} - ${plan.name} adicionada`);
    } catch {
      toast.error("Erro ao adicionar conta");
    } finally {
      setSavingCategory(null);
    }
  };

  const handleDelete = async (dreCategory: string, financialPlanId: string) => {
    try {
      const res = await fetch(
        `/api/dre-mappings?dreCategory=${dreCategory}&financialPlanId=${encodeURIComponent(financialPlanId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("API error");

      setMappings(prev => ({
        ...prev,
        [dreCategory]: (prev[dreCategory] || []).filter(m => m.financialPlanId !== financialPlanId),
      }));
      toast.success("Conta removida");
    } catch {
      toast.error("Erro ao remover conta");
    }
  };

  const totalMapped = Object.values(mappings).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuracao DRE</h1>
        <p className="text-sm text-slate-500 mt-1">
          Associe as contas do plano financeiro a cada categoria do DRE (Demonstracao do Resultado do Exercicio).
          As linhas calculadas (Lucro Bruto, Lucro Operacional, etc.) sao geradas automaticamente.
        </p>
        <Badge variant="secondary" className="mt-2">
          {totalMapped} {totalMapped === 1 ? "conta mapeada" : "contas mapeadas"}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {DRE_CATEGORIES.map(cat => {
            const items = mappings[cat.key] || [];
            return (
              <Card key={cat.key} className={`border shadow-sm ${cat.color}`}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{cat.label}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {items.length} {items.length === 1 ? "conta" : "contas"}
                      </Badge>
                      <Popover open={openPopover === cat.key} onOpenChange={(open) => {
                        setOpenPopover(open ? cat.key : null);
                        if (!open) setSearch("");
                      }}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={savingCategory === cat.key}
                          >
                            {savingCategory === cat.key ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Plus className="h-3 w-3 mr-1" />
                            )}
                            Adicionar
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="end">
                          <Command>
                            <CommandInput
                              placeholder="Buscar conta..."
                              value={search}
                              onValueChange={setSearch}
                            />
                            <CommandList>
                              <CommandEmpty>Nenhuma conta disponivel</CommandEmpty>
                              <CommandGroup>
                                {filteredAvailable.slice(0, 50).map(plan => (
                                  <CommandItem
                                    key={plan.id}
                                    value={`${plan.id} ${plan.name}`}
                                    onSelect={() => handleAdd(cat.key, plan)}
                                    className="cursor-pointer"
                                  >
                                    <span className="text-xs text-slate-400 font-mono mr-2 min-w-[80px]">{plan.id}</span>
                                    <span className="text-sm">{plan.name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </CardHeader>
                {items.length > 0 && (
                  <CardContent className="pt-0 pb-3 px-5">
                    <div className="space-y-1">
                      {items.map(m => (
                        <div
                          key={m.financialPlanId}
                          className="flex items-center justify-between py-1.5 px-3 rounded-md bg-white/80 border border-slate-100"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono">{m.financialPlanId}</span>
                            <span className="text-sm text-slate-700">{m.financialPlanName}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(cat.key, m.financialPlanId)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
