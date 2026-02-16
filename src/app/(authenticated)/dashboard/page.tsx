"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, Landmark, FileSpreadsheet, TrendingUp } from "lucide-react";

interface DashboardStats {
  companies: number;
  costCenters: number;
  financialPlans: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [companiesRes, costCentersRes, financialPlansRes] =
          await Promise.allSettled([
            fetch("/api/sienge/companies?limit=1&offset=0"),
            fetch("/api/sienge/cost-centers?limit=1&offset=0"),
            fetch("/api/sienge/financial-plans?limit=1&offset=0"),
          ]);

        const getCount = async (res: PromiseSettledResult<Response>) => {
          if (res.status === "fulfilled" && res.value.ok) {
            const data = await res.value.json();
            if (Array.isArray(data)) return data.length;
            return data.resultSetMetadata?.count ?? 0;
          }
          return 0;
        };

        setStats({
          companies: await getCount(companiesRes),
          costCenters: await getCount(costCentersRes),
          financialPlans: await getCount(financialPlansRes),
        });
      } catch {
        setStats({ companies: 0, costCenters: 0, financialPlans: 0 });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const cards = [
    {
      title: "Empresas",
      value: stats?.companies ?? 0,
      icon: Building,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Centros de Custo",
      value: stats?.costCenters ?? 0,
      icon: Landmark,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Planos Financeiros",
      value: stats?.financialPlans ?? 0,
      icon: FileSpreadsheet,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Visao geral do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {card.title}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-slate-800 mt-1">
                      {card.value}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-xl ${card.bg}`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Dados do Sienge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">
            Os dados exibidos sao sincronizados em tempo real com o ERP Sienge.
            Navegue pelo menu lateral para acessar os cadastros detalhados.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
