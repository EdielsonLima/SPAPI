"use client";

// Layout do módulo Comercial: um provider só para todas as rotas, para que
// filtros e dados carregados sobrevivam à troca de página no menu.
import { ComercialProvider } from "@/components/comercial-provider";

export default function ComercialLayout({ children }: { children: React.ReactNode }) {
  return <ComercialProvider>{children}</ComercialProvider>;
}
