"use client";

import { ContasTable } from "@/components/contas-table";

export default function ContasVencidasPage() {
  return (
    <ContasTable
      mode="vencidas"
      title="Contas Vencidas"
      subtitle="Parcelas vencidas"
    />
  );
}
