export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
}

export function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const datePart = String(dateStr).split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return String(dateStr);
  const d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Pareamento manual de Adiantamento+Estorno foi descontinuado em 2026-05-09.
// Estornos têm netAmount negativo: somá-los junto com os pagamentos chega
// no mesmo Líquido do Sienge sem precisar parear. O pareamento por data
// falhava em casos como HANNOVER bill=6109 (Pag 09-01, Estorno 09-05, Pag
// 09-06) — datas distintas, valor opostos isolados — e dobrava o pagamento.
// Para que isto funcione, "estorno" foi removido das listas EXCLUDED_OP
// (em contas-table.tsx e executive-dashboard.tsx) e da default DEFAULT_EXCLUDED
// do filtro Tipo Op. Estornos passam a aparecer como linhas regulares
// (com netAmount negativo) e somam corretamente.
//
// Função preservada como no-op pra não quebrar imports — pode ser removida
// num refactor futuro.
type PaymentLike = { paymentDate?: string; netAmount?: number; operationTypeName?: string | null };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getEstornoPairs<T extends PaymentLike>(_payments: T[]): Set<T> {
  return new Set<T>();
}
