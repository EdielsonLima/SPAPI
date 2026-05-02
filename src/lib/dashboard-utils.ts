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

// Adiantamento+Estorno cancelam-se no Líquido do Sienge "Contas Pagas
// Sintético". Sem pareamento, o filtro EXCLUDED_OP remove apenas o Estorno
// e deixa o Adiantamento contado — gerando over-count. Validado 2026-05-02
// contra SILVA PACKER 2024 (MERCADOPAGO 2024-09-25 R$ 1.325,92), PALACIO
// (R$ 1.625,75), 135 JARDINS (R$ 5.921,48).
type PaymentLike = { paymentDate?: string; netAmount?: number; operationTypeName?: string | null };
export function getEstornoPairs<T extends PaymentLike>(payments: T[]): Set<T> {
  const canceled = new Set<T>();
  const estornos = payments.filter(p => (p.operationTypeName || "").toLowerCase().includes("estorno"));
  for (const e of estornos) {
    const orig = payments.find(p =>
      p !== e &&
      p.paymentDate === e.paymentDate &&
      Math.abs((p.netAmount || 0) + (e.netAmount || 0)) < 0.01 &&
      !canceled.has(p)
    );
    if (orig) {
      canceled.add(orig);
      canceled.add(e);
    }
  }
  return canceled;
}
