"use client";

import { ContasTable } from "@/components/contas-table";

export default function ContasReceberPage() {
  return (
    <ContasTable
      mode="a-vencer"
      title="Contas a Receber"
      subtitle="Parcelas a receber"
      dataSource="income"
    />
  );
}
