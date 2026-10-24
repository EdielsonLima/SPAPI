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
console.log("tabela-comercial: ok");
