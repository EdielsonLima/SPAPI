"use client";

import { ContasTable } from "@/components/contas-table";

export default function ContasPagarPage() {
  return (
    <ContasTable
      mode="a-vencer"
      title="Contas a Pagar"
      subtitle="Parcelas a vencer"
    />
  );
}
