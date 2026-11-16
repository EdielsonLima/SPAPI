// Resumo › "Ainda a Sair" e "Lucro a Realizar" (Edielson, 16/11/2026).
//
// Pedido: "ali [no Ainda a Entrar] nós não estamos considerando ainda também o que tem
// de pagar para esse empreendimento se finalizar. Eu pensei em pegar o saldo do orçamento
// dele e fazer essa conta [...] uma coluna chamada 'ainda a sair'".
//
// Ainda a Sair = saldo do Orçamento da obra (orçado − já realizado), o mesmo número da
// coluna "A Realizar" da aba Orçamento. Segue os cartões daquela aba: só obra ATIVA conta
// e saldo negativo não conta, então o total desta coluna é o cartão "Saldo a Realizar"
// de lá (com as mesmas empresas marcadas).
// Lucro a Realizar = Ainda a Entrar − Ainda a Sair: o espelho do Lucro Realizado
// (Recebido − Pago), só que do que ainda está por vir.
//
// Funções puras, usadas pela aba Resumo do Painel Executivo. O Resumo em HTML recebe o
// valor já calculado. Trava: npx tsx src/__tests__/resumo-projecao.test.ts

/** Por que a obra não tem valor em Ainda a Sair. */
export type MotivoSemSaida = "finalizada" | "sem-orcamento" | "estourado";

export interface OrcamentoDaObra {
  /** Orçado = m² × fator × CUB (aba Orçamento). */
  orcado: number;
  /** Custo já realizado (coluna Realizado da aba Orçamento). */
  realizado: number;
}

export interface SaidaPrevista {
  /** Quanto ainda falta sair. Nunca negativo. */
  valor: number;
  /** Preenchido só quando não há valor. */
  motivo: MotivoSemSaida | null;
}

/**
 * Quanto ainda falta gastar para terminar a obra.
 * - Finalizada: nada (a obra acabou; o que sobrou do orçamento não vai ser gasto).
 * - Sem orçamento (empresa que não controla orçamento ou sem área): nada a descontar.
 * - Custo já acima do orçamento: nada (o saldo não fica negativo).
 */
export function aindaASair(orcamento: OrcamentoDaObra | null | undefined, finalizada: boolean): SaidaPrevista {
  if (finalizada) return { valor: 0, motivo: "finalizada" };
  if (!orcamento || !(orcamento.orcado > 0)) return { valor: 0, motivo: "sem-orcamento" };
  const saldo = orcamento.orcado - orcamento.realizado;
  if (!(saldo > 0)) return { valor: 0, motivo: "estourado" };
  return { valor: saldo, motivo: null };
}

/** O que deve sobrar do que ainda vai entrar, depois de pagar o que falta da obra. */
export function lucroARealizar(aindaAEntrar: number, saida: number): number {
  return aindaAEntrar - saida;
}

/**
 * Margem Final (Edielson, 16/11/2026: "mais uma coluna chamada 'margem final'"): a margem
 * esperada da obra quando tudo terminar. É a Margem da tela (Lucro Realizado ÷ Total
 * Recebido) levada até o fim: junta o que já aconteceu com o que ainda falta.
 *   resultado esperado = Lucro Realizado + Lucro a Realizar
 *                      = (Recebido − Pago) + (Ainda a Entrar − Ainda a Sair)
 *   receita esperada   = Total Recebido + Ainda a Entrar
 *   Margem Final       = resultado esperado ÷ receita esperada × 100
 * Sem receita nenhuma (nada recebido e nada a entrar) não há margem: null.
 */
export function margemFinal(totalRecebido: number, totalPago: number, aindaAEntrar: number, saida: number): number | null {
  const receita = totalRecebido + aindaAEntrar;
  if (!(receita > 0)) return null;
  return ((totalRecebido - totalPago + aindaAEntrar - saida) / receita) * 100;
}

/** Texto da dica quando a célula de Ainda a Sair fica sem valor. */
export const DICA_SEM_SAIDA: Record<MotivoSemSaida, string> = {
  finalizada: "Obra finalizada: não há mais saída prevista pelo orçamento.",
  "sem-orcamento": "Sem orçamento cadastrado em Cadastros › Empreendimentos: nada a descontar.",
  estourado: "O custo realizado já passou do orçamento: não há saldo a sair.",
};
