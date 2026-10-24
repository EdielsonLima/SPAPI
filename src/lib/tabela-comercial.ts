// Tabela comercial manual de um empreendimento (a do diretor comercial, em
// PDF), por cima do que vem do Sienge: quais unidades estão à venda e o preço
// de cada uma. Guardada em `tabela_comercial` (chave = nome do empreendimento
// no Sienge em slug, ex. "palacio-elizabeth"), editada na tela Tabela de
// preços por quem edita preços (TABELA_PRECOS_EMAILS).
//
// Regra no Quadro/3D (aplicarTabelaComercial): unidade listada em
// `disponiveis` é Disponível; unidade NÃO listada que o Sienge dá como
// Disponível/Reservado/Proposta vira Vendido (a tabela do comercial manda).
// Vendido e Permutante do Sienge ficam como estão. Preço: o da tabela de
// preços do painel; sem ele, o `precos[unidade]` daqui.

import { chaveDoEmpreendimento } from "@/lib/condicoes-pagamento";

export interface TabelaComercial {
  referencia: string;               // "Tabela comercial · outubro/2026 (Guberto)"
  disponiveis: string[];            // nomes das unidades como no Sienge ("AP602")
  precos: Record<string, number>;   // unidade → R$ (só as que a tabela traz)
  entrega?: string;                 // "AAAA-MM" previsto das chaves, se a tabela diz
}

export const TABELA_COMERCIAL_VAZIA: TabelaComercial = { referencia: "", disponiveis: [], precos: {} };

// Nome da unidade como chave: só letras e dígitos, sem o prefixo "AP" — no
// Sienge da Silva Packer a unidade é "102"; em outros cadastros, "AP102".
export const nomeUnidade = (u: unknown) => String(u ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^AP(?=\d)/, "");

// Acha a tabela comercial de um empreendimento pelo nome do Sienge: chave
// igual ao slug do nome, ou chave contida nele ("palacio-elizabeth" dentro de
// "edificio-palacio-elizabeth"). Devolve também a chave a usar ao salvar.
export function tabelaComercialPara<T>(nomeEmpreendimento: string, mapa: Map<string, T>): { chave: string; tabela: T | null } {
  const slug = chaveDoEmpreendimento(undefined, nomeEmpreendimento);
  if (mapa.has(slug)) return { chave: slug, tabela: mapa.get(slug)! };
  let melhor: string | null = null;
  for (const k of mapa.keys()) if (k && (slug.includes(k) || k.includes(slug)) && (!melhor || k.length > melhor.length)) melhor = k;
  return melhor ? { chave: melhor, tabela: mapa.get(melhor)! } : { chave: slug, tabela: null };
}

export function normalizarTabelaComercial(t: Partial<TabelaComercial> | null | undefined): TabelaComercial {
  const precos: Record<string, number> = {};
  if (t?.precos && typeof t.precos === "object") {
    for (const [k, v] of Object.entries(t.precos)) {
      const n = Number(v);
      if (nomeUnidade(k) && Number.isFinite(n) && n > 0) precos[nomeUnidade(k)] = Math.round(n * 100) / 100;
    }
  }
  const disponiveis = Array.from(new Set((Array.isArray(t?.disponiveis) ? t!.disponiveis : []).map(nomeUnidade).filter(Boolean)));
  return {
    referencia: typeof t?.referencia === "string" ? t.referencia.trim().slice(0, 160) : "",
    disponiveis,
    precos,
    ...(typeof t?.entrega === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(t.entrega) ? { entrega: t.entrega } : {}),
  };
}

export function validarTabelaComercial(t: TabelaComercial): string | null {
  if (t.disponiveis.length > 2000) return "Lista de disponíveis grande demais.";
  if (Object.values(t.precos).some(v => !(v > 0 && v < 1e11))) return "Há preço inválido na tabela comercial.";
  return null;
}

// Situações do Sienge que a tabela do comercial pode "vender".
const A_VENDA = new Set(["Disponível", "Reservado", "Proposta"]);

export function aplicarTabelaComercial(situacao: string, unidade: string, t: TabelaComercial | null | undefined): string {
  if (!t) return situacao;
  const nome = nomeUnidade(unidade);
  if (t.disponiveis.includes(nome)) return "Disponível";
  if (A_VENDA.has(situacao)) return "Vendido";
  return situacao;
}

// Preço da tabela comercial para a unidade, se houver.
export const precoDaTabelaComercial = (unidade: string, t: TabelaComercial | null | undefined): number =>
  (t && t.precos[nomeUnidade(unidade)]) || 0;

// A situação mudou por causa da tabela? (para marcar na tela)
export const sobrescritaPelaTabela = (situacaoSienge: string, unidade: string, t: TabelaComercial | null | undefined) =>
  !!t && aplicarTabelaComercial(situacaoSienge, unidade, t) !== situacaoSienge;
