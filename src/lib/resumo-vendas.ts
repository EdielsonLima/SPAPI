// Resumo do empreendimento para os cards do Quadro Espelho 3D (botão
// "Resumo"). Regras pedidas pelo Edielson (26/10/2026):
// - VGV e ticket médio só com VENDAS de verdade (situação "Vendido"): permuta
//   e vendido por terceiros ficam de fora do R$, mas entram nas contagens.
// - R$/m² vendido = VGV ÷ área privativa das vendidas com valor e área.
// - Estoque à tabela = soma do preço de tabela das disponíveis (as sem preço
//   são contadas à parte para o número não parecer completo quando não é).

export interface UnidadeResumo { id: string; situacao: string; area: number; valor: number; preco: number }

export interface ResumoVendas {
  total: number;
  vendidas: number;          // "Vendido"
  permuta: number;           // "Permutante"
  terceiros: number;         // "Vendido/Terceiros"
  disponiveis: number;       // "Disponível"
  reservadas: number;        // "Reservado" + "Proposta"
  pctVendido: number;        // vendidas + permuta + terceiros sobre o total (como o "% vendido" do Quadro)
  vgv: number;               // soma dos contratos das "Vendido"
  vendidasComValor: number;  // quantas "Vendido" têm valor de contrato
  ticket: number;            // vgv ÷ vendidasComValor
  areaVendida: number;       // área privativa das "Vendido" com valor e área
  m2Vendido: number;         // vgv das com área ÷ areaVendida
  estoqueTabela: number;     // soma do preço de tabela das disponíveis
  disponiveisComPreco: number;
  areaDisponivelComPreco: number;
  m2Tabela: number;          // estoqueTabela ÷ área das disponíveis com preço
}

const arred = (v: number) => Math.round(v * 100) / 100;

export function resumoVendas(unidades: UnidadeResumo[]): ResumoVendas {
  const us = unidades.filter(u => u.id);
  const por = (s: string) => us.filter(u => u.situacao === s);
  const vend = por("Vendido"), perm = por("Permutante"), terc = por("Vendido/Terceiros"), disp = por("Disponível");
  const reservadas = us.filter(u => u.situacao === "Reservado" || u.situacao === "Proposta").length;
  const comValor = vend.filter(u => u.valor > 0);
  const vgv = arred(comValor.reduce((s, u) => s + u.valor, 0));
  const comArea = comValor.filter(u => u.area > 0);
  const areaVendida = arred(comArea.reduce((s, u) => s + u.area, 0));
  const vgvComArea = comArea.reduce((s, u) => s + u.valor, 0);
  const dispPreco = disp.filter(u => u.preco > 0);
  const estoqueTabela = arred(dispPreco.reduce((s, u) => s + u.preco, 0));
  const dispPrecoArea = dispPreco.filter(u => u.area > 0);
  const areaDisponivelComPreco = arred(dispPrecoArea.reduce((s, u) => s + u.area, 0));
  const total = us.length;
  return {
    total,
    vendidas: vend.length, permuta: perm.length, terceiros: terc.length, disponiveis: disp.length, reservadas,
    pctVendido: total ? Math.round(((vend.length + perm.length + terc.length) / total) * 1000) / 10 : 0,
    vgv, vendidasComValor: comValor.length,
    ticket: comValor.length ? arred(vgv / comValor.length) : 0,
    areaVendida, m2Vendido: areaVendida ? arred(vgvComArea / areaVendida) : 0,
    estoqueTabela, disponiveisComPreco: dispPreco.length, areaDisponivelComPreco,
    m2Tabela: areaDisponivelComPreco ? arred(dispPrecoArea.reduce((s, u) => s + u.preco, 0) / areaDisponivelComPreco) : 0,
  };
}
