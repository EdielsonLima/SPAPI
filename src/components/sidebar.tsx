"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  ClipboardList,
  Building,
  Landmark,
  FileSpreadsheet,
  Ruler,
  DollarSign,
  Receipt,
  AlertTriangle,
  Package,
  ShoppingCart,
  BarChart3,
  CheckCircle,
  Settings,
  ArrowDownLeft,
  CircleCheck,
  UserX,
  Ban,
} from "lucide-react";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SiengeOutcome } from "@/types/sienge";

interface MenuItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: { label: string; href: string; icon: React.ReactNode }[];
}

const menuItems: MenuItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "Financeiro",
    icon: <DollarSign className="h-5 w-5" />,
    children: [
      {
        label: "Painel Executivo",
        href: "/financeiro/painel-executivo",
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        label: "Contas a Pagar",
        href: "/financeiro/contas-pagar",
        icon: <Receipt className="h-4 w-4" />,
      },
      {
        label: "Contas Pagas",
        href: "/financeiro/contas-pagas",
        icon: <CheckCircle className="h-4 w-4" />,
      },
      {
        label: "Contas Vencidas",
        href: "/financeiro/contas-vencidas",
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        label: "Contas a Receber",
        href: "/financeiro/contas-receber",
        icon: <ArrowDownLeft className="h-4 w-4" />,
      },
      {
        label: "Contas Recebidas",
        href: "/financeiro/contas-recebidas",
        icon: <CircleCheck className="h-4 w-4" />,
      },
      {
        label: "Inadimplentes",
        href: "/financeiro/inadimplentes",
        icon: <UserX className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Suprimentos",
    icon: <Package className="h-5 w-5" />,
    children: [
      {
        label: "Solicitacoes",
        href: "/suprimentos/solicitacoes",
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        label: "Pedidos",
        href: "/suprimentos/pedidos",
        icon: <ShoppingCart className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Configuracoes",
    icon: <Settings className="h-5 w-5" />,
    children: [
      {
        label: "Empresas",
        href: "/cadastros/empresas",
        icon: <Building className="h-4 w-4" />,
      },
      {
        label: "Centros de Custo",
        href: "/cadastros/centros-custo",
        icon: <Landmark className="h-4 w-4" />,
      },
      {
        label: "Plano Financeiro",
        href: "/cadastros/plano-financeiro",
        icon: <FileSpreadsheet className="h-4 w-4" />,
      },
      {
        label: "Empreendimentos",
        href: "/cadastros/empreendimentos",
        icon: <Ruler className="h-4 w-4" />,
      },
      {
        label: "Exclusao de Titulos",
        href: "/cadastros/exclusoes",
        icon: <Ban className="h-4 w-4" />,
      },
      {
        label: "DRE",
        href: "/cadastros/dre",
        icon: <BarChart3 className="h-4 w-4" />,
      },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<string[]>(["Financeiro"]);
  const [overdueCount, setOverdueCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const today = new Date();
    const endDate = today.toISOString().split("T")[0];
    const startDate = `${today.getFullYear()}-01-01`;
    fetch(`/api/sienge/outcome?startDate=${startDate}&endDate=${endDate}`)
      .then((res) => res.json())
      .then((json: { data: SiengeOutcome[] }) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const count = (json.data || []).filter((item) => {
          return new Date(item.dueDate) < now && item.balanceAmount > 0;
        }).length;
        setOverdueCount(count);
      })
      .catch(() => {});
  }, []);

  const toggleSubmenu = (label: string) => {
    setOpenSubmenus((prev) =>
      prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label]
    );
  };

  const isActive = (href: string) => pathname === href;
  const isChildActive = (children?: MenuItem["children"]) =>
    children?.some((child) => pathname === child.href) ?? false;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out relative",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {/* Logo + Toggle */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white overflow-hidden">
              <Image src="/logo-icon.jpg" alt="Logo" width={32} height={32} className="object-contain" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold truncate">{process.env.NEXT_PUBLIC_COMPANY_NAME || "Empresa"}</span>
                <span className="text-[10px] text-slate-400 truncate">
                  {process.env.NEXT_PUBLIC_COMPANY_SUBTITLE || "Sistema de Gestao"}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center h-8 w-8 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => {
            if (item.href) {
              const active = isActive(item.href);
              const linkContent = (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-red-600/20 text-red-400 border-l-2 border-red-400 -ml-px"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return linkContent;
            }

            // Submenu
            const isOpen = openSubmenus.includes(item.label);
            const childActive = isChildActive(item.children);

            return (
              <div key={item.label}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 w-full",
                          childActive
                            ? "bg-red-600/20 text-red-400"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        )}
                        onClick={() => setCollapsed(false)}
                      >
                        <span className="shrink-0">{item.icon}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <>
                    <button
                      onClick={() => toggleSubmenu(item.label)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 w-full",
                        childActive
                          ? "bg-red-600/10 text-red-400"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="truncate flex-1 text-left">
                        {item.label}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        isOpen ? "max-h-96 mt-1" : "max-h-0"
                      )}
                    >
                      <div className="ml-4 pl-3 border-l border-slate-700 space-y-1">
                        {item.children?.map((child) => {
                          const childIsActive = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                                childIsActive
                                  ? "bg-red-600/20 text-red-400 font-medium"
                                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
                              )}
                            >
                              {child.icon}
                              <span className="truncate">{child.label}</span>
                              {child.label === "Contas Vencidas" && overdueCount > 0 && (
                                <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center ml-auto">
                                  {overdueCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </nav>

        <Separator className="bg-slate-800" />

        {!collapsed && (
          <div className="text-[10px] text-slate-500 text-center py-2">
            SPAPI v1.0.0
          </div>
        )}

      </aside>
    </TooltipProvider>
  );
}
