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
// ATRASADAS (aba Contas Atrasadas, 08/11/2026) = card "Contas Atrasadas CARD"
// do mesmo BI: vencida (< hoje), saldo corrigido > 0, sem as 5 previsões
// (PPC, PPE, PRC, PCT, PRV) e, de novo, SEM olhar a consistência. O painel
// deixava fora 3 títulos não consistidos (Domus R$ 5.635,40, Sul Brasil
// R$ 1.331,61, Silva Packer Construtora R$ 1.164,39) — mesma decisão do A
// Pagar: contar. Os títulos 15596/15597 da TETRA (R$ 262.774,79), que o
// "Geral a Pagar Ajustado" exclui, contam nas Atrasadas nos dois.
//
// O valor da parcela NÃO segue o BI nas Atrasadas (Edielson, 08/11/2026): o
// BI faz saldo − imposto sempre e ignora o desconto; o painel mantém
// effectiveOpenAmount, conferido com o relatório do Sienge. Diferença que
// fica, toda no 135 Jardins (+R$ 11.597,05 no painel):
//   · R M FERNANDEZ, NF 1189 (título 34134): pago em parte em 06/03/2026 com
//     o imposto de R$ 21.497,05 já retido; o BI tira o imposto de novo e
//     mostra R$ 18.493,41 — o Sienge e o painel, R$ 39.990,46;
//   · Contrato de Locação 024939 (título 33345): R$ 9.900,00 com desconto de
//     R$ 9.900,00 — o painel mostra 0, o BI R$ 9.900,00.
//
// PAGAS (aba Contas Pagas, 08/11/2026) = card "Total pago até data
// selecionada" do mesmo BI: soma do Líquido por data da baixa de um CSV do
// relatório "Contas Pagas" do Sienge (tabela f_PAGAS CSV, "Ambos": contas a
// pagar + caixa/bancos), sem documento "TRAN.". A regra do painel (netAmount
// dos pagamentos + movimentos bancários avulsos de saída, sem os tipos de
// operação Substituição/Cancelamento/Abatimento/Devolução/Por Bens/Permuta)
// já dava o mesmo, centavo a centavo, nas 13 empresas em 2024 e 2025 e em 11
// delas em 2026. O que mudou: os movimentos bancários avulsos só entram se a
// empresa é do modo — os da Holding entravam no modo Silva Packer (2026:
// R$ 870.009,29; 2025: R$ 1.173.376,01). Diferenças que ficam, ambas do BI:
//   · título 41035 (FEY PROBST, NFSE 413, pago em 13/10/2026, R$ 14.546,75,
//     Silva Packer Construtora): o único título do Sienge com documento NFSE,
//     e o CSV do BI não traz nenhum NFSE;
//   · a consulta do BI apaga a última linha do CSV (RemoveLastN 1): em 08/11,
//     AMARAL E AMARAL, R$ 6.000,00 no Galpão Rua Canelinha.
//
// O modo Holding NÃO usa estas regras.

/** Previsões que o Power BI tira do total a pagar. */
export const PREVISOES_FORA_DO_A_PAGAR = new Set(["PPC", "PPE", "PRV", "PCT"]);
/** Previsão de Comissão: fica no A Pagar mesmo vencida (sai das Atrasadas no BI). */
export const DOC_PREVISAO_COMISSAO = "PRC";
/** Previsões que o Power BI tira das Contas Atrasadas (as 4 + a de comissão). */
export const PREVISOES_FORA_DAS_ATRASADAS = new Set([...PREVISOES_FORA_DO_A_PAGAR, DOC_PREVISAO_COMISSAO]);

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

/** Entra nas Contas Atrasadas do Power BI (sem olhar a consistência). */
export function entraNasAtrasadas(item: ItemAPagar, hoje: string): boolean {
  if (PREVISOES_FORA_DAS_ATRASADAS.has(tipoDoc(item))) return false;
  if ((item.correctedBalanceAmount || 0) <= 0) return false;
  return !!item.dueDate && item.dueDate < hoje;
}

/**
 * O tipo "Previsão de Comissão" não aparece no filtro Tipo Doc do CP (as
 * previsões ficam fora da lista), então o filtro não pode cortá-lo.
 */
export function ignoraFiltroTipoDocCP(item: ItemAPagar): boolean {
  return ehPrevisaoDeComissao(item);
}

/**
 * Base das Contas Pagas fora do modo Holding: os títulos do modo e os
 * movimentos bancários avulsos SÓ das empresas do modo (antes os da Holding
 * entravam no modo Silva Packer, sem filtro de empresa).
 */
export function basePagas<T extends { companyName: string }>(
  titulos: T[],
  movimentosAvulsos: T[],
  empresaDoModo: (empresa: string) => boolean,
): T[] {
  return [...titulos, ...movimentosAvulsos.filter((m) => empresaDoModo(m.companyName))];
}
