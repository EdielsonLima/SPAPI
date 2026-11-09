// Trava do estoque do Resumo Financeiro (Valor Estoque, Disp., Res.Téc.) e do
// modal Estoque: situação em camadas (manual > tabela comercial > Sienge) e
// valor por preço de tabela, com a estimativa de antes quando não há preço.
import assert from "node:assert/strict";
import {
  linhasDeEstoque, totaisDoEstoque, totaisPorEmpresa, entraPeloNome, aplicarSituacaoManual,
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

// ── 1. Sem nada manual, os números são os de antes ──
// Regra antiga: unidade que passa pelo nome, Disponível → conta e soma
// área × fator × CUB; Reserva Técnica → conta em Res.Téc.
const rozza = [
  un("ROZZA", "901", "Disponível", 137.75),
  un("ROZZA", "G 63", "Disponível", 22.5, "Vaga de Garagem Dupla"),   // vaga passa pelo nome (regra de sempre)
  un("ROZZA", "SALA 01", "Disponível", 80, "Salas Comerciais"),        // sala fica de fora
  un("ROZZA", "201", "Reserva Técnica", 137.75),
  un("ROZZA", "301", "Vendida", 137.75),
  un("ROZZA", "401", "Proposta", 137.75),
];
{
  const t = totaisDoEstoque(linhasDeEstoque(rozza, ctx()));
  assert.equal(t.qtDisp, 2);
  assert.equal(t.qtResTec, 1);
  const antigo = 137.75 * 1.2 * CUB + 22.5 * 1.2 * CUB; // mesma conta de antes, na mesma ordem
  assert.equal(t.valorEstoque, antigo);
  assert.equal(t.estimadas, 2);
  assert.equal(t.comPreco, 0);
  assert.equal(t.foraDaContagem, 0);
}

// Regra do nome, igual à que estava dentro do painel.
assert.equal(entraPeloNome("901"), true);
assert.equal(entraPeloNome("G 63"), true);            // é assim que a vaga se chama no Sienge da SP
assert.equal(entraPeloNome("PER-HANN.G34"), true);
assert.equal(entraPeloNome("VAGA 12"), false);
assert.equal(entraPeloNome("SALA 01"), false);
assert.equal(entraPeloNome("MALBEC SALA 03"), false);
assert.equal(entraPeloNome("ARMARIO BOX 03"), false);
assert.equal(entraPeloNome("LOJA 2"), false);

// ── 2. Preço de tabela entra no lugar da estimativa ──
{
  const precos = new Map<number, number>([[rozza[0].id!, 2_350_000], [rozza[2].id!, 900_000], [rozza[3].id!, 2_400_000]]);
  const linhas = linhasDeEstoque(rozza, ctx({ precos }));
  const t = totaisDoEstoque(linhas);
  // 901 pelo preço, G 63 pela estimativa, SALA 01 só porque tem preço.
  perto(t.valorEstoque, 2_350_000 + 22.5 * 1.2 * CUB + 900_000);
  assert.equal(t.qtDisp, 2);              // a sala soma no valor, não na contagem
  assert.equal(t.comPreco, 2);
  assert.equal(t.estimadas, 1);
  assert.equal(t.foraDaContagem, 1);
  assert.equal(t.valorReservado, 2_400_000); // reservada com preço: informativo, fora do estoque
  const l901 = linhas.find(l => l.unidade === "901")!;
  assert.equal(l901.origemPreco, "tabela-precos");
  assert.equal(l901.estimado, false);
  assert.equal(linhas.find(l => l.unidade === "G 63")!.estimado, true);
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
// Palácio: 13 apartamentos e 69 vagas "Disponível" no Sienge → o Resumo mostrava
// 82. A tabela comercial põe 12 à venda (duas delas vendidas no Sienge).
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
  const manuais = new Map<number, SituacaoManual>([[palacio[2].id!, "Disponível"], [palacio[0].id!, "Vendido"]]);
  const t2 = totaisDoEstoque(linhasDeEstoque(palacio, ctx({ tabelasComerciais, situacoesManuais: manuais })));
  assert.equal(t2.qtDisp, 3); // sai a 102, entra a 1501
  perto(t2.valorEstoque, 4_350_000 + 5_100_000 + 170 * 1.5 * CUB); // 1501 sem preço → estimativa
}

// ── 5. Por empresa, e unidade sem área/preço ──
{
  const mistura = [...rozza, un("DOMUS", "1502", "Disponível", 0)];
  const por = totaisPorEmpresa(linhasDeEstoque(mistura, ctx()));
  assert.equal(por.get("ROZZA")!.qtDisp, 2);
  assert.equal(por.get("DOMUS")!.qtDisp, 1);
  assert.equal(por.get("DOMUS")!.valorEstoque, 0);
  assert.equal(por.get("DOMUS")!.semValor, 1); // conta, mas não tem como valer nada: aparece no modal
  // Sem fator cadastrado a estimativa é zero (como antes).
  assert.equal(totaisDoEstoque(linhasDeEstoque(rozza, ctx({ fator: () => 0 }))).valorEstoque, 0);
}

// ── 6. Composição por tipo (o que explica o número da coluna Disp.) ──
assert.equal(grupoDoTipo("Vaga de Garagem Dupla"), "Vaga");
assert.equal(grupoDoTipo("Apartamento (Permuta)"), "Apartamento");
assert.equal(grupoDoTipo("Salas Comerciais"), "Sala comercial");
assert.equal(grupoDoTipo("Armário Box"), "Box");
assert.equal(grupoDoTipo("Veículos (Permuta)"), "Outros");
assert.equal(composicaoPorTipo(linhasDeEstoque(rozza, ctx()).filter(l => l.situacao === "Disponível")), "1 apartamento · 1 sala comercial · 1 vaga");

console.log("estoque-resumo: ok");
