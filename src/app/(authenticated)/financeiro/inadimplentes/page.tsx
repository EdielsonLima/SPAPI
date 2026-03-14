"use client";

import { ContasTable } from "@/components/contas-table";

export default function InadimplentesPage() {
  return (
    <ContasTable
      mode="vencidas"
      title="Inadimplentes"
      subtitle="Parcelas vencidas e nao recebidas"
      dataSource="income"
    />
  );
}
