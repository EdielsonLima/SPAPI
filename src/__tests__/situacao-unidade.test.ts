// Trava da situação do Quadro Espelho: npx tsx src/__tests__/situacao-unidade.test.ts
import assert from "node:assert/strict";
import { situacaoDaUnidade, ehVendida, SITUACOES } from "../lib/situacao-unidade";

assert.equal(situacaoDaUnidade("Vendida", false), "Vendido");
assert.equal(situacaoDaUnidade("Vendida", true), "Permutante");
assert.equal(situacaoDaUnidade("Proposta", true), "Proposta"); // proposta segue proposta mesmo em permuta
assert.equal(situacaoDaUnidade("Reserva Técnica", false), "Reservado");
assert.equal(situacaoDaUnidade("Disponível", false), "Disponível");
assert.equal(situacaoDaUnidade("Vendido/Terceiros", false), "Vendido/Terceiros");
assert.equal(situacaoDaUnidade("Locada", false), "Locada");
// "Vendidas" do Quadro = o estoque Vendida de antes (Vendido + Permutante)
assert.ok(ehVendida("Vendido") && ehVendida("Permutante"));
assert.ok(!ehVendida("Vendido/Terceiros") && !ehVendida("Proposta"));
assert.equal(new Set(SITUACOES.map(s => s.cor)).size, SITUACOES.length);
console.log("situacao-unidade: ok");
