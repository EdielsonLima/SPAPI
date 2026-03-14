"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

const pathLabels: Record<string, string[]> = {
  "/dashboard": ["Dashboard"],
  "/cadastros/empresas": ["Cadastros", "Empresas"],
  "/cadastros/centros-custo": ["Cadastros", "Centros de Custo"],
  "/cadastros/plano-financeiro": ["Cadastros", "Plano Financeiro"],
  "/financeiro/contas-pagar": ["Financeiro", "Contas a Pagar"],
  "/financeiro/contas-vencidas": ["Financeiro", "Contas Vencidas"],
  "/suprimentos/pedidos": ["Suprimentos", "Pedidos"],
};

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const userName = session?.user?.name || "Usuario";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const breadcrumbSegments = pathLabels[pathname] || [];

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-4 md:px-6">
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
            <span className="text-sm font-medium text-slate-700 truncate md:hidden">
              {breadcrumbSegments[breadcrumbSegments.length - 1]}
            </span>
            <nav className="text-sm hidden md:flex items-center gap-1">
              {breadcrumbSegments.map((segment, index) => {
                const isLast = index === breadcrumbSegments.length - 1;
                return (
                  <span key={index} className="flex items-center gap-1">
                    {index > 0 && <span className="text-slate-300">{">"}</span>}
                    <span className={isLast ? "font-medium text-slate-700" : "text-slate-500"}>
                      {segment}
                    </span>
                  </span>
                );
              })}
            </nav>
          </>
        )}
      </div>

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
            <span className="text-sm font-medium text-slate-700 hidden sm:inline">
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
