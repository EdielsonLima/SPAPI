// Trava da tabela comercial manual (disponíveis + preços por cima do Sienge).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarTabelaComercial, validarTabelaComercial, aplicarTabelaComercial, precoDaTabelaComercial, sobrescritaPelaTabela } from "../lib/tabela-comercial";
import { chaveDoEmpreendimento } from "../lib/condicoes-pagamento";

const seed = JSON.parse(readFileSync(new URL("../../scripts/dados/tabela-comercial-palacio-2026-10.json", import.meta.url), "utf-8"));
const t = normalizarTabelaComercial(seed.dados);

// Seed do Palácio: 12 disponíveis (vermelhas no PDF), preços válidos, entrega 2030.
assert.equal(seed.chave, "palacio-elizabeth");
assert.equal(chaveDoEmpreendimento(undefined, "PALACIO ELIZABETH"), seed.chave);
assert.equal(t.disponiveis.length, 12);
assert.equal(validarTabelaComercial(t), null);
assert.equal(t.entrega, "2030-12");
assert.equal(t.precos.AP102, 4950000);
assert.equal(t.precos.AP3202, 5100000);
// Toda disponível tem preço.
t.disponiveis.forEach(u => assert.ok(t.precos[u] > 0, u));

// Regras de situação.
assert.equal(aplicarTabelaComercial("Vendido", "AP602", t), "Disponível");      // tabela manda
assert.equal(aplicarTabelaComercial("Disponível", "ap602", t), "Disponível");   // caixa não importa
assert.equal(aplicarTabelaComercial("Disponível", "AP701", t), "Vendido");      // Sienge livre, tabela vendida
assert.equal(aplicarTabelaComercial("Reservado", "AP801", t), "Vendido");
assert.equal(aplicarTabelaComercial("Permutante", "AP901", t), "Permutante");   // não mexe
assert.equal(aplicarTabelaComercial("Vendido", "AP901", t), "Vendido");
assert.equal(aplicarTabelaComercial("Disponível", "AP701", null), "Disponível"); // sem tabela, Sienge
assert.equal(sobrescritaPelaTabela("Disponível", "AP701", t), true);
assert.equal(sobrescritaPelaTabela("Disponível", "AP602", t), false);
assert.equal(precoDaTabelaComercial("AP601", t), 4500000);
assert.equal(precoDaTabelaComercial("AP1801", t), 0);

// Normalização limpa lixo.
const n = normalizarTabelaComercial({ referencia: "  x ", disponiveis: ["ap1", "AP1", "", null as unknown as string], precos: { ap2: "10" as unknown as number, AP3: -5, AP4: 0 }, entrega: "12/2030" });
assert.deepEqual(n, { referencia: "x", disponiveis: ["AP1"], precos: { AP2: 10 } });
console.log("tabela-comercial: ok");
