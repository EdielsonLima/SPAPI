// Trava do resumo dos cards do 3D: VGV e ticket só com "Vendido".
import assert from "node:assert/strict";
import { resumoVendas } from "../lib/resumo-vendas";

const u = (id: string, situacao: string, area: number, valor: number, preco = 0) => ({ id, situacao, area, valor, preco });
const r = resumoVendas([
  u("1", "Vendido", 163, 4_000_000),
  u("2", "Vendido", 163, 4_200_000),
  u("3", "Vendido", 0, 3_800_000),          // sem área: entra no VGV/ticket, não no m²
  u("4", "Vendido", 163, 0),                // sem valor de contrato: conta como vendida, não no VGV
  u("5", "Permutante", 163, 4_500_000),     // permuta: fora do R$
  u("6", "Vendido/Terceiros", 163, 4_100_000), // terceiros: fora do R$
  u("7", "Disponível", 163, 0, 4_500_000),
  u("8", "Disponível", 206.16, 0, 4_950_000),
  u("9", "Disponível", 163, 0),             // sem preço de tabela
  u("10", "Reservado", 163, 0),
  { id: "", situacao: "", area: 0, valor: 0, preco: 0 }, // pavimento sem unidade: ignorado
]);

assert.equal(r.total, 10);
assert.equal(r.vendidas, 4);
assert.equal(r.permuta, 1);
assert.equal(r.terceiros, 1);
assert.equal(r.disponiveis, 3);
assert.equal(r.reservadas, 1);
assert.equal(r.pctVendido, 60);                         // (4 + 1 + 1) / 10
assert.equal(r.vgv, 12_000_000);                        // só "Vendido" com valor
assert.equal(r.vendidasComValor, 3);
assert.equal(r.ticket, 4_000_000);
assert.equal(r.areaVendida, 326);                       // só as com valor E área
assert.equal(r.m2Vendido, Math.round((8_200_000 / 326) * 100) / 100);
assert.equal(r.estoqueTabela, 9_450_000);
assert.equal(r.disponiveisComPreco, 2);
assert.equal(r.areaDisponivelComPreco, 369.16);
assert.equal(r.m2Tabela, Math.round((9_450_000 / 369.16) * 100) / 100);

// Vazio não quebra.
const z = resumoVendas([]);
assert.equal(z.total, 0); assert.equal(z.ticket, 0); assert.equal(z.m2Vendido, 0); assert.equal(z.pctVendido, 0);
console.log("resumo-vendas: ok");
