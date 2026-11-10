// Trava da tabela comercial manual (disponíveis + preços por cima do Sienge).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarTabelaComercial, validarTabelaComercial, aplicarTabelaComercial, precoDaTabelaComercial, sobrescritaPelaTabela, nomeUnidade, tabelaComercialPara } from "../lib/tabela-comercial";
import { chaveDoEmpreendimento } from "../lib/condicoes-pagamento";

const seed = JSON.parse(readFileSync(new URL("../../scripts/dados/tabela-comercial-palacio-2026-10.json", import.meta.url), "utf-8"));
const t = normalizarTabelaComercial(seed.dados);

// Seed do Palácio: 12 disponíveis (vermelhas no PDF), preços válidos, entrega 2030.
assert.equal(seed.chave, "palacio-elizabeth");
assert.equal(chaveDoEmpreendimento(undefined, "PALACIO ELIZABETH"), seed.chave);
assert.equal(t.disponiveis.length, 12);
assert.equal(validarTabelaComercial(t), null);
assert.equal(t.entrega, "2030-12");
assert.equal(t.precos["102"], 4950000);
assert.equal(t.precos["3202"], 5100000);
// Toda disponível tem preço.
t.disponiveis.forEach(u => assert.ok(t.precos[u] > 0, u));

// Regras de situação.
assert.equal(aplicarTabelaComercial("Vendido", "602", t), "Disponível");        // tabela manda
assert.equal(aplicarTabelaComercial("Disponível", "AP602", t), "Disponível");   // "AP602" e "602" são a mesma unidade
assert.equal(aplicarTabelaComercial("Vendido", "3102", t), "Disponível");       // vendida no Sienge, à venda na tabela
assert.equal(aplicarTabelaComercial("Disponível", "AP701", t), "Vendido");      // Sienge livre, tabela vendida
assert.equal(aplicarTabelaComercial("Reservado", "AP801", t), "Vendido");
assert.equal(aplicarTabelaComercial("Permutante", "AP901", t), "Permutante");   // não mexe
assert.equal(aplicarTabelaComercial("Vendido", "AP901", t), "Vendido");
assert.equal(aplicarTabelaComercial("Disponível", "AP701", null), "Disponível"); // sem tabela, Sienge
assert.equal(sobrescritaPelaTabela("Disponível", "AP701", t), true);
assert.equal(sobrescritaPelaTabela("Disponível", "602", t), false);
assert.equal(precoDaTabelaComercial("AP601", t), 4500000);
assert.equal(precoDaTabelaComercial("1801", t), 0);

// Nome da unidade e chave do empreendimento tolerantes ao cadastro do Sienge.
assert.equal(nomeUnidade("AP 102"), "102");
assert.equal(nomeUnidade("ap3202"), "3202");
assert.equal(nomeUnidade("102"), "102");
const mapa = new Map([["palacio-elizabeth", t]]);
assert.equal(tabelaComercialPara("EDIFÍCIO PALÁCIO ELIZABETH", mapa).chave, "palacio-elizabeth");
assert.equal(tabelaComercialPara("PALACIO ELIZABETH", mapa).tabela, t);
assert.equal(tabelaComercialPara("SERENITY", mapa).tabela, null);
assert.equal(tabelaComercialPara("SERENITY", mapa).chave, "serenity");

// Normalização limpa lixo.
const n = normalizarTabelaComercial({ referencia: "  x ", disponiveis: ["ap1", "AP1", "", null as unknown as string], precos: { ap2: "10" as unknown as number, AP3: -5, AP4: 0 }, entrega: "12/2030" });
assert.deepEqual(n, { referencia: "x", disponiveis: ["1"], precos: { "2": 10 } });
// Ajuste de 10/11/2026: disponibilidade do Palácio pela planilha "Relação apartamentos"
// do comercial (Edielson: "as disponibilidades são essas em branco"). O migrate troca só
// a lista de disponíveis; os preços de outubro ficam.
{
  const ajuste = JSON.parse(readFileSync(new URL("../../scripts/dados/disponibilidade-palacio-2026-11-10.json", import.meta.url), "utf-8"));
  assert.equal(ajuste.chave, seed.chave);
  const t2 = normalizarTabelaComercial({ ...seed.dados, disponiveis: ajuste.disponiveis });
  assert.equal(validarTabelaComercial(t2), null);
  assert.deepEqual(t2.disponiveis, ["102", "201", "301", "401", "501", "502", "601", "602", "701", "1202", "1801"]);
  assert.equal(new Set(t2.disponiveis).size, 11);
  // Nenhuma unidade de sócio (linha com nome na planilha) na lista de disponíveis.
  const foraDaVenda = ajuste._foraDaVenda as string[];
  assert.equal(foraDaVenda.length, 15);
  foraDaVenda.forEach(u => assert.ok(!t2.disponiveis.includes(u), u));
  // Saem 402, 3102 e 3202; 1501 e 1502 seguem fora mesmo livres no Sienge.
  assert.equal(aplicarTabelaComercial("Disponível", "402", t2), "Vendido");
  assert.equal(aplicarTabelaComercial("Vendido", "3102", t2), "Vendido");
  assert.equal(aplicarTabelaComercial("Permutante", "3202", t2), "Permutante");
  assert.equal(aplicarTabelaComercial("Disponível", "1501", t2), "Vendido");
  assert.equal(aplicarTabelaComercial("Disponível", "1502", t2), "Vendido");
  // Entram 701 (vendida no Sienge, livre na planilha) e 1801 (livre nos dois).
  assert.equal(aplicarTabelaComercial("Vendido", "701", t2), "Disponível");
  assert.equal(aplicarTabelaComercial("Disponível", "1801", t2), "Disponível");
  assert.equal(precoDaTabelaComercial("701", t2), 4500000); // preço de outubro
  assert.equal(precoDaTabelaComercial("1801", t2), 0);      // sem preço: entra pela estimativa até cadastrarem
  // Valor a preço de tabela das 10 com preço: R$ 45.400.000,00.
  assert.equal(t2.disponiveis.reduce((s, u) => s + (t2.precos[u] || 0), 0), 45_400_000);
}

console.log("tabela-comercial: ok");
