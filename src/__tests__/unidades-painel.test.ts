// Trava das unidades cadastradas só no painel (Painel › Resumo › Estoque):
// entram no estoque como as do Sienge, com id negativo, preço e situação do
// próprio cadastro, sem tabela comercial; saem da conta quando o Sienge tem a
// mesma unidade (mesmo empreendimento e mesmo nome).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linhasDeEstoque, totaisDoEstoque, totaisPorEmpresa, type ContextoEstoque } from "../lib/estoque-resumo";
import {
  chaveDoNome, separarDuplicadas, comoUnidadeApi, unidadesComPainel, precosComPainel,
  idNoEstoque, idDoPainel, ehDoPainel, ehTipoPainel, type UnidadePainel,
} from "../lib/unidades-painel";
import { normalizarTabelaComercial } from "../lib/tabela-comercial";
import type { ApiUnit } from "../lib/comercial-utils";

const CUB = 3182.95;
const sienge = (id: number, nome: string, estoque: string, area: number, tipo = "Salas Comerciais", emp = "135 JARDINS - COMERCIAL", enterpriseId = 10): ApiUnit => ({
  id, enterpriseId, enterpriseName: emp, companyName: "135 JARDINS", name: nome, propertyType: tipo,
  commercialStock: estoque, floor: "", contractNumber: "", privateArea: area,
});
let proximo = 1;
const painel = (unidade: string, extra: Partial<UnidadePainel> = {}): UnidadePainel => ({
  id: proximo++, empresa: "135 JARDINS", empreendimento: "135 JARDINS - COMERCIAL", enterpriseId: 10,
  unidade, tipo: "Sala comercial", area: 60, situacao: "Disponível", preco: null,
  criadoPor: "teste", criadoEm: "2026-11-09", atualizadoPor: "teste", atualizadoEm: "2026-11-09", ...extra,
});
const ctx = (extra: Partial<ContextoEstoque> = {}): ContextoEstoque => ({
  precos: new Map(), tabelasComerciais: new Map(), situacoesManuais: new Map(),
  fator: () => 1.5, cub: CUB, ...extra,
});
const perto = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.005, `${a} ≠ ${b}`);

// ── 1. Nome comparável ──
assert.equal(chaveDoNome("Sala 01"), chaveDoNome("SALA 1"));
assert.equal(chaveDoNome("  sala   08 "), "SALA 8");
assert.equal(chaveDoNome("Salão 3"), "SALAO 3");
assert.equal(chaveDoNome("SALA 10"), "SALA 10");     // zero do meio fica
assert.notEqual(chaveDoNome("SALA 10"), chaveDoNome("SALA 1"));

// ── 2. Id negativo, nunca bate com o do Sienge ──
assert.equal(idNoEstoque(7), -7);
assert.equal(idDoPainel(-7), 7);
assert.equal(ehDoPainel(-7), true);
assert.equal(ehDoPainel(7), false);
assert.equal(ehDoPainel(null), false);
const api = comoUnidadeApi(painel("SALA 08", { situacao: "Reservado", area: 72.5 }));
assert.ok((api.id ?? 0) < 0);
assert.equal(api.commercialStock, "Reserva Técnica");
assert.equal(api.privateArea, 72.5);
assert.equal(api.companyName, "135 JARDINS");

// ── 3. Duplicada: a do Sienge vale, a do painel sai da conta ──
{
  const doSienge = [sienge(101, "SALA 01", "Disponível", 56.24), sienge(108, "SALA 08", "Disponível", 70, "Salas Comerciais", "OUTRO EMPREENDIMENTO", 99)];
  const s1 = painel("Sala 1");                                  // = SALA 01 do mesmo empreendimento
  const s8 = painel("SALA 08");                                 // SALA 08 do Sienge é de outro empreendimento
  const s9 = painel("SALA 09", { enterpriseId: null });         // sem id: compara pelo nome do empreendimento
  const { validas, duplicadas } = separarDuplicadas([s1, s8, s9], doSienge);
  assert.deepEqual(validas.map(v => v.unidade), ["SALA 08", "SALA 09"]);
  assert.equal(duplicadas.length, 1);
  assert.equal(duplicadas[0].sienge.id, 101);
  const juntas = unidadesComPainel(doSienge, [s1, s8, s9]);
  assert.equal(juntas.length, 4);                               // 2 do Sienge + 2 do painel
  assert.equal(juntas.filter(u => (u.id ?? 0) < 0).length, 2);
  assert.equal(unidadesComPainel(doSienge, []), doSienge);      // sem painel: a mesma lista
}

// ── 4. Nas contas do estoque ──
{
  const doSienge = [sienge(101, "SALA 01", "Disponível", 56.24)];
  const semPreco = painel("SALA 08", { area: 80 });
  const comPreco = painel("SALA 09", { preco: 450_000 });
  const reservada = painel("SALA 10", { situacao: "Reservado", preco: 300_000 });
  const vendida = painel("SALA 11", { situacao: "Vendido", preco: 999_999 });
  const lista = [semPreco, comPreco, reservada, vendida];
  const linhas = linhasDeEstoque(unidadesComPainel(doSienge, lista), ctx({ precos: precosComPainel(new Map(), lista) }));
  const t = totaisDoEstoque(linhas);
  assert.equal(t.qtDisp, 3);                                    // SALA 01 (Sienge), 08 e 09 (painel)
  assert.equal(t.qtResTec, 1);                                  // SALA 10
  perto(t.valorEstoque, 56.24 * 1.5 * CUB + 80 * 1.5 * CUB + 450_000);
  assert.equal(t.valorReservado, 300_000);
  const l8 = linhas.find(l => l.unidade === "SALA 08")!;
  assert.equal(l8.origem, "painel");
  assert.equal(l8.estimado, true);
  assert.equal(l8.entraNaContagem, true);
  const l9 = linhas.find(l => l.unidade === "SALA 09")!;
  assert.equal(l9.origemPreco, "painel");
  assert.equal(l9.precoTabela, 450_000);
  assert.equal(linhas.find(l => l.unidade === "SALA 11")!.situacao, "Vendido");
  assert.equal(linhas.find(l => l.unidade === "SALA 01")!.origem, "sienge");
  // Por empresa: a do painel cai na linha da empresa dela.
  assert.equal(totaisPorEmpresa(linhas).get("135 JARDINS")!.qtDisp, 3);
}

// ── 5. Tabela comercial não mexe na unidade do painel ──
{
  const tc = normalizarTabelaComercial({ referencia: "teste", disponiveis: ["SALA 01"], precos: { "SALA 08": 1_000_000 } });
  const tabelasComerciais = new Map([["135-jardins", tc]]);
  const s8 = painel("SALA 08");
  const linhas = linhasDeEstoque(unidadesComPainel([sienge(101, "SALA 01", "Disponível", 56.24), sienge(102, "SALA 02", "Disponível", 66.54)], [s8]), ctx({ tabelasComerciais }));
  assert.equal(linhas.find(l => l.unidade === "SALA 02")!.situacao, "Vendido"); // prova: a tabela vale para o empreendimento
  const l8 = linhas.find(l => l.unidade === "SALA 08")!;
  assert.equal(l8.situacao, "Disponível");                      // fora da tabela comercial e mesmo assim disponível
  assert.equal(l8.preco, null);                                 // o preço da tabela comercial não vale para ela
  assert.equal(l8.origem, "painel");
}

// ── 6. Simulação do modal: situação digitada vale por cima até salvar ──
{
  const s8 = painel("SALA 08");
  const linhas = linhasDeEstoque(unidadesComPainel([], [s8]), ctx({ situacoesManuais: new Map([[idNoEstoque(s8.id), "Vendido"]]) }));
  assert.equal(linhas[0].situacao, "Vendido");
  assert.equal(linhas[0].origem, "painel");
  assert.equal(totaisDoEstoque(linhas).qtDisp, 0);
}

// ── 7. Apartamento só no painel (10/11/2026): conta em Disp. Ap. e é estimado como o do Sienge ──
{
  assert.equal(ehTipoPainel("Apartamento"), true);
  assert.equal(ehTipoPainel("Sala comercial"), true);
  assert.equal(ehTipoPainel("Vaga"), false);
  const rozza = (unidade: string, extra: Partial<UnidadePainel> = {}) =>
    painel(unidade, { empresa: "ROZZA", empreendimento: "ROZZA - DESPESAS INDIRETAS - SP", enterpriseId: 17, tipo: "Apartamento", area: 145, ...extra });
  const noSienge = [
    sienge(1488, "901", "Disponível", 0, "Apartamento", "ROZZA - DESPESAS INDIRETAS - SP", 17),
    sienge(1372, "1801", "Vendida", 145, "Apartamento", "ROZZA - DESPESAS INDIRETAS - SP", 17),
  ].map(u => ({ ...u, companyName: "ROZZA" }));
  const doPainel = [rozza("101"), rozza("102"), rozza("1702", { preco: 2_900_000 }), rozza("COBERTURA", { area: 0 })];
  const linhas = linhasDeEstoque(unidadesComPainel(noSienge, doPainel), ctx({ precos: precosComPainel(new Map(), doPainel) }));
  const t = totaisDoEstoque(linhas);
  assert.equal(t.qtDispApto, 5);      // 901 do Sienge + 4 do painel
  assert.equal(t.qtDispSala, 0);
  assert.equal(t.estimadas, 2);       // 101 e 102: 145 m² × 1,5 × CUB
  assert.equal(t.comPreco, 1);        // 1702
  assert.equal(t.semValor, 2);        // 901 (área zero no Sienge) e a cobertura sem área: contam, não somam
  perto(t.valorEstoque, 2 * 145 * 1.5 * CUB + 2_900_000);
  const l101 = linhas.find(l => l.unidade === "101")!;
  assert.equal(l101.origem, "painel");
  assert.equal(l101.tipo, "Apartamento");
  assert.equal(l101.entraNaContagem, true);
  // Se o apartamento for cadastrado no Sienge com o mesmo nome, vale o de lá.
  const depois = [...noSienge, { ...sienge(2000, "101", "Vendida", 145, "Apartamento", "ROZZA - DESPESAS INDIRETAS - SP", 17), companyName: "ROZZA" }];
  assert.deepEqual(separarDuplicadas(doPainel, depois).duplicadas.map(d => d.painel.unidade), ["101"]);
  assert.equal(totaisDoEstoque(linhasDeEstoque(unidadesComPainel(depois, doPainel), ctx())).qtDispApto, 4);
}

// ── 8. Carga de 10/11/2026: 42 apartamentos (Domus 15, Rozza 10, Tetra 17), sem repetido ──
{
  const carga = JSON.parse(readFileSync(new URL("../../scripts/dados/apartamentos-painel-2026-11-10.json", import.meta.url), "utf-8")) as {
    empresas: { empresa: string; empreendimento: string; enterpriseId: number; area: number; unidades: string[] }[];
  };
  assert.deepEqual(carga.empresas.map(e => [e.empresa, e.enterpriseId, e.area, e.unidades.length]), [["DOMUS", 27, 0, 15], ["ROZZA", 17, 145, 10], ["TETRA", 31, 180, 17]]);
  assert.equal(carga.empresas.reduce((n, e) => n + e.unidades.length, 0), 42);
  for (const e of carga.empresas) {
    assert.equal(new Set(e.unidades.map(chaveDoNome)).size, e.unidades.length, `${e.empresa}: unidade repetida`);
    assert.ok(e.empreendimento.startsWith(e.empresa), e.empreendimento);
  }
}

console.log("unidades-painel: ok");
