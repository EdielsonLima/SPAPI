"use client";

import { ContasTable } from "@/components/contas-table";

export default function ContasPagasPage() {
  return (
    <ContasTable
      mode="pagas"
      title="Contas Pagas"
      subtitle="Parcelas pagas com detalhes de pagamento"
    />
  );
}
