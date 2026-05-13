"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Menu, Sun, Moon, Bell, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface BudgetAlert {
  count: number;
  valor: number;
  companies: { companyName: string; count: number; valor: number }[];
}

const pathLabels: Record<string, string[]> = {
  "/dashboard": ["Dashboard"],
  "/cadastros/empresas": ["Cadastros", "Empresas"],
  "/cadastros/centros-custo": ["Cadastros", "Centros de Custo"],
  "/cadastros/plano-financeiro": ["Cadastros", "Plano Financeiro"],
  "/financeiro/contas-pagar": ["Financeiro", "Contas a Pagar"],
  "/financeiro/contas-vencidas": ["Financeiro", "Contas Vencidas"],
  "/financeiro/contas-receber": ["Financeiro", "Contas a Receber"],
  "/financeiro/contas-recebidas": ["Financeiro", "Contas Recebidas"],
  "/financeiro/inadimplentes": ["Financeiro", "Inadimplentes"],
  "/suprimentos/pedidos": ["Suprimentos", "Pedidos"],
};

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const userName = session?.user?.name || "Usuario";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const breadcrumbSegments = pathLabels[pathname] || [];

  const [alert, setAlert] = useState<BudgetAlert | null>(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/alerts/budget-missing")
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (!cancelled && json && typeof json.count === "number") setAlert(json); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border/40 dark:border-slate-700/40 bg-white/70 dark:bg-slate-900/50 supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-slate-900/40 backdrop-blur-xl flex items-center justify-between px-4 md:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[260px]">
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex items-center min-w-0">
        {breadcrumbSegments.length > 0 && (
          <>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate md:hidden">
              {breadcrumbSegments[breadcrumbSegments.length - 1]}
            </span>
            <nav className="text-sm hidden md:flex items-center gap-1">
              {breadcrumbSegments.map((segment, index) => {
                const isLast = index === breadcrumbSegments.length - 1;
                return (
                  <span key={index} className="flex items-center gap-1">
                    {index > 0 && <span className="text-slate-300 dark:text-slate-600">{">"}</span>}
                    <span className={isLast ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}>
                      {segment}
                    </span>
                  </span>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="h-9 w-9 mr-2"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Alternar tema</span>
      </Button>

      {/* Alerts (budget-missing) */}
      {alert && alert.count > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 mr-2 relative" title={`${alert.count} parcelas sem Item de Orçamento`}>
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {alert.count > 99 ? "99+" : alert.count}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[360px]">
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <p className="text-sm font-semibold">Parcelas sem Item de Orçamento</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {alert.count} parcela{alert.count === 1 ? "" : "s"} · {formatCurrency(alert.valor)}
              </p>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {alert.companies.map((c) => (
                <Link
                  key={c.companyName}
                  href={`/financeiro/contas-pagar?filtroOrc=sem-item&empresa=${encodeURIComponent(c.companyName)}`}
                  className="flex items-start justify-between gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{c.companyName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.count} parcela{c.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap">
                    {formatCurrency(c.valor)}
                  </span>
                </Link>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/financeiro/contas-pagar?filtroOrc=sem-item" className="flex items-center justify-center text-xs text-blue-600 dark:text-blue-400 font-medium py-1.5">
                Ver todas em Contas a Pagar
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 h-10 px-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={session?.user?.image || undefined} alt={userName} />
              <AvatarFallback className="bg-blue-600 text-white text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 hidden sm:inline">
              {userName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">
              {session?.user?.email}
            </p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600 cursor-pointer" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
