// Regra do "Total a Receber" do Painel Executivo (CR › Contas a Receber) fora do
// modo Holding — a mesma da medida "Total a Receber Futuro" do Power BI
// "FINANCEIRO GERAL" da Silva Packer (Edielson, 07/11/2026: o Carlos Humberto
// vem do Power BI e os números têm de bater quadro a quadro).
//
// No Power BI (tabela f_RECEBER = /bulk-data/v1/income por vencimento):
//   saldo corrigido > 0 · vencimento >= hoje · condição de pagamento ≠ Permuta
//   · categoria financeira fora de 10513/10514 (receita de locação PF/PJ).
// Antes o painel tirava o aluguel pelo TIPO DE DOCUMENTO ("Contrato de
// Locação"/"…Não Contábil"). Em 07/11 isso dava R$ 1.891,92 a mais na Silva
// Packer Construtora: o acordo da Bigliardi (documento CONTRATO, categoria
// 10514) entrava, e um "Contrato de Locação Não Contábil" de R$ 108,08 com
// categoria que não é aluguel (2090111) saía. Pela categoria, o total do
// painel = o do Power BI (R$ 7.635.160,05 em 2026).
//
// O modo Holding NÃO usa esta regra: lá o A Receber é justamente o aluguel.
//
// VENCIDAS (aba Inadimplência, 07/11/2026) = medida "Total Vencidas" do mesmo
// BI: saldo corrigido > 0 · vencimento < hoje · condição ≠ Permuta — e COM
// aluguel (no BI a exclusão por categoria está comentada) e SEM multa/juros.
// "% Atrasada" = vencidas ÷ carteira em aberto (saldo > 0, sem Permuta, com
// aluguel, a vencer + vencido). Conferido em 07/11 (2026): R$ 2.544.304,20 e
// 23,59 %, iguais ao BI. A soma com multa 2 % + juros 1 % a.m. (relatório
// "Posição de Inadimplência" do Sienge) continua na tela como card à parte.

export const CATEGORIAS_RECEITA_LOCACAO = new Set(["10513", "10514"]);

type CategoriaLike = { financialCategoryId?: string | number | null };
export type ItemAReceber = {
  correctedBalanceAmount?: number | null;
  dueDate?: string | null;
  documentIdentificationName?: string | null;
  paymentsCategories?: CategoriaLike[] | null;
  paymentTerm?: { id?: string; descrition?: string; description?: string } | null;
};

function normalizar(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

/** Parcela de aluguel: alguma categoria financeira é receita de locação (10513/10514). */
export function ehReceitaDeLocacao(item: ItemAReceber): boolean {
  return (item.paymentsCategories || []).some((c) =>
    CATEGORIAS_RECEITA_LOCACAO.has(String(c.financialCategoryId ?? "").trim())
  );
}

/** Documento "Contrato de Locação" / "Contrato de Locação Não Contábil" (LOC/LNC). */
export function ehDocumentoDeLocacao(nome: string | null | undefined): boolean {
  return normalizar(nome).startsWith("CONTRATO DE LOCA");
}

/** Condição de pagamento "Permuta" (a API grafa a chave como "descrition"). */
export function ehCondicaoPermuta(item: ItemAReceber): boolean {
  const t = item.paymentTerm;
  return normalizar(t?.descrition ?? t?.description) === "PERMUTA";
}

/** Entra no Total a Receber (parcela em aberto, a vencer, sem aluguel e sem permuta). */
export function entraNoAReceber(item: ItemAReceber, hoje: string): boolean {
  return (item.correctedBalanceAmount || 0) > 0 &&
    !!item.dueDate && item.dueDate >= hoje &&
    !ehReceitaDeLocacao(item) &&
    !ehCondicaoPermuta(item);
}

/** Entra no Total Vencidas (vencida, em aberto, sem permuta; aluguel conta). */
export function entraNasVencidas(item: ItemAReceber, hoje: string): boolean {
  return (item.correctedBalanceAmount || 0) > 0 &&
    !!item.dueDate && item.dueDate < hoje &&
    !ehCondicaoPermuta(item);
}

/** Carteira em aberto, base do "% Atrasada" (a vencer + vencido, com aluguel, sem permuta). */
export function entraNaCarteiraAberta(item: ItemAReceber): boolean {
  return (item.correctedBalanceAmount || 0) > 0 && !ehCondicaoPermuta(item);
}

/**
 * Documento "Contrato de Locação…": o tipo não aparece no filtro Tipo Doc do CR
 * (lá ele é escondido), então o filtro não pode cortá-lo. No A Receber o
 * aluguel já saiu pela categoria (sobra, ex., o ressarcimento de IPTU de
 * R$ 108,08 de 07/11); nas Vencidas o aluguel conta, como no Power BI.
 */
export function ignoraFiltroTipoDoc(item: ItemAReceber): boolean {
  return ehDocumentoDeLocacao(item.documentIdentificationName);
}
