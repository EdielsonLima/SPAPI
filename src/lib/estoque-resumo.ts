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
// Valor de uma unidade Disponível = o preço posto NO PAINEL (Edielson,
// 10/11/2026: "nós vamos considerar o valor do estoque, o valor que nós
// colocarmos aqui no painel. O que vem do estoque do Sienge não está nada certo
// [...] enquanto não for ajustado lá no Sienge, nós vamos trabalhar somente com
// o valor aqui do painel"):
//   - preço de tabela do painel (modal Estoque / Comercial › Tabela de Preços /
//     cadastro da unidade do painel); sem ele, o da tabela comercial do
//     empreendimento, que também é do painel.
//   - sem preço, a unidade conta na quantidade e NÃO soma valor.
// Até 10/11/2026 apartamento e sala sem preço entravam pela estimativa área
// privativa × fator × CUB, com a área do Sienge (zerada ou errada em várias
// obras). Saiu: não voltar sem pedido.
// Disp. e Res.Téc. contam apartamento e sala comercial (contaNoEstoque). Vaga,
// box e o resto não contam e só somam no valor quando têm preço.
//
// Unidade cadastrada só no painel (src/lib/unidades-painel.ts) entra com id
// negativo: situação e preço são os do cadastro dela (origem "painel"), sem
// tabela comercial; a conta é a mesma das do Sienge.

import { inferUnitTypeFromName, pavimentoDaUnidade, type ApiUnit } from "@/lib/comercial-utils";
import { situacaoDaUnidade } from "@/lib/situacao-unidade";
import { aplicarTabelaComercial, precoDaTabelaComercial, tabelaComercialPara, type TabelaComercial } from "@/lib/tabela-comercial";
import { ehDoPainel } from "@/lib/unidades-painel";

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

// O que é estoque à venda: apartamento e sala comercial (Edielson, 09/11/2026:
// "além dos apartamentos, têm salas comerciais que elas devem contabilizar
// como estoque"). Sala comercial é o grupo do tipo do Sienge ("Salas
// Comerciais", loja); conta em Disp./Res.Téc. como o apartamento. Vaga, box e
// o resto continuam fora da conta.
export const GRUPOS_DO_ESTOQUE = ["Apartamento", "Sala comercial"];
export function contaNoEstoque(u: Pick<ApiUnit, "name" | "propertyType">): boolean {
  return GRUPOS_DO_ESTOQUE.includes(grupoDoTipo(u.propertyType || inferUnitTypeFromName(u.name)));
}

export interface ContextoEstoque {
  precos: Map<number, number>;                      // tabela de preços do painel: unitId → R$
  tabelasComerciais: Map<string, TabelaComercial>;  // por chave do empreendimento
  situacoesManuais: Map<number, SituacaoManual>;    // unitId → situação posta à mão
}

export type OrigemSituacao = "sienge" | "tabela" | "manual" | "painel";
export type OrigemPreco = "tabela-precos" | "tabela-comercial" | "painel";

export interface LinhaEstoque {
  unitId: number | null;
  enterpriseId: number | null;
  empresa: string;
  empreendimento: string;
  unidade: string;
  contrato: string;           // contrato do Sienge que hoje segura a unidade ("" = sem contrato)
  tipo: string;
  pavimento: string;
  area: number;
  situacaoSienge: string;     // estoque do Sienge, nos nomes do Quadro (unidade do painel: a do cadastro dela)
  situacaoBase: string;       // Sienge + tabela comercial (o "automático")
  situacao: string;           // a que vale (manual por cima)
  origem: OrigemSituacao;
  precoTabela: number | null; // tabela de preços do painel (o que o modal edita)
  preco: number | null;       // preço que vale: tabela de preços, senão tabela comercial
  origemPreco: OrigemPreco | null;
  entraNaContagem: boolean;   // apartamento ou sala comercial: conta em Disp. / Res.Téc.
  valorEstoque: number;       // quanto soma no Valor Estoque: o preço, se está Disponível; senão 0
}

export function linhasDeEstoque(unidades: ApiUnit[], ctx: ContextoEstoque): LinhaEstoque[] {
  const tabelaDe = new Map<string, TabelaComercial | null>();
  return unidades.map(u => {
    if (!tabelaDe.has(u.enterpriseName)) tabelaDe.set(u.enterpriseName, tabelaComercialPara(u.enterpriseName, ctx.tabelasComerciais).tabela);
    const tc = tabelaDe.get(u.enterpriseName) ?? null;
    const unitId = u.id ?? null;
    // Cadastrada só no painel: a situação e o preço são os do cadastro, sem tabela comercial.
    const cadastroPainel = ehDoPainel(unitId);

    const situacaoSienge = situacaoDaUnidade(u.commercialStock, false);
    const situacaoBase = cadastroPainel ? situacaoSienge : aplicarTabelaComercial(situacaoSienge, u.name, tc);
    const manual = unitId != null ? ctx.situacoesManuais.get(unitId) : undefined;
    const situacao = manual ?? situacaoBase;
    const origem: OrigemSituacao = cadastroPainel ? "painel" : manual ? "manual" : situacaoBase !== situacaoSienge ? "tabela" : "sienge";

    const digitado = unitId != null ? ctx.precos.get(unitId) : undefined;
    const precoTabela = digitado && digitado > 0 ? digitado : null;
    const daComercial = cadastroPainel ? 0 : precoDaTabelaComercial(u.name, tc);
    const preco = precoTabela ?? (daComercial > 0 ? daComercial : null);
    const origemPreco: OrigemPreco | null = precoTabela !== null ? (cadastroPainel ? "painel" : "tabela-precos") : preco !== null ? "tabela-comercial" : null;

    const area = u.privateArea || 0;
    const entraNaContagem = contaNoEstoque(u);
    // Só o preço do painel vale; sem preço não soma (a estimativa por área saiu em 10/11/2026).
    const valorEstoque = situacao === "Disponível" ? (preco ?? 0) : 0;

    return {
      unitId,
      enterpriseId: u.enterpriseId ?? null,
      empresa: u.companyName,
      empreendimento: u.enterpriseName,
      unidade: u.name,
      contrato: u.contractNumber || "",
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
      valorEstoque,
    };
  });
}

export interface TotaisEstoque {
  qtDisp: number;          // apartamentos + salas disponíveis (qtDispApto + qtDispSala)
  qtDispApto: number;      // coluna Disp. Ap.
  qtDispSala: number;      // coluna Disp. Sala
  qtResTec: number;        // coluna Res.Téc.
  valorEstoque: number;    // coluna Valor Estoque
  comPreco: number;        // disponíveis com preço: as que somam no valor
  valorComPreco: number;
  semPreco: number;        // apartamentos e salas disponíveis sem preço: contam, não somam
  foraDaContagem: number;  // disponíveis com preço que não entram na contagem (vaga, box…)
  valorReservado: number;  // reservadas a preço de tabela (informativo; não soma no estoque)
}

export const TOTAIS_VAZIOS: TotaisEstoque = {
  qtDisp: 0, qtDispApto: 0, qtDispSala: 0, qtResTec: 0, valorEstoque: 0, comPreco: 0, valorComPreco: 0,
  semPreco: 0, foraDaContagem: 0, valorReservado: 0,
};

export function totaisDoEstoque(linhas: LinhaEstoque[]): TotaisEstoque {
  const t = { ...TOTAIS_VAZIOS };
  for (const l of linhas) {
    if (l.situacao === "Disponível") {
      if (l.entraNaContagem) {
        t.qtDisp++;
        // Uma coluna para cada no Resumo (Edielson, 10/11/2026: "disp ap e disp sala").
        if (grupoDoTipo(l.tipo) === "Sala comercial") t.qtDispSala++; else t.qtDispApto++;
      }
      t.valorEstoque += l.valorEstoque;
      if (l.preco !== null) {
        t.comPreco++;
        t.valorComPreco += l.preco;
        if (!l.entraNaContagem) t.foraDaContagem++;
      } else if (l.entraNaContagem) {
        t.semPreco++;
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

// "apartamentos", "salas comerciais": o grupo no plural, para frases do modal.
export const pluralDoGrupo = (grupo: string): string => PLURAL[grupo] ?? grupo.toLowerCase();

// Valor do estoque que o filtro de TIPO do modal deixa fora da lista (Edielson,
// 10/11/2026: no Hannover o cartão dizia R$ 3.000.000,00 e a lista, aberta só em
// apartamentos, não tinha nenhum preço — o valor era das 2 salas comerciais).
// Os cartões são da empresa inteira; a lista segue o tipo. Devolve as unidades
// disponíveis com preço que não são do tipo filtrado, a soma delas e os grupos
// em que estão (na ordem de ORDEM_GRUPOS). Sem filtro de tipo, nada fica de fora.
export function valorForaDoTipo(linhas: LinhaEstoque[], grupo: string): { valor: number; linhas: LinhaEstoque[]; grupos: string[] } {
  if (!grupo) return { valor: 0, linhas: [], grupos: [] };
  const fora = linhas.filter(l => l.situacao === "Disponível" && l.valorEstoque > 0 && grupoDoTipo(l.tipo) !== grupo);
  const grupos = ORDEM_GRUPOS.filter(g => fora.some(l => grupoDoTipo(l.tipo) === g));
  return { valor: fora.reduce((soma, l) => soma + l.valorEstoque, 0), linhas: fora, grupos };
}

export function composicaoPorTipo(linhas: LinhaEstoque[]): string {
  const n = new Map<string, number>();
  for (const l of linhas) n.set(grupoDoTipo(l.tipo), (n.get(grupoDoTipo(l.tipo)) || 0) + 1);
  return ORDEM_GRUPOS.filter(g => n.has(g)).map(g => `${n.get(g)} ${n.get(g) === 1 ? SINGULAR[g] : PLURAL[g]}`).join(" · ");
}

// ── Modal Estoque: tipo com que abre e unidades que dá para liberar ──

// O modal abre já só com os apartamentos (Edielson, 10/11/2026: "que venham
// sempre já em padrão somente os apartamentos"). Recebe as linhas da lista com
// que ele abre (em estoque, disponíveis ou reservadas): sem apartamento nela —
// o estoque da Tesla é só sala, vaga e box — abre com todos os tipos, senão a
// lista viria vazia.
export function grupoInicialDoModal(linhas: Pick<LinhaEstoque, "tipo">[]): string {
  return linhas.some(l => grupoDoTipo(l.tipo) === "Apartamento") ? "Apartamento" : "";
}

// Unidades que dá para LIBERAR para venda no painel (Edielson, 10/11/2026): as
// do Sienge que hoje não estão Disponíveis — reserva técnica, ou apartamento em
// nome de sócio (João Paulo, Carlos Humberto) que voltou a ficar à venda. A
// planilha "Relação apartamentos" do comercial lista essas; o Sienge não.
// Vale para qualquer empresa ("vai acontecer para vários empreendimentos").
// Liberar = situação manual "Disponível" (nada vai para o Sienge).
// Ficam fora a cadastrada só no painel (a situação dela é a do próprio
// cadastro) e a que não tem id do Sienge (não há onde gravar).
// Ordem: a que começa com o digitado, depois as reservadas, depois pelo número.
export function candidatasALiberar(linhas: LinhaEstoque[], filtro: { grupo?: string; busca?: string } = {}): LinhaEstoque[] {
  const busca = (filtro.busca || "").trim().toLowerCase();
  const comeca = (l: LinhaEstoque) => (busca && l.unidade.toLowerCase().startsWith(busca) ? 0 : 1);
  const reservada = (l: LinhaEstoque) => (l.situacao === "Reservado" ? 0 : 1);
  return linhas
    .filter(l => l.situacao !== "Disponível" && l.unitId !== null && l.enterpriseId !== null && !ehDoPainel(l.unitId))
    .filter(l => (!filtro.grupo || grupoDoTipo(l.tipo) === filtro.grupo) && (!busca || l.unidade.toLowerCase().includes(busca)))
    .sort((a, b) => comeca(a) - comeca(b) || reservada(a) - reservada(b)
      || a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }) || a.empreendimento.localeCompare(b.empreendimento, "pt-BR"));
}

// O que gravar para liberar: se o automático (Sienge + tabela comercial) já é
// Disponível, basta tirar o ajuste manual que segurava a unidade ("auto");
// senão, Disponível à mão.
export const situacaoParaLiberar = (l: Pick<LinhaEstoque, "situacaoBase">): SituacaoManual | "auto" =>
  l.situacaoBase === "Disponível" ? "auto" : "Disponível";

// Liberada no painel: Disponível à mão numa unidade que, no automático, não está.
export const liberadaNoPainel = (l: Pick<LinhaEstoque, "origem" | "situacao" | "situacaoBase">): boolean =>
  l.origem === "manual" && l.situacao === "Disponível" && l.situacaoBase !== "Disponível";
