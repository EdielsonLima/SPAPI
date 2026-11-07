// Regra do "A Pagar" do Painel Executivo (CP › Contas a Pagar) fora do modo
// Holding — a mesma do card "À Pagar sem prev CARD." do Power BI "FINANCEIRO
// GERAL" da Silva Packer (Edielson, 07/11/2026: o Carlos Humberto vem do Power
// BI e os números têm de bater quadro a quadro).
//
// No Power BI (tabela f_PAGAR = /bulk-data/v1/outcome por vencimento):
//   A Pagar = "Geral a Pagar Ajustado" − "Contas Atrasadas"
//   Geral     = saldo corrigido de tudo, menos as previsões PPC, PPE, PRV e PCT,
//               − imposto retido (taxAmount) das parcelas em aberto
//   Atrasadas = saldo corrigido vencido (< hoje) > 0, menos PPC, PPE, PRC, PCT e
//               PRV, − o imposto delas
// Na prática, entra no A Pagar: parcela em aberto (saldo corrigido > 0) a
// vencer (>= hoje), de qualquer documento menos as 4 previsões, e TODA
// "Previsão de Comissão" (PRC) em aberto, vencida ou não — ela sai das
// Atrasadas mas fica no total. O BI não olha a consistência do título.
//
// Diferenças que o painel tinha (07/11/2026, ano 2026):
//   · títulos "não consistidos" no Sienge (NF-e lançada, pendente de
//     conferência) ficavam fora: 135 Jardins R$ 51.048,22 (Chave Digital) e
//     Domus R$ 708,84 — o Edielson decidiu contar, como o BI;
//   · a Previsão de Comissão do Domus (R$ 90.000,00, vencida em 27/03/2026:
//     Reserva Imob 82.500 + Renata K 7.500) ficava fora — o Edielson decidiu
//     somar no A Pagar, igual ao BI.
// As outras empresas já batiam centavo a centavo. A página do BI só mostra 10
// obras (sem Silva Packer Construtora, Sul Brasil e Galpão Rua Canelinha); o
// painel continua com todas e o filtro Empresas faz o recorte.
//
// O valor de cada parcela continua o do painel (effectiveOpenAmount: saldo −
// desconto − imposto quando a parcela está inteira), validado com o relatório
// do Sienge; em 07/11 dava o mesmo que o BI (saldo − imposto) em todas.
//
// O modo Holding NÃO usa esta regra.

/** Previsões que o Power BI tira do total a pagar. */
export const PREVISOES_FORA_DO_A_PAGAR = new Set(["PPC", "PPE", "PRV", "PCT"]);
/** Previsão de Comissão: fica no A Pagar mesmo vencida (sai das Atrasadas no BI). */
export const DOC_PREVISAO_COMISSAO = "PRC";

export type ItemAPagar = {
  correctedBalanceAmount?: number | null;
  dueDate?: string | null;
  documentIdentificationId?: string | null;
};

function tipoDoc(item: ItemAPagar): string {
  return (item.documentIdentificationId || "").trim().toUpperCase();
}

/** Documento "Previsão de Comissão" (PRC). */
export function ehPrevisaoDeComissao(item: ItemAPagar): boolean {
  return tipoDoc(item) === DOC_PREVISAO_COMISSAO;
}

/** Entra no A Pagar do Power BI. */
export function entraNoAPagar(item: ItemAPagar, hoje: string): boolean {
  if (PREVISOES_FORA_DO_A_PAGAR.has(tipoDoc(item))) return false;
  if ((item.correctedBalanceAmount || 0) <= 0) return false;
  return ehPrevisaoDeComissao(item) || (!!item.dueDate && item.dueDate >= hoje);
}

/**
 * O tipo "Previsão de Comissão" não aparece no filtro Tipo Doc do CP (as
 * previsões ficam fora da lista), então o filtro não pode cortá-lo.
 */
export function ignoraFiltroTipoDocCP(item: ItemAPagar): boolean {
  return ehPrevisaoDeComissao(item);
}
