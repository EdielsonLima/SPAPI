// Trava de "Ainda a Sair" e "Lucro a Realizar" do Resumo: npx tsx src/__tests__/resumo-projecao.test.ts
// Números = abas Resumo e Orçamento do Painel Executivo em produção, 16/11/2026 às 16:27
// (Silva Packer, 10 empresas), as duas telas que o Edielson mandou ao pedir a coluna.
import assert from "node:assert/strict";
import { aindaASair, lucroARealizar, margemFinal, DICA_SEM_SAIDA } from "../lib/resumo-projecao";

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

// 9. Margem Final = (Lucro Realizado + Lucro a Realizar) ÷ (Total Recebido + Ainda a Entrar).
//    empresa → [total recebido, total pago] da aba Resumo de 16/11/2026 às 16:27.
const caixa: Record<string, [number, number]> = {
  "EDIFICIO 135 JARDINS": [96907390.94, 99031477.52],
  "PALACIO ELIZABETH": [66621424.24, 39273195.25],
  "ROZZA": [27364836.76, 15871450.60],
  "DOMUS": [22295949.08, 11483293.94],
  "SERENITY": [16705801.95, 19552903.19],
  "TETRA": [4295000, 6569283.17],
  "TESLA RESIDENCIAL": [55592659.27, 48881848.79],
  "SOLAR DI CAPRI": [31899964.67, 31517406.99],
  "SOLAR DI SIENA": [27783607.89, 21602819.59],
  "RESIDENCIAL HANNOVER": [26128948.57, 27072185.38],
};
const pct = (v: number | null, casas = 1) => (v === null ? "-" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%");
const mf = (nome: string) => margemFinal(caixa[nome][0], caixa[nome][1], obras.find(x => x[0] === nome)![4], saida(nome).valor);
// 135 Jardins: (−2.124.086,58 + 35.294.558,23) ÷ (96.907.390,94 + 42.735.670,61) = 33.170.471,65 ÷ 139.643.061,55
centavos(mf("EDIFICIO 135 JARDINS")!, (33170471.65 / 139643061.55) * 100, "margem final do 135 Jardins");
assert.deepEqual(
  ["EDIFICIO 135 JARDINS", "PALACIO ELIZABETH", "ROZZA", "DOMUS", "SERENITY", "TETRA", "TESLA RESIDENCIAL", "SOLAR DI CAPRI", "SOLAR DI SIENA", "RESIDENCIAL HANNOVER"].map(n => pct(mf(n))),
  ["23,8%", "25,3%", "31,3%", "38,6%", "18,4%", "26,3%", "24,0%", "15,2%", "23,7%", "15,9%"],
);
// Obra que hoje está no vermelho (margem −17,0 % no realizado) fecha positiva: Serenity.
assert.ok(mf("SERENITY")! > 0 && caixa["SERENITY"][0] < caixa["SERENITY"][1]);
// Total: 208.905.083,29 ÷ 793.088.648,31.
const totRecebido = Object.values(caixa).reduce((s, c) => s + c[0], 0);
const totPago = Object.values(caixa).reduce((s, c) => s + c[1], 0);
centavos(totRecebido, 375595583.37, "total recebido");
centavos(totPago, 320855864.42, "total pago");
assert.equal(pct(margemFinal(totRecebido, totPago, totalEntrar, totalSaida), 2), "26,34%");
// Obra finalizada sem nada a entrar: a margem final é a margem do realizado.
centavos(margemFinal(1000, 600, 0, 0)!, 40, "finalizada = margem do realizado");
// Sem receita nenhuma não há margem; só com receita futura, há.
assert.equal(margemFinal(0, 500, 0, 0), null);
assert.equal(margemFinal(0, 0, 0, 800), null);
centavos(margemFinal(0, 500, 2000, 1000)!, 25, "obra que ainda não recebeu nada");
// Pode ficar negativa.
assert.ok(margemFinal(1000, 900, 500, 800)! < 0);

// 8. Todo motivo tem texto de dica.
for (const m of ["finalizada", "sem-orcamento", "estourado"] as const) assert.ok(DICA_SEM_SAIDA[m].length > 20);

console.log("resumo-projecao: ok");
