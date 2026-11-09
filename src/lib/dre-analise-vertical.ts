// Análise vertical da DRE (Edielson, 09/11/2026): quanto cada linha representa
// da Receita Operacional do mesmo período. Pergunta que originou: "o custo
// variável foi 39 milhões, isso é quantos por cento da receita?". Entrou no
// lugar do painel "Insights da DRE", que o Carlos Humberto não usava.
//
// - Linhas de lucro (calculadas): % COM sinal = margem (lucro bruto 15,5 %,
//   lucro líquido −4,7 %). Mesma conta da pílula dos cards do topo.
// - Receita, custo e despesa: % SEM sinal (custo variável = 84,5 % da
//   receita). A cor da linha já mostra que é saída.
// - Receita zerada: sem percentual (null), a tela deixa em branco.
//
// Os valores do DRE (validados contra o Power BI) não passam por aqui.

/** Percentual de `valor` sobre a receita; null quando a receita é zero. */
export function pctDaReceita(valor: number, receita: number, comSinal: boolean): number | null {
  if (!receita) return null;
  const pct = (valor / Math.abs(receita)) * 100;
  return comSinal ? pct : Math.abs(pct);
}

const fmt1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "84,5%", "-4,7%", "<0,1%"; vazio sem receita. */
export function formatarPctReceita(pct: number | null): string {
  if (pct === null) return "";
  const abs = Math.abs(pct);
  if (abs > 0 && abs < 0.05) return "<0,1%";
  const txt = fmt1.format(abs);
  return pct < 0 && txt !== "0,0" ? `-${txt}%` : `${txt}%`;
}
