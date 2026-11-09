// Estoque do Resumo Financeiro (Painel Executivo) — regra única das colunas
// Valor Estoque, Disp. e Res.Téc. e do modal "Estoque" que abre ao clicar nelas
// (Edielson, 09/11/2026: "ao clicar, abra um modal com a empresa filtrada e
// todas as unidades disponíveis, com o valor de cada unidade editável").
//
// Situação da unidade, em camadas (a de cima manda):
//   1. manual      — posta à mão no modal (tabela situacao_manual_unidades)
//   2. tabela      — tabela comercial do empreendimento (src/lib/tabela-comercial.ts)
//   3. Sienge      — estoque comercial do cadastro da unidade
// É a mesma do Quadro Espelho; nada disso é gravado no Sienge.
//
// Valor de uma unidade Disponível:
//   - preço de tabela do painel (Comercial › Tabela de Preços); sem ele, o da
//     tabela comercial;
//   - sem preço nenhum, só o APARTAMENTO entra, pela estimativa de sempre:
//     área privativa × fator × CUB.
// Disp. e Res.Téc. contam só apartamento (ehApartamento). Vaga, sala, loja,
// box e o resto não contam e só somam no valor quando têm preço.

import { inferUnitTypeFromName, pavimentoDaUnidade, type ApiUnit } from "@/lib/comercial-utils";
import { situacaoDaUnidade } from "@/lib/situacao-unidade";
import { aplicarTabelaComercial, precoDaTabelaComercial, tabelaComercialPara, type TabelaComercial } from "@/lib/tabela-comercial";

// Situações que se pode pôr à mão. São nomes do Quadro (situacao-unidade.ts).
export type SituacaoManual = "Disponível" | "Reservado" | "Vendido";
export const SITUACOES_MANUAIS: SituacaoManual[] = ["Disponível", "Reservado", "Vendido"];
export const ehSituacaoManual = (s: unknown): s is SituacaoManual =>
  typeof s === "string" && (SITUACOES_MANUAIS as string[]).includes(s);

// A situação manual da unidade, se houver, vale por cima da calculada.
export function aplicarSituacaoManual(situacao: string, unitId: number | null | undefined, manuais: Map<number, SituacaoManual>): string {
  if (unitId == null) return situacao;
  return manuais.get(unitId) ?? situacao;
}

// Só apartamento conta (Edielson, 09/11/2026: "Sim, só apartamentos"). Vale o
// TIPO do cadastro do Sienge ("Apartamento", "Apartamento (Permuta)"); sem
// tipo, o que o nome indica. Até 09/11 a regra olhava só o nome, e a vaga
// ("G 108" no Sienge da Silva Packer) passava por apartamento: os 82
// "disponíveis" do Palácio eram 13 apartamentos e 69 vagas.
export function ehApartamento(u: Pick<ApiUnit, "name" | "propertyType">): boolean {
  return grupoDoTipo(u.propertyType || inferUnitTypeFromName(u.name)) === "Apartamento";
}

export interface ContextoEstoque {
  precos: Map<number, number>;                      // tabela de preços do painel: unitId → R$
  tabelasComerciais: Map<string, TabelaComercial>;  // por chave do empreendimento
  situacoesManuais: Map<number, SituacaoManual>;    // unitId → situação posta à mão
  fator: (empresa: string) => number;               // Configurações › Empreendimentos
  cub: number;                                      // CUB do mês (R$/m²)
}

export type OrigemSituacao = "sienge" | "tabela" | "manual";
export type OrigemPreco = "tabela-precos" | "tabela-comercial";

export interface LinhaEstoque {
  unitId: number | null;
  enterpriseId: number | null;
  empresa: string;
  empreendimento: string;
  unidade: string;
  tipo: string;
  pavimento: string;
  area: number;
  situacaoSienge: string;     // estoque do Sienge, nos nomes do Quadro
  situacaoBase: string;       // Sienge + tabela comercial (o "automático")
  situacao: string;           // a que vale (manual por cima)
  origem: OrigemSituacao;
  precoTabela: number | null; // tabela de preços do painel (o que o modal edita)
  preco: number | null;       // preço que vale: tabela de preços, senão tabela comercial
  origemPreco: OrigemPreco | null;
  entraNaContagem: boolean;   // é apartamento: conta em Disp. / Res.Téc. e pode ser estimado
  estimativa: number;         // área × fator × CUB, se é apartamento
  valorEstoque: number;       // quanto soma no Valor Estoque (0 se não está Disponível)
  estimado: boolean;          // o valor acima é a estimativa, não um preço
}

export function linhasDeEstoque(unidades: ApiUnit[], ctx: ContextoEstoque): LinhaEstoque[] {
  const tabelaDe = new Map<string, TabelaComercial | null>();
  const fatorDe = new Map<string, number>();
  return unidades.map(u => {
    if (!tabelaDe.has(u.enterpriseName)) tabelaDe.set(u.enterpriseName, tabelaComercialPara(u.enterpriseName, ctx.tabelasComerciais).tabela);
    if (!fatorDe.has(u.companyName)) fatorDe.set(u.companyName, ctx.fator(u.companyName) || 0);
    const tc = tabelaDe.get(u.enterpriseName) ?? null;
    const unitId = u.id ?? null;

    const situacaoSienge = situacaoDaUnidade(u.commercialStock, false);
    const situacaoBase = aplicarTabelaComercial(situacaoSienge, u.name, tc);
    const manual = unitId != null ? ctx.situacoesManuais.get(unitId) : undefined;
    const situacao = manual ?? situacaoBase;
    const origem: OrigemSituacao = manual ? "manual" : situacaoBase !== situacaoSienge ? "tabela" : "sienge";

    const doPainel = unitId != null ? ctx.precos.get(unitId) : undefined;
    const precoTabela = doPainel && doPainel > 0 ? doPainel : null;
    const daComercial = precoDaTabelaComercial(u.name, tc);
    const preco = precoTabela ?? (daComercial > 0 ? daComercial : null);
    const origemPreco: OrigemPreco | null = precoTabela !== null ? "tabela-precos" : preco !== null ? "tabela-comercial" : null;

    const area = u.privateArea || 0;
    const entraNaContagem = ehApartamento(u);
    const estimativa = entraNaContagem ? area * fatorDe.get(u.companyName)! * (ctx.cub || 0) : 0;
    const disponivel = situacao === "Disponível";
    const valorEstoque = disponivel ? (preco ?? estimativa) : 0;

    return {
      unitId,
      enterpriseId: u.enterpriseId ?? null,
      empresa: u.companyName,
      empreendimento: u.enterpriseName,
      unidade: u.name,
      tipo: u.propertyType || inferUnitTypeFromName(u.name),
      pavimento: pavimentoDaUnidade(u.floor, u.name),
      area,
      situacaoSienge,
      situacaoBase,
      situacao,
      origem,
      precoTabela,
      preco,
      origemPreco,
      entraNaContagem,
      estimativa,
      valorEstoque,
      estimado: disponivel && preco === null && estimativa > 0,
    };
  });
}

export interface TotaisEstoque {
  qtDisp: number;          // coluna Disp.
  qtResTec: number;        // coluna Res.Téc.
  valorEstoque: number;    // coluna Valor Estoque
  comPreco: number;        // disponíveis somadas pelo preço
  valorComPreco: number;
  estimadas: number;       // disponíveis somadas pela estimativa
  valorEstimado: number;
  semValor: number;        // apartamentos disponíveis sem preço e sem estimativa (área ou fator zero)
  foraDaContagem: number;  // disponíveis com preço que não são apartamento (vaga, sala, box…)
  valorReservado: number;  // reservadas a preço de tabela (informativo; não soma no estoque)
}

export const TOTAIS_VAZIOS: TotaisEstoque = {
  qtDisp: 0, qtResTec: 0, valorEstoque: 0, comPreco: 0, valorComPreco: 0,
  estimadas: 0, valorEstimado: 0, semValor: 0, foraDaContagem: 0, valorReservado: 0,
};

export function totaisDoEstoque(linhas: LinhaEstoque[]): TotaisEstoque {
  const t = { ...TOTAIS_VAZIOS };
  for (const l of linhas) {
    if (l.situacao === "Disponível") {
      if (l.entraNaContagem) t.qtDisp++;
      t.valorEstoque += l.valorEstoque;
      if (l.preco !== null) {
        t.comPreco++;
        t.valorComPreco += l.preco;
        if (!l.entraNaContagem) t.foraDaContagem++;
      } else if (l.estimado) {
        t.estimadas++;
        t.valorEstimado += l.estimativa;
      } else if (l.entraNaContagem) {
        t.semValor++;
      }
    } else if (l.situacao === "Reservado") {
      if (l.entraNaContagem) t.qtResTec++;
      if (l.preco !== null) t.valorReservado += l.preco;
    }
  }
  return t;
}

export function totaisPorEmpresa(linhas: LinhaEstoque[]): Map<string, TotaisEstoque> {
  const grupos = new Map<string, LinhaEstoque[]>();
  for (const l of linhas) {
    if (!grupos.has(l.empresa)) grupos.set(l.empresa, []);
    grupos.get(l.empresa)!.push(l);
  }
  return new Map(Array.from(grupos.entries()).map(([empresa, ls]) => [empresa, totaisDoEstoque(ls)]));
}

// "3 apartamentos · 15 vagas" — do que é feita uma lista de unidades, pelo
// tipo do cadastro do Sienge. Agrupa as variações de vaga numa palavra só.
export function grupoDoTipo(tipo: string): string {
  const t = (tipo || "").toLowerCase();
  if (/vaga|garagem/.test(t)) return "Vaga";
  if (/apartamento|cobertura|garden/.test(t)) return "Apartamento";
  if (/sala|loja/.test(t)) return "Sala comercial";
  if (/box|dep[oó]sito|arm[aá]rio/.test(t)) return "Box";
  return "Outros";
}

const PLURAL: Record<string, string> = {
  "Apartamento": "apartamentos", "Vaga": "vagas", "Sala comercial": "salas comerciais", "Box": "boxes", "Outros": "outros",
};
const SINGULAR: Record<string, string> = {
  "Apartamento": "apartamento", "Vaga": "vaga", "Sala comercial": "sala comercial", "Box": "box", "Outros": "outro",
};
export const ORDEM_GRUPOS = ["Apartamento", "Sala comercial", "Vaga", "Box", "Outros"];

export function composicaoPorTipo(linhas: LinhaEstoque[]): string {
  const n = new Map<string, number>();
  for (const l of linhas) n.set(grupoDoTipo(l.tipo), (n.get(grupoDoTipo(l.tipo)) || 0) + 1);
  return ORDEM_GRUPOS.filter(g => n.has(g)).map(g => `${n.get(g)} ${n.get(g) === 1 ? SINGULAR[g] : PLURAL[g]}`).join(" · ");
}
