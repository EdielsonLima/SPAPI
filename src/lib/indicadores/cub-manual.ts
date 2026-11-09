// CUB-SC lançado à mão = RESERVA para quando o site atrasa (Edielson,
// 09/11/2026: "deixa no automático, mas, se por um ou outro motivo o site não
// estiver com ele atualizado, a gente tem que poder inserir ele manualmente").
//
// Regra: o valor manual só vale para um mês MAIS NOVO que o último da série
// automática (Sinduscon-SC + myside). Quando o site publica o mesmo mês, o
// automático volta a valer sozinho — o manual fica guardado, mas sem uso.
// Variação do mês, acumulado no ano e 12 meses saem da série (as mesmas contas
// do Sinduscon); o que a pessoa digitar só entra se faltar a base na série.
//
// Funções puras (sem banco): usadas no servidor e na tela. Trava:
// src/__tests__/cub-manual.test.ts

export const MESES_CUB = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type AnoMes = { ano: number; mes: number };

export type CubManualSalvo = {
  value: number;
  /** "Nov/2026" (o formato que o Orçamento e o Comercial já usam). */
  monthLabel: string;
  monthlyVariation?: number | null;
  yearlyAccumulated?: number | null;
};

export type LinhaCubManual = AnoMes & {
  valor_m2: number;
  variacao_pct: number | null;
  variacao_acumulada_ano_pct: number | null;
  variacao_anual_pct: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** "Nov/2026", "nov/26", "Novembro/2026" → { ano: 2026, mes: 11 }. */
export function lerRotuloMes(rotulo: string | null | undefined): AnoMes | null {
  const m = semAcento(String(rotulo ?? "")).trim().toLowerCase().match(/^([a-z]{3})[a-z]*\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const mes = MESES_CUB.findIndex((x) => x.toLowerCase() === m[1]) + 1;
  if (mes < 1) return null;
  const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return { ano, mes };
}

export function rotuloMes(ano: number, mes: number): string {
  return `${MESES_CUB[mes - 1]}/${ano}`;
}

const chave = (x: AnoMes) => x.ano * 100 + x.mes;

/** O mês manual só vale se for mais novo que o último mês automático. */
export function manualMaisNovo(manual: AnoMes, ultimoAuto: AnoMes | null | undefined): boolean {
  return !ultimoAuto || chave(manual) > chave(ultimoAuto);
}

/**
 * Linha do CUB manual com as variações calculadas pela série automática:
 * mês = valor ÷ mês anterior − 1; ano = valor ÷ dezembro do ano anterior − 1;
 * 12 meses = valor ÷ mesmo mês do ano anterior − 1. Sem a base na série, usa o
 * que foi digitado (ou null). Não decide se o manual vale — ver manualMaisNovo.
 */
export function linhaManual(
  serie: { ano: number; mes: number; valor_m2: number }[],
  manual: CubManualSalvo | null | undefined
): LinhaCubManual | null {
  if (!manual) return null;
  const am = lerRotuloMes(manual.monthLabel);
  const v = Number(manual.value);
  if (!am || !Number.isFinite(v) || v <= 0) return null;
  const valorDe = (ano: number, mes: number) => serie.find((r) => r.ano === ano && r.mes === mes)?.valor_m2;
  const varSobre = (base: number | undefined) => (base && base > 0 ? r2((v / base - 1) * 100) : null);
  const anterior = am.mes === 1 ? valorDe(am.ano - 1, 12) : valorDe(am.ano, am.mes - 1);
  const digitado = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(x));
  return {
    ano: am.ano,
    mes: am.mes,
    valor_m2: v,
    variacao_pct: varSobre(anterior) ?? digitado(manual.monthlyVariation),
    variacao_acumulada_ano_pct: varSobre(valorDe(am.ano - 1, 12)) ?? digitado(manual.yearlyAccumulated),
    variacao_anual_pct: varSobre(valorDe(am.ano - 1, am.mes)),
  };
}
