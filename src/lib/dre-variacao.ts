// Variação mês a mês do DRE Completo, para leitura (Edielson, 07/11/2026).
//
// Duas informações separadas:
// - efeito: quanto a linha ajudou (+) ou atrapalhou (−) o resultado, em % do
//   mês anterior. Decide a COR: verde = bom para o lucro, vermelho = ruim.
//   É a conta que a tela sempre fez.
// - exibida: o número que aparece. Em receita e nas linhas de lucro é o próprio
//   efeito. Em custo e despesa (que o DRE guarda negativos) é a variação do
//   TAMANHO do custo: de −5.212.081,44 para −4.663.228,15 o custo caiu 10,5 %,
//   então aparece "−10,5%", em verde. Antes aparecia "+10,5%" e quem lia
//   entendia que o custo tinha subido.
//
// Os valores do DRE (validados contra o Power BI) não passam por aqui.

export type VariacaoDre = { efeito: number; exibida: number };

/** null quando o mês anterior é zero (sem base para o percentual). */
export function variacaoDre(atual: number, anterior: number, ehCusto: boolean): VariacaoDre | null {
  if (anterior === 0) return null;
  const efeito = ((atual - anterior) / Math.abs(anterior)) * 100;
  return { efeito, exibida: ehCusto ? -efeito : efeito };
}
