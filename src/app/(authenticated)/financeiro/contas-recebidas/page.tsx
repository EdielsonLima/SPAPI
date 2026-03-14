"use client";

import { ContasTable } from "@/components/contas-table";

export default function ContasRecebidasPage() {
  return (
    <ContasTable
      mode="pagas"
      title="Contas Recebidas"
      subtitle="Parcelas recebidas com detalhes de recebimento"
      dataSource="income"
    />
  );
}
