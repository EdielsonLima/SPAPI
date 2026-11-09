// Unidades cadastradas só no painel (Edielson, 09/11/2026: "pode ser que algumas
// salas não estejam cadastradas no Sienge. Elas podem ser somente aqui pelo
// painel, sem utilizar o Sienge").
//
// Gravadas na tabela `unidades_painel` (src/lib/db.ts) pelo modal Estoque do
// Resumo. Nas contas do estoque (src/lib/estoque-resumo.ts) viram uma unidade
// como as do Sienge, com o id NEGATIVO (-id), para nunca bater com um id do
// Sienge; preço e situação são os do próprio cadastro, sem tabela comercial.
//
// Quando a mesma unidade aparece no Sienge (mesmo empreendimento e mesmo nome,
// "Sala 01" = "SALA 1"), vale a do Sienge e a do painel sai da conta: o modal
// avisa para tirá-la. Venda continua sendo no Sienge — o contrato exige a
// unidade cadastrada lá.

import type { ApiUnit } from "@/lib/comercial-utils";

export type SituacaoPainel = "Disponível" | "Reservado" | "Vendido";
export const SITUACOES_PAINEL: SituacaoPainel[] = ["Disponível", "Reservado", "Vendido"];
export const ehSituacaoPainel = (s: unknown): s is SituacaoPainel =>
  typeof s === "string" && (SITUACOES_PAINEL as string[]).includes(s);

// Tipos que se cadastra no painel; os dois caem no grupo "Sala comercial" e contam no estoque.
export const TIPOS_PAINEL = ["Sala comercial", "Loja"] as const;
export type TipoPainel = (typeof TIPOS_PAINEL)[number];
export const ehTipoPainel = (t: unknown): t is TipoPainel =>
  typeof t === "string" && (TIPOS_PAINEL as readonly string[]).includes(t);

export interface UnidadePainel {
  id: number;
  empresa: string;              // companyName, a linha do Resumo
  empreendimento: string;       // enterpriseName do Sienge
  enterpriseId: number | null;
  unidade: string;              // nome, ex.: "SALA 08"
  tipo: string;
  area: number;                 // área privativa (m²)
  situacao: SituacaoPainel;
  preco: number | null;
  criadoPor: string;
  criadoEm: string;
  atualizadoPor: string;
  atualizadoEm: string;
}

// ── Id nas contas do estoque ──
export const idNoEstoque = (painelId: number) => -painelId;
export const idDoPainel = (unitId: number) => -unitId;
export const ehDoPainel = (unitId: number | null | undefined): boolean => typeof unitId === "number" && unitId < 0;

// Situação do painel no rótulo de estoque do Sienge (situacaoDaUnidade lê de volta).
const ESTOQUE_DO_SIENGE: Record<SituacaoPainel, string> = {
  "Disponível": "Disponível",
  "Reservado": "Reserva Técnica",
  "Vendido": "Vendida",
};

// Nome comparável: maiúsculas, sem acento, espaço único e sem zero à esquerda
// ("Sala 01" = "SALA 1" = " sala  01 ").
export function chaveDoNome(nome: string): string {
  return (nome || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim()
    .replace(/\b0+(\d)/g, "$1");
}

const chaveDoEmpreendimento = (nome: string) => chaveDoNome(nome);

// Mesmo empreendimento: pelo id quando os dois têm; senão pelo nome.
function mesmoEmpreendimento(p: Pick<UnidadePainel, "enterpriseId" | "empreendimento">, u: Pick<ApiUnit, "enterpriseId" | "enterpriseName">): boolean {
  if (p.enterpriseId != null && u.enterpriseId != null) return p.enterpriseId === u.enterpriseId;
  return chaveDoEmpreendimento(p.empreendimento) === chaveDoEmpreendimento(u.enterpriseName);
}

// A unidade do Sienge com o mesmo nome no mesmo empreendimento, se houver.
export function noSienge(p: Pick<UnidadePainel, "enterpriseId" | "empreendimento" | "unidade">, sienge: ApiUnit[]): ApiUnit | null {
  const chave = chaveDoNome(p.unidade);
  return sienge.find(u => (u.id ?? 0) > 0 && chaveDoNome(u.name) === chave && mesmoEmpreendimento(p, u)) ?? null;
}

// Separa as do painel que já existem no Sienge (essas não contam: vale a do Sienge).
export function separarDuplicadas(painel: UnidadePainel[], sienge: ApiUnit[]): {
  validas: UnidadePainel[];
  duplicadas: { painel: UnidadePainel; sienge: ApiUnit }[];
} {
  const validas: UnidadePainel[] = [];
  const duplicadas: { painel: UnidadePainel; sienge: ApiUnit }[] = [];
  for (const p of painel) {
    const s = noSienge(p, sienge);
    if (s) duplicadas.push({ painel: p, sienge: s });
    else validas.push(p);
  }
  return { validas, duplicadas };
}

// A unidade do painel no formato das do Sienge, para as contas do estoque.
export function comoUnidadeApi(p: UnidadePainel): ApiUnit {
  return {
    id: idNoEstoque(p.id),
    enterpriseId: p.enterpriseId ?? undefined,
    enterpriseName: p.empreendimento,
    companyName: p.empresa,
    name: p.unidade,
    propertyType: p.tipo || "Sala comercial",
    commercialStock: ESTOQUE_DO_SIENGE[p.situacao] ?? "Disponível",
    floor: "",
    contractNumber: "",
    privateArea: p.area || 0,
  };
}

// Unidades do estoque: as do Sienge mais as do painel que não estão no Sienge.
export function unidadesComPainel(sienge: ApiUnit[], painel: UnidadePainel[]): ApiUnit[] {
  if (painel.length === 0) return sienge;
  return [...sienge, ...separarDuplicadas(painel, sienge).validas.map(comoUnidadeApi)];
}

// Preços do painel no mapa de preços do estoque (chave = id negativo).
export function precosComPainel(precos: Map<number, number>, painel: UnidadePainel[]): Map<number, number> {
  const comPreco = painel.filter(p => p.preco !== null && p.preco > 0);
  if (comPreco.length === 0) return precos;
  const m = new Map(precos);
  for (const p of comPreco) m.set(idNoEstoque(p.id), p.preco!);
  return m;
}
