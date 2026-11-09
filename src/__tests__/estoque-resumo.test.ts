// Trava do estoque do Resumo Financeiro (Valor Estoque, Disp., Res.Téc.) e do
// modal Estoque: só apartamento conta (pelo tipo do cadastro do Sienge),
// situação em camadas (manual > tabela comercial > Sienge) e valor por preço de
// tabela, com a estimativa área × fator × CUB só para apartamento sem preço.
import assert from "node:assert/strict";
import {
  linhasDeEstoque, totaisDoEstoque, totaisPorEmpresa, ehApartamento, aplicarSituacaoManual,
  ehSituacaoManual, composicaoPorTipo, grupoDoTipo, type ContextoEstoque, type SituacaoManual,
} from "../lib/estoque-resumo";
import { normalizarTabelaComercial, type TabelaComercial } from "../lib/tabela-comercial";
import type { ApiUnit } from "../lib/comercial-utils";

let proximoId = 1;
const un = (empresa: string, nome: string, estoque: string, area: number, tipo = "Apartamento", empreendimento = `${empresa} - COMERCIAL`): ApiUnit => ({
  id: proximoId++, enterpriseId: 10, enterpriseName: empreendimento, companyName: empresa,
  name: nome, propertyType: tipo, commercialStock: estoque, floor: "", contractNumber: "", privateArea: area,
});
const CUB = 3182.95;
const ctx = (extra: Partial<ContextoEstoque> = {}): ContextoEstoque => ({
  precos: new Map(), tabelasComerciais: new Map(), situacoesManuais: new Map(),
  fator: e => (e === "ROZZA" ? 1.2 : 1.5), cub: CUB, ...extra,
});
const perto = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.005, `${a} ≠ ${b}`);

// ── 1. Só apartamento conta e é estimado ──
// Até 09/11/2026 a regra olhava o nome e a vaga "G 63" contava como apartamento.
const rozza = [
  un("ROZZA", "901", "Disponível", 137.75),
  un("ROZZA", "G 63", "Disponível", 22.5, "Vaga de Garagem Dupla"),   // vaga: fora da conta, só soma com preço
  un("ROZZA", "SALA 01", "Disponível", 80, "Salas Comerciais"),        // sala: idem
  un("ROZZA", "201", "Reserva Técnica", 137.75),
  un("ROZZA", "301", "Vendida", 137.75),
  un("ROZZA", "401", "Proposta", 137.75),
  un("ROZZA", "G 11", "Reserva Técnica", 12.5, "Vaga de Garagem Simples"), // vaga reservada não conta em Res.Téc.
];
{
  const linhas = linhasDeEstoque(rozza, ctx());
  const t = totaisDoEstoque(linhas);
  assert.equal(t.qtDisp, 1);
  assert.equal(t.qtResTec, 1);
  assert.equal(t.valorEstoque, 137.75 * 1.2 * CUB); // só o 901, pela estimativa
  assert.equal(t.estimadas, 1);
  assert.equal(t.comPreco, 0);
  assert.equal(t.foraDaContagem, 0);
  const vaga = linhas.find(l => l.unidade === "G 63")!;
  assert.equal(vaga.situacao, "Disponível");
  assert.equal(vaga.entraNaContagem, false);
  assert.equal(vaga.estimativa, 0);
  assert.equal(vaga.valorEstoque, 0);
  assert.equal(vaga.estimado, false);
}

// Quem é apartamento: o tipo do cadastro manda; sem tipo, o nome.
const apto = (name: string, propertyType: string) => ehApartamento({ name, propertyType });
assert.equal(apto("901", "Apartamento"), true);
assert.equal(apto("PER-HANN.101", "Apartamento (Permuta)"), true);     // recebido em permuta: é apartamento
assert.equal(apto("G 63", "Vaga de Garagem Dupla"), false);
assert.equal(apto("PER-HANN.G34", "Vaga de Garagem (Permuta)"), false);
assert.equal(apto("68", "Vaga de Garagem Dupla"), false);              // nome de apartamento, tipo de vaga
assert.equal(apto("SALA 01", "Salas Comerciais"), false);
assert.equal(apto("ARMARIO BOX 03", "Armário Box"), false);
assert.equal(apto("PER-CIVIC TOURING", "Veículos (Permuta)"), false);
assert.equal(apto("TERRENO", "Terreno (Permuta)"), false);
assert.equal(apto("1502", ""), true);                                  // sem tipo: vale o nome
assert.equal(apto("G 108", ""), false);                                // "G 108" é como a vaga se chama no Sienge da SP
assert.equal(apto("LOJA 2", ""), false);

// ── 2. Preço de tabela entra no lugar da estimativa; outros tipos só com preço ──
{
  const precos = new Map<number, number>([[rozza[0].id!, 2_350_000], [rozza[1].id!, 120_000], [rozza[2].id!, 900_000], [rozza[3].id!, 2_400_000]]);
  const linhas = linhasDeEstoque(rozza, ctx({ precos }));
  const t = totaisDoEstoque(linhas);
  perto(t.valorEstoque, 2_350_000 + 120_000 + 900_000);
  assert.equal(t.qtDisp, 1);              // vaga e sala somam no valor, não na contagem
  assert.equal(t.comPreco, 3);
  assert.equal(t.estimadas, 0);
  assert.equal(t.foraDaContagem, 2);
  assert.equal(t.valorReservado, 2_400_000); // reservada com preço: informativo, fora do estoque
  const l901 = linhas.find(l => l.unidade === "901")!;
  assert.equal(l901.origemPreco, "tabela-precos");
  assert.equal(l901.estimado, false);
  // Vendida com preço cadastrado não soma.
  assert.equal(linhasDeEstoque(rozza, ctx({ precos: new Map([[rozza[4].id!, 9_999_999]]) })).find(l => l.unidade === "301")!.valorEstoque, 0);
}

// ── 3. Situação manual manda ──
{
  const manuais = new Map<number, SituacaoManual>([
    [rozza[0].id!, "Reservado"],   // disponível no Sienge → reservada à mão
    [rozza[4].id!, "Disponível"],  // vendida no Sienge → volta ao estoque
    [rozza[1].id!, "Vendido"],     // vaga sai do estoque
  ]);
  const linhas = linhasDeEstoque(rozza, ctx({ situacoesManuais: manuais }));
  const t = totaisDoEstoque(linhas);
  assert.equal(t.qtDisp, 1);       // só a 301
  assert.equal(t.qtResTec, 2);     // 201 (Sienge) + 901 (manual)
  assert.equal(t.valorEstoque, 137.75 * 1.2 * CUB);
  const l301 = linhas.find(l => l.unidade === "301")!;
  assert.equal(l301.origem, "manual");
  assert.equal(l301.situacaoSienge, "Vendido");
  assert.equal(l301.situacao, "Disponível");
  assert.equal(linhas.find(l => l.unidade === "201")!.origem, "sienge");
}
assert.equal(aplicarSituacaoManual("Disponível", 7, new Map([[7, "Vendido"]])), "Vendido");
assert.equal(aplicarSituacaoManual("Disponível", 8, new Map([[7, "Vendido"]])), "Disponível");
assert.equal(aplicarSituacaoManual("Disponível", undefined, new Map([[7, "Vendido"]])), "Disponível");
assert.equal(ehSituacaoManual("Reservado"), true);
assert.equal(ehSituacaoManual("Permutante"), false);
assert.equal(ehSituacaoManual(null), false);

// ── 4. Tabela comercial do empreendimento (mesma regra do Quadro Espelho) ──
// Palácio: a tabela comercial põe 12 à venda (duas delas vendidas no Sienge).
{
  const tc: TabelaComercial = normalizarTabelaComercial({
    referencia: "teste", disponiveis: ["102", "201", "3102"], precos: { "102": 4_950_000, "201": 4_350_000, "3102": 5_100_000, "701": 4_500_000 },
  });
  const palacio = [
    un("PALACIO ELIZABETH", "102", "Disponível", 170, "Apartamento", "PALACIO ELIZABETH - DESPESAS INDIRETAS"),
    un("PALACIO ELIZABETH", "201", "Disponível", 170, "Apartamento", "PALACIO ELIZABETH - DESPESAS INDIRETAS"),
    un("PALACIO ELIZABETH", "1501", "Disponível", 170, "Apartamento", "PALACIO ELIZABETH - DESPESAS INDIRETAS"), // fora da tabela → Vendido
    un("PALACIO ELIZABETH", "3102", "Vendida", 170, "Apartamento", "PALACIO ELIZABETH - DESPESAS INDIRETAS"),    // na tabela → Disponível
    un("PALACIO ELIZABETH", "701", "Vendida", 170, "Apartamento", "PALACIO ELIZABETH - DESPESAS INDIRETAS"),     // preço na tabela, mas vendida
    un("PALACIO ELIZABETH", "G 100", "Disponível", 1, "Vaga de Garagem Dupla", "PALACIO ELIZABETH - DESPESAS INDIRETAS"), // fora da tabela → Vendido
  ];
  const tabelasComerciais = new Map([["palacio-elizabeth", tc]]);
  const linhas = linhasDeEstoque(palacio, ctx({ tabelasComerciais }));
  const t = totaisDoEstoque(linhas);
  assert.equal(t.qtDisp, 3);
  assert.equal(t.valorEstoque, 4_950_000 + 4_350_000 + 5_100_000);
  assert.equal(t.estimadas, 0);
  assert.equal(linhas.find(l => l.unidade === "1501")!.situacao, "Vendido");
  assert.equal(linhas.find(l => l.unidade === "1501")!.origem, "tabela");
  assert.equal(linhas.find(l => l.unidade === "3102")!.origemPreco, "tabela-comercial");
  assert.equal(linhas.find(l => l.unidade === "G 100")!.situacao, "Vendido");

  // Preço digitado no painel vale mais que o da tabela comercial.
  const comPreco = linhasDeEstoque(palacio, ctx({ tabelasComerciais, precos: new Map([[palacio[0].id!, 5_000_000]]) }));
  assert.equal(comPreco.find(l => l.unidade === "102")!.preco, 5_000_000);
  assert.equal(comPreco.find(l => l.unidade === "102")!.origemPreco, "tabela-precos");

  // E a situação manual vale mais que a tabela comercial, nos dois sentidos.
  // A vaga posta como Disponível à mão, sem preço, não conta nem soma.
  const manuais = new Map<number, SituacaoManual>([[palacio[2].id!, "Disponível"], [palacio[0].id!, "Vendido"], [palacio[5].id!, "Disponível"]]);
  const t2 = totaisDoEstoque(linhasDeEstoque(palacio, ctx({ tabelasComerciais, situacoesManuais: manuais })));
  assert.equal(t2.qtDisp, 3); // sai a 102, entra a 1501
  perto(t2.valorEstoque, 4_350_000 + 5_100_000 + 170 * 1.5 * CUB); // 1501 sem preço → estimativa
}

// ── 5. Por empresa, e apartamento sem área/preço ──
{
  const mistura = [...rozza, un("DOMUS", "1502", "Disponível", 0)];
  const por = totaisPorEmpresa(linhasDeEstoque(mistura, ctx()));
  assert.equal(por.get("ROZZA")!.qtDisp, 1);
  assert.equal(por.get("DOMUS")!.qtDisp, 1);
  assert.equal(por.get("DOMUS")!.valorEstoque, 0);
  assert.equal(por.get("DOMUS")!.semValor, 1); // conta, mas não tem como valer nada: aparece no modal
  // Sem fator cadastrado a estimativa é zero (como antes).
  assert.equal(totaisDoEstoque(linhasDeEstoque(rozza, ctx({ fator: () => 0 }))).valorEstoque, 0);
}

// ── 6. Composição por tipo (o que fica fora da conta, no cartão Disponíveis do modal) ──
assert.equal(grupoDoTipo("Vaga de Garagem Dupla"), "Vaga");
assert.equal(grupoDoTipo("Apartamento (Permuta)"), "Apartamento");
assert.equal(grupoDoTipo("Salas Comerciais"), "Sala comercial");
assert.equal(grupoDoTipo("Armário Box"), "Box");
assert.equal(grupoDoTipo("Veículos (Permuta)"), "Outros");
assert.equal(composicaoPorTipo(linhasDeEstoque(rozza, ctx()).filter(l => l.situacao === "Disponível")), "1 apartamento · 1 sala comercial · 1 vaga");

console.log("estoque-resumo: ok");
