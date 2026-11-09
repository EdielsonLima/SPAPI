// Trava do CUB manual: só vale para um mês que o site ainda não publicou, e as
// variações saem da série (Edielson, 09/11/2026).
// Rodar: npx tsx src/__tests__/cub-manual.test.ts
import assert from "node:assert/strict";
import { lerRotuloMes, rotuloMes, manualMaisNovo, linhaManual } from "../lib/indicadores/cub-manual";

// Rótulos
assert.deepEqual(lerRotuloMes("Nov/2026"), { ano: 2026, mes: 11 });
assert.deepEqual(lerRotuloMes("nov/26"), { ano: 2026, mes: 11 });
assert.deepEqual(lerRotuloMes("Novembro/2026"), { ano: 2026, mes: 11 });
assert.deepEqual(lerRotuloMes("Março/2027"), { ano: 2027, mes: 3 });
assert.equal(lerRotuloMes("2026-11"), null);
assert.equal(lerRotuloMes(""), null);
assert.equal(rotuloMes(2026, 12), "Dez/2026");

// Série automática (valores reais do CUB-SC R8-N)
const serie = [
  { ano: 2025, mes: 11, valor_m2: 3003.08 },
  { ano: 2025, mes: 12, valor_m2: 3008.85 },
  { ano: 2026, mes: 10, valor_m2: 3171.96 },
  { ano: 2026, mes: 11, valor_m2: 3182.95 },
];
const ultimo = { ano: 2026, mes: 11 };

// 1. Mês que o site ainda não publicou: vale, com as contas pela série.
const dez = linhaManual(serie, { value: 3200, monthLabel: "Dez/2026", monthlyVariation: 0, yearlyAccumulated: 0 });
assert.deepEqual(dez, {
  ano: 2026, mes: 12, valor_m2: 3200,
  variacao_pct: 0.54, // 3200 ÷ 3182,95 − 1
  variacao_acumulada_ano_pct: 6.35, // 3200 ÷ 3008,85 (dez/25) − 1
  variacao_anual_pct: 6.35, // 3200 ÷ 3008,85 (dez/25) − 1
});
assert.equal(manualMaisNovo(dez!, ultimo), true);

// 2. Mês que o site já publicou: o automático vale (o manual fica sem uso).
assert.equal(manualMaisNovo({ ano: 2026, mes: 11 }, ultimo), false);
assert.equal(manualMaisNovo({ ano: 2026, mes: 10 }, ultimo), false);
// Sem série automática nenhuma, o manual vale.
assert.equal(manualMaisNovo({ ano: 2026, mes: 11 }, null), true);

// 3. Caso de 09/11: Nov/26 lançado à mão com acumulado digitado 5,65 — pela
//    série dá 5,79, igual ao Sinduscon; o digitado não manda.
const nov = linhaManual(serie.slice(0, 3), { value: 3182.95, monthLabel: "Nov/2026", monthlyVariation: 0.35, yearlyAccumulated: 5.65 });
assert.equal(nov!.variacao_pct, 0.35);
assert.equal(nov!.variacao_acumulada_ano_pct, 5.79);
assert.equal(nov!.variacao_anual_pct, 5.99);

// 4. Janeiro: mês anterior = dezembro do ano anterior.
const jan = linhaManual([...serie, { ano: 2026, mes: 12, valor_m2: 3200 }], { value: 3216, monthLabel: "Jan/2027" });
assert.equal(jan!.variacao_pct, 0.5);
assert.equal(jan!.variacao_acumulada_ano_pct, 0.5);
assert.equal(jan!.variacao_anual_pct, null); // sem jan/26 na série

// 5. Sem base na série: usa o digitado.
const semBase = linhaManual([], { value: 3000, monthLabel: "Dez/2026", monthlyVariation: 0.4, yearlyAccumulated: 5 });
assert.equal(semBase!.variacao_pct, 0.4);
assert.equal(semBase!.variacao_acumulada_ano_pct, 5);
assert.equal(semBase!.variacao_anual_pct, null);

// 6. Inválidos
assert.equal(linhaManual(serie, null), null);
assert.equal(linhaManual(serie, { value: 0, monthLabel: "Dez/2026" }), null);
assert.equal(linhaManual(serie, { value: 3200, monthLabel: "dezembro" }), null);

console.log("cub-manual: ok");
