"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building,
  Landmark,
  FileSpreadsheet,
  AlertCircle,
  CalendarClock,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SiengeOutcome } from "@/types/sienge";

const formatCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatDateTime(date: Date): string {
  const days = [
    "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado",
  ];
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${dayName}, ${day} de ${month} de ${year} - ${hours}:${minutes}`;
}

interface DashboardStats {
  companies: number;
  costCenters: number;
  financialPlans: number;
}

interface MonthlyData {
  month: string;
  total: number;
  isPast: boolean;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [outcomes, setOutcomes] = useState<SiengeOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [outcomeLoading, setOutcomeLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
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
      toast.error("Erro ao carregar estatísticas do dashboard");
      setStats({ companies: 0, costCenters: 0, financialPlans: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOutcomes = useCallback(async () => {
    try {
      const year = new Date().getFullYear();
      const endDate = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/sienge/outcome?startDate=${year}-01-01&endDate=${endDate}`);
      if (!res.ok) throw new Error("Erro ao buscar contas");
      const data = await res.json();
      const items: SiengeOutcome[] = Array.isArray(data) ? data : data.data ?? [];
      setOutcomes(items);
    } catch {
      toast.error("Erro ao carregar dados de contas a pagar");
      setOutcomes([]);
    } finally {
      setOutcomeLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchOutcomes();
  }, [fetchData, fetchOutcomes]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = sevenDaysLater.toISOString().split("T")[0];

  const overdue = outcomes.filter(
    (o) => o.dueDate < todayStr && o.balanceAmount > 0
  );
  const overdueTotal = overdue.reduce((sum, o) => sum + o.balanceAmount, 0);

  const upcoming = outcomes.filter(
    (o) => o.dueDate >= todayStr && o.dueDate <= sevenDaysStr && o.balanceAmount > 0
  );
  const upcomingTotal = upcoming.reduce((sum, o) => sum + o.balanceAmount, 0);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const monthlyData: MonthlyData[] = MONTH_LABELS.map((label, idx) => {
    const monthOutcomes = outcomes.filter((o) => {
      const d = new Date(o.dueDate + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === idx;
    });
    const total = monthOutcomes.reduce((sum, o) => sum + o.balanceAmount, 0);
    return { month: label, total, isPast: idx < currentMonth };
  });

  const userName = session?.user?.name || "Usuário";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Bem-vindo, {userName}!
        </h1>
        <p className="text-slate-500 mt-1">{currentTime ? formatDateTime(currentTime) : "\u00A0"}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Empresas",
            value: stats?.companies ?? 0,
            icon: Building,
            color: "text-blue-600",
            bg: "bg-blue-50",
            link: "/cadastros/empresas",
          },
          {
            title: "Centros de Custo",
            value: stats?.costCenters ?? 0,
            icon: Landmark,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            link: "/cadastros/centros-custo",
          },
          {
            title: "Planos Financeiros",
            value: stats?.financialPlans ?? 0,
            icon: FileSpreadsheet,
            color: "text-purple-600",
            bg: "bg-purple-50",
            link: "/cadastros/plano-financeiro",
          },
        ].map((card) => (
          <Card
            key={card.title}
            className="border-0 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200"
            onClick={() => router.push(card.link)}
          >
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200"
          onClick={() => router.push("/financeiro/contas-vencidas")}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Contas Vencidas
                </p>
                {outcomeLoading ? (
                  <>
                    <Skeleton className="h-8 w-32 mt-1" />
                    <Skeleton className="h-4 w-20 mt-2" />
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      {formatCurrency.format(overdueTotal)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {overdue.length} título{overdue.length !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </div>
              <div className="p-3 rounded-xl bg-red-50">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-0 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200"
          onClick={() => router.push("/financeiro/contas-pagar")}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Contas a Pagar - Próximos 7 dias
                </p>
                {outcomeLoading ? (
                  <>
                    <Skeleton className="h-8 w-32 mt-1" />
                    <Skeleton className="h-4 w-20 mt-2" />
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-amber-600 mt-1">
                      {formatCurrency.format(upcomingTotal)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {upcoming.length} título{upcoming.length !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </div>
              <div className="p-3 rounded-xl bg-amber-50">
                <CalendarClock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Contas a Pagar - Mensal ({currentYear})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outcomeLoading ? (
            <div className="flex items-end gap-2 h-[300px] pt-8">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2">
                  <Skeleton
                    className="w-full rounded"
                    style={{ height: `${40 + Math.random() * 160}px` }}
                  />
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  formatter={(value?: number) => [formatCurrency.format(value ?? 0), "Total"]}
                  labelFormatter={(label: string) => `Mês: ${label}`}
                  contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {monthlyData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.isPast ? "#ef4444" : "#3b82f6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Dados sincronizados com o Sienge
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
