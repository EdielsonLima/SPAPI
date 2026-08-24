/**
 * Comparativo entre indicadores de mercado.
 *
 * Serve para responder "quanto o CUB subiu contra o INCC" — o que exige pôr
 * todos na mesma régua. Índices mensais não se somam: acumulam por produto,
 * (1+i1)·(1+i2)·…−1. Somar as variações erra cada vez mais quanto maior a
 * janela, então tudo aqui é composto.
 *
 * Janela fixa dos últimos 12 meses: o CUB tem 150 meses de histórico, mas
 * CDI/IPCA/IGP-M/INCC vêm do debit.com.br, que só publica ~13 meses. Comparar
 * fora da sobreposição daria linha cortada.
 */

import type { CubIndicadorRow, PctIndicadorRow } from "@/lib/db";

export const JANELA_MESES = 12;

export type SlugComparavel = "cub" | "cdi" | "ipca" | "igpm" | "incc";

export interface DefinicaoIndicador {
  slug: SlugComparavel;
  nome: string;
  cor: string;
  /** O que o índice mede, para o usuário saber por que compará-los. */
  descricao: string;
}

export const INDICADORES_COMPARAVEIS: DefinicaoIndicador[] = [
  { slug: "cub", nome: "CUB-SC", cor: "#3b82f6", descricao: "Custo unitário básico da construção em SC" },
  { slug: "incc", nome: "INCC", cor: "#f97316", descricao: "Custo da construção civil (nacional)" },
  { slug: "igpm", nome: "IGP-M", cor: "#8b5cf6", descricao: "Índice usado em reajuste de aluguel" },
  { slug: "ipca", nome: "IPCA", cor: "#f59e0b", descricao: "Inflação oficial ao consumidor" },
  { slug: "cdi", nome: "CDI", cor: "#10b981", descricao: "Custo do dinheiro / rendimento de caixa" },
];

/** Um mês da série, já normalizado. */
export interface PontoSerie {
  ano: number;
  mes: number;
  chave: number;
  variacao: number;
}

export interface SerieComparativa {
  slug: SlugComparavel;
  nome: string;
  cor: string;
  descricao: string;
  pontos: PontoSerie[];
  /** Variação composta no período, em %. */
  acumulado: number;
  mediaMensal: number;
  maiorAlta: PontoSerie | null;
  maiorQueda: PontoSerie | null;
  /** Quanto R$ 100.000 viram corrigidos pelo índice no período. */
  valorCorrigido: number;
}

export interface PontoGrafico {
  label: string;
  chave: number;
  [slug: string]: number | string;
}

const MESES_3 = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function rotuloMes(ano: number, mes: number): string {
  return `${MESES_3[mes - 1] ?? "?"}/${String(ano).slice(-2)}`;
}

function chaveDe(ano: number, mes: number): number {
  return ano * 100 + mes;
}

function mesAnterior(chave: number): { ano: number; mes: number } {
  const ano = Math.floor(chave / 100);
  const mes = chave % 100;
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/** Converte as linhas cruas de cada indicador em pontos com variação mensal. */
function pontosDe(
  slug: SlugComparavel,
  cub: CubIndicadorRow[],
  pct: Record<string, PctIndicadorRow[]>
): PontoSerie[] {
  const bruto =
    slug === "cub"
      ? cub.map((r) => ({ ano: r.ano, mes: r.mes, variacao: r.variacao_pct }))
      : (pct[slug] || []).map((r) => ({ ano: r.ano, mes: r.mes, variacao: r.variacao_pct }));

  return bruto
    .filter((r) => r.variacao !== null && r.variacao !== undefined && Number.isFinite(Number(r.variacao)))
    .map((r) => ({
      ano: r.ano,
      mes: r.mes,
      chave: chaveDe(r.ano, r.mes),
      variacao: Number(r.variacao),
    }))
    .sort((a, b) => a.chave - b.chave);
}

/**
 * Monta as séries dos indicadores escolhidos já recortadas na sobreposição —
 * só entram meses em que TODOS os selecionados têm dado, senão uma linha
 * andaria sozinha e a leitura ficaria falsa.
 */
export function montarComparativo(
  slugs: SlugComparavel[],
  cub: CubIndicadorRow[],
  pct: Record<string, PctIndicadorRow[]>,
  janela = JANELA_MESES
): { series: SerieComparativa[]; meses: number[] } {
  if (slugs.length === 0) return { series: [], meses: [] };

  const porSlug = new Map<SlugComparavel, PontoSerie[]>();
  for (const s of slugs) porSlug.set(s, pontosDe(s, cub, pct));

  // interseção das competências
  let comuns: number[] | null = null;
  for (const pontos of porSlug.values()) {
    const chaves = new Set(pontos.map((p) => p.chave));
    comuns = comuns === null ? [...chaves] : comuns.filter((c) => chaves.has(c));
  }
  const meses = (comuns || []).sort((a, b) => a - b).slice(-janela);
  if (meses.length === 0) return { series: [], meses: [] };
  const dentro = new Set(meses);

  const series: SerieComparativa[] = [];
  for (const slug of slugs) {
    const def = INDICADORES_COMPARAVEIS.find((d) => d.slug === slug)!;
    const pontos = (porSlug.get(slug) || []).filter((p) => dentro.has(p.chave));

    // acumulado composto — nunca soma simples
    const fator = pontos.reduce((f, p) => f * (1 + p.variacao / 100), 1);
    const acumulado = (fator - 1) * 100;
    const ordenadosPorVariacao = [...pontos].sort((a, b) => b.variacao - a.variacao);

    series.push({
      slug,
      nome: def.nome,
      cor: def.cor,
      descricao: def.descricao,
      pontos,
      acumulado,
      mediaMensal: pontos.length ? (Math.pow(fator, 1 / pontos.length) - 1) * 100 : 0,
      maiorAlta: ordenadosPorVariacao[0] ?? null,
      maiorQueda: ordenadosPorVariacao[ordenadosPorVariacao.length - 1] ?? null,
      valorCorrigido: 100_000 * fator,
    });
  }

  return { series, meses };
}

export type ModoComparativo = "base100" | "acumulado" | "mensal";

/**
 * Dados do gráfico conforme o modo.
 *
 * base100 e acumulado ganham um ponto inicial no mês ANTERIOR à janela, valendo
 * 100 (ou 0%). Sem essa âncora o primeiro mês da janela apareceria já rendido e
 * o fim da linha não bateria com o acumulado dos cards.
 */
export function dadosDoGrafico(
  series: SerieComparativa[],
  meses: number[],
  modo: ModoComparativo
): PontoGrafico[] {
  if (series.length === 0 || meses.length === 0) return [];

  if (modo === "mensal") {
    return meses.map((chave) => {
      const ponto: PontoGrafico = {
        chave,
        label: rotuloMes(Math.floor(chave / 100), chave % 100),
      };
      for (const s of series) {
        const p = s.pontos.find((x) => x.chave === chave);
        if (p) ponto[s.slug] = Number(p.variacao.toFixed(4));
      }
      return ponto;
    });
  }

  const base = mesAnterior(meses[0]);
  const inicial: PontoGrafico = {
    chave: chaveDe(base.ano, base.mes),
    label: rotuloMes(base.ano, base.mes),
  };
  for (const s of series) inicial[s.slug] = modo === "base100" ? 100 : 0;

  const acumuladores = new Map<SlugComparavel, number>(series.map((s) => [s.slug, 1]));
  const linhas: PontoGrafico[] = [inicial];

  for (const chave of meses) {
    const ponto: PontoGrafico = {
      chave,
      label: rotuloMes(Math.floor(chave / 100), chave % 100),
    };
    for (const s of series) {
      const p = s.pontos.find((x) => x.chave === chave);
      const fator = (acumuladores.get(s.slug) || 1) * (1 + (p?.variacao ?? 0) / 100);
      acumuladores.set(s.slug, fator);
      ponto[s.slug] = Number(
        (modo === "base100" ? fator * 100 : (fator - 1) * 100).toFixed(4)
      );
    }
    linhas.push(ponto);
  }

  return linhas;
}

/** Diferença de cada série contra a referência, em pontos percentuais. */
export function spreadContra(
  series: SerieComparativa[],
  referencia: SlugComparavel
): { slug: SlugComparavel; nome: string; cor: string; diferenca: number }[] {
  const ref = series.find((s) => s.slug === referencia);
  if (!ref) return [];
  return series
    .filter((s) => s.slug !== referencia)
    .map((s) => ({
      slug: s.slug,
      nome: s.nome,
      cor: s.cor,
      diferenca: s.acumulado - ref.acumulado,
    }))
    .sort((a, b) => b.diferenca - a.diferenca);
}

/** Rótulo do período coberto, ex. "Mai/25 a Abr/26". */
export function rotuloPeriodo(meses: number[]): string {
  if (meses.length === 0) return "—";
  const p = meses[0];
  const u = meses[meses.length - 1];
  return `${rotuloMes(Math.floor(p / 100), p % 100)} a ${rotuloMes(Math.floor(u / 100), u % 100)}`;
}

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "Julho/2026" — cabecalho do tooltip, onde cabe o nome inteiro. */
export function rotuloMesLongo(chave: number): string {
  const ano = Math.floor(chave / 100);
  const mes = chave % 100;
  return `${MESES_LONGOS[mes - 1] ?? "?"}/${ano}`;
}

/** Acumulado composto do inicio da janela ate o mes informado, em %. */
export function acumuladoAte(serie: SerieComparativa, chave: number): number {
  let fator = 1;
  for (const p of serie.pontos) {
    if (p.chave > chave) break;
    fator *= 1 + p.variacao / 100;
  }
  return (fator - 1) * 100;
}

/** Variacao do proprio mes; null no ponto ancora, que antecede a janela. */
export function variacaoNoMes(serie: SerieComparativa, chave: number): number | null {
  return serie.pontos.find((p) => p.chave === chave)?.variacao ?? null;
}
