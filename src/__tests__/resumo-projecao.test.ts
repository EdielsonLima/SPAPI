// Trava de "Ainda a Sair" e "Lucro a Realizar" do Resumo: npx tsx src/__tests__/resumo-projecao.test.ts
// Números = abas Resumo e Orçamento do Painel Executivo em produção, 16/11/2026 às 16:27
// (Silva Packer, 10 empresas), as duas telas que o Edielson mandou ao pedir a coluna.
import assert from "node:assert/strict";
import { aindaASair, lucroARealizar, DICA_SEM_SAIDA } from "../lib/resumo-projecao";

const centavos = (a: number, b: number, o: string) => assert.ok(Math.abs(a - b) < 0.005, `${o}: ${a} ≠ ${b}`);

// empresa, finalizada, orçado, realizado (aba Orçamento), ainda a entrar (aba Resumo)
const obras: [string, boolean, number | null, number, number][] = [
  ["EDIFICIO 135 JARDINS", false, 106472589.90, 99031477.52, 42735670.61],
  ["PALACIO ELIZABETH", false, 110334531.57, 39273195.25, 81066360.14],
  ["ROZZA", false, 56877008.86, 15871450.60, 55439779.59],
  ["DOMUS", false, 76930725.40, 11483293.94, 103057697.47],
  ["SERENITY", false, 47555300.54, 19552903.19, 41582659.15],
  ["TETRA", false, 56939148.00, 6569283.17, 73000000.00],
  ["TESLA RESIDENCIAL", true, 54596581.15, 48881848.79, 8757436.33],
  ["SOLAR DI CAPRI", true, null, 31517406.99, 5254396.13],
  ["SOLAR DI SIENA", true, null, 21602819.59, 542141.04],
  ["RESIDENCIAL HANNOVER", true, 23945195.98, 27072185.38, 6056924.48],
];
const saida = (nome: string) => {
  const o = obras.find(x => x[0] === nome)!;
  return aindaASair(o[2] === null ? null : { orcado: o[2], realizado: o[3] }, o[1]);
};

// 1. Obra ativa: Ainda a Sair = coluna "A Realizar" da aba Orçamento.
centavos(saida("EDIFICIO 135 JARDINS").valor, 7441112.38, "135 Jardins");
centavos(saida("PALACIO ELIZABETH").valor, 71061336.32, "Palácio");
centavos(saida("ROZZA").valor, 41005558.26, "Rozza");
centavos(saida("DOMUS").valor, 65447431.46, "Domus");
centavos(saida("SERENITY").valor, 28002397.35, "Serenity");
centavos(saida("TETRA").valor, 50369864.83, "Tetra");
assert.equal(saida("TETRA").motivo, null);

// 2. Finalizada não tem saída, com saldo de orçamento positivo (Tesla, R$ 5.714.732,36),
//    negativo (Hannover, −R$ 3.126.989,40) ou sem orçamento (Capri, Siena).
for (const nome of ["TESLA RESIDENCIAL", "RESIDENCIAL HANNOVER", "SOLAR DI CAPRI", "SOLAR DI SIENA"]) {
  assert.deepEqual(saida(nome), { valor: 0, motivo: "finalizada" }, nome);
}

// 3. Total = cartão "Saldo a Realizar" da aba Orçamento (só ativas, sem negativos).
const totalSaida = obras.reduce((s, o) => s + saida(o[0]).valor, 0);
centavos(totalSaida, 263327700.60, "total Ainda a Sair");

// 4. Lucro a Realizar = Ainda a Entrar − Ainda a Sair, linha a linha e no total.
const lucro = (nome: string) => lucroARealizar(obras.find(x => x[0] === nome)![4], saida(nome).valor);
centavos(lucro("EDIFICIO 135 JARDINS"), 35294558.23, "135 Jardins");
centavos(lucro("PALACIO ELIZABETH"), 10005023.82, "Palácio");
centavos(lucro("TETRA"), 22630135.17, "Tetra");
centavos(lucro("TESLA RESIDENCIAL"), 8757436.33, "Tesla (finalizada = o que ainda entra)");
const totalEntrar = obras.reduce((s, o) => s + o[4], 0);
centavos(totalEntrar, 417493064.94, "total Ainda a Entrar");
centavos(obras.reduce((s, o) => s + lucro(o[0]), 0), 154165364.34, "total Lucro a Realizar");
centavos(lucroARealizar(totalEntrar, totalSaida), 154165364.34, "total pela diferença dos totais");

// 5. Obra ativa sem orçamento: nada a descontar, com o motivo dito.
assert.deepEqual(aindaASair(null, false), { valor: 0, motivo: "sem-orcamento" });
assert.deepEqual(aindaASair(undefined, false), { valor: 0, motivo: "sem-orcamento" });
assert.deepEqual(aindaASair({ orcado: 0, realizado: 500 }, false), { valor: 0, motivo: "sem-orcamento" });

// 6. Obra ativa que já passou do orçamento: o saldo não fica negativo.
assert.deepEqual(aindaASair({ orcado: 1000, realizado: 1500 }, false), { valor: 0, motivo: "estourado" });
assert.deepEqual(aindaASair({ orcado: 1000, realizado: 1000 }, false), { valor: 0, motivo: "estourado" });

// 7. Sai mais do que entra: o lucro a realizar fica negativo (não é escondido).
centavos(lucroARealizar(1000, 1500), -500, "negativo");

// 8. Todo motivo tem texto de dica.
for (const m of ["finalizada", "sem-orcamento", "estourado"] as const) assert.ok(DICA_SEM_SAIDA[m].length > 20);

console.log("resumo-projecao: ok");
