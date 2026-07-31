/**
 * Controle de Locacoes (Alugueis) — EXCLUSIVO do modo Holding.
 *
 * ARQUIVO ISOLADO: nada aqui e importado pelas telas das demais empresas
 * (Contas a Pagar/Pagas/Vencidas/Receber/Recebidas, Painel Executivo, DRE,
 * Orcamento, Comercial). Alterar este arquivo NAO pode mudar nenhum numero
 * ja validado dessas telas. Pela mesma razao as formulas abaixo sao locais
 * (nao reaproveitam dashboard-utils) — a duplicacao e proposital.
 *
 * REGRA (decodificada do Power BI "FINANCEIRO HOLDING.pbix", paginas
 * "ALUGUEIS A RECEBER" e "ALUGUEIS REALIZADO"):
 *   titulo de receber com documento LOC ou LNC
 *   E com categoria financeira 10513 ou 10514 (Receita de locacao PF / PJ)
 *
 * VALIDADO em 2026-07-31 contra o Power BI (Alugueis Realizado, 01/01/2026 a
 * 11/06/2026 — data do ultimo lancamento do CSV do BI):
 *   Total ............. R$ 2.328.855,21  (BI: R$ 2.328.855,21)
 *   Silva Packer ...... R$ 1.444.930,96  (BI: R$ 1.444.930,96)
 *   Holding ........... R$   473.940,83  (BI: R$   473.940,83)
 *   Sul Brasil ........ R$   409.983,42  (BI: R$   409.983,42)
 * NAO ALTERAR as constantes/formulas abaixo sem pedido explicito do usuario.
 */

import { SiengeIncome } from "@/types/sienge";

/** Documentos de locacao: CONTRATO DE LOCACAO / CONTRATO DE LOCACAO NAO CONTABIL. */
export const ALUGUEL_DOC_IDS = new Set(["LOC", "LNC"]);

/** Categorias financeiras de receita de locacao (Pessoa Fisica / Pessoa Juridica). */
export const ALUGUEL_CATEGORY_IDS = new Set(["10513", "10514"]);

/** True quando o titulo de receber e um aluguel pela regra do Power BI. */
export function isAluguel(item: SiengeIncome): boolean {
  if (!ALUGUEL_DOC_IDS.has((item.documentIdentificationId || "").trim())) return false;
  return (item.paymentsCategories || []).some((c) =>
    ALUGUEL_CATEGORY_IDS.has(String(c.financialCategoryId || "").trim())
  );
}

/**
 * Saldo em aberto da parcela (mesma formula do CR: corrigido - desconto).
 * Nao subtrai taxAmount — isso e regra de Contas a Pagar (outcome).
 */
export function saldoAberto(item: SiengeIncome): number {
  const corrigido = item.correctedBalanceAmount ?? item.balanceAmount ?? 0;
  return corrigido - (item.discountAmount || 0);
}

/** Soma dos recebimentos liquidos da parcela dentro do intervalo informado. */
export function recebidoNoPeriodo(
  item: SiengeIncome,
  inicio: string,
  fim: string
): number {
  let total = 0;
  for (const p of item.payments || []) {
    const data = (p.paymentDate || "").slice(0, 10);
    if (!data || data < inicio || data > fim) continue;
    total += p.netAmount || 0;
  }
  return total;
}

/** Nome do imovel: o Sienge guarda no "Numero do documento" do titulo. */
export function nomeImovel(item: SiengeIncome): string {
  return (item.documentNumber || "").trim() || "(sem imovel)";
}

/** Dias de atraso de uma parcela em aberto (0 quando ainda nao venceu). */
export function diasEmAtraso(dueDate: string, hoje: string): number {
  const venc = (dueDate || "").slice(0, 10);
  if (!venc || venc >= hoje) return 0;
  const ms = new Date(`${hoje}T12:00:00`).getTime() - new Date(`${venc}T12:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Data de hoje em ISO local (sem deslocamento de fuso). */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
