// npx tsx src/__tests__/dias-uteis.test.ts
// Trava do calendário do Fechamento de Caixa (src/lib/dias-uteis.ts): mesma regra do
// feriados.py da rotina das 07:30.
import assert from "node:assert/strict";
import {
  dataValida,
  diasNoPeriodo,
  ehDiaUtil,
  esteMes,
  fechamentoAnterior,
  fechamentoSeguinte,
  feriado,
  hojeEmBrasilia,
  janelaDoFechamento,
  mesPassado,
  rotuloDaJanela,
  semanaPassada,
  somarDias,
  ultimoDiaUtilAntes,
} from "../lib/dias-uteis";

// 1. Contas de dia não escorregam em virada de mês, de ano nem em ano bissexto.
assert.equal(somarDias("2026-10-31", 1), "2026-11-01");
assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
assert.equal(somarDias("2028-03-01", -1), "2028-02-29");
assert.equal(diasNoPeriodo("2026-11-13", "2026-11-15"), 3);

// 2. Feriados bancários de 2026 (Páscoa em 05/04).
assert.equal(feriado("2026-02-16"), "Carnaval");
assert.equal(feriado("2026-02-17"), "Carnaval");
assert.equal(feriado("2026-04-03"), "Sexta-feira Santa");
assert.equal(feriado("2026-06-04"), "Corpus Christi");
assert.equal(feriado("2026-11-02"), "Finados");
assert.equal(feriado("2026-11-20"), "Consciência Negra");
assert.equal(feriado("2026-11-18"), null);
assert.equal(ehDiaUtil("2026-11-14"), false, "sábado");
assert.equal(ehDiaUtil("2026-11-02"), false, "feriado em dia de semana");
assert.equal(ehDiaUtil("2026-11-17"), true);
assert.equal(ultimoDiaUtilAntes("2026-11-16"), "2026-11-13");

// 3. O fechamento que a aba abre: do último dia útil antes de hoje até ontem.
assert.deepEqual(janelaDoFechamento("2026-11-18"), { de: "2026-11-17", ate: "2026-11-17" }, "dia comum: só ontem");
assert.deepEqual(janelaDoFechamento("2026-11-16"), { de: "2026-11-13", ate: "2026-11-15" }, "segunda: sexta a domingo");
assert.deepEqual(janelaDoFechamento("2026-11-03"), { de: "2026-10-30", ate: "2026-11-02" }, "depois de Finados na segunda: sexta a segunda");
assert.deepEqual(janelaDoFechamento("2026-11-23"), { de: "2026-11-19", ate: "2026-11-22" }, "depois de feriado na sexta: quinta a domingo");
assert.deepEqual(janelaDoFechamento("2027-01-04"), { de: "2026-12-31", ate: "2027-01-03" }, "virada de ano");
assert.deepEqual(janelaDoFechamento("2026-11-15"), { de: "2026-11-13", ate: "2026-11-14" }, "aberto no domingo: sexta e sábado");

// 4. Setas: de fechamento em fechamento, sem passar de hoje.
const hoje = "2026-11-18";
const ontem = janelaDoFechamento(hoje);
assert.deepEqual(fechamentoAnterior(ontem, hoje), { de: "2026-11-16", ate: "2026-11-16" });
assert.deepEqual(fechamentoAnterior({ de: "2026-11-16", ate: "2026-11-16" }, hoje), { de: "2026-11-13", ate: "2026-11-15" });
assert.deepEqual(fechamentoSeguinte({ de: "2026-11-13", ate: "2026-11-15" }, hoje), { de: "2026-11-16", ate: "2026-11-16" });
assert.deepEqual(fechamentoSeguinte(ontem, hoje), { de: "2026-11-18", ate: "2026-11-18" }, "o seguinte a ontem é hoje (parcial)");
assert.equal(fechamentoSeguinte({ de: hoje, ate: hoje }, hoje), null);
// Sexta aberta no próprio dia: não avança para o fim de semana que ainda não chegou.
assert.deepEqual(fechamentoSeguinte({ de: "2026-11-12", ate: "2026-11-12" }, "2026-11-13"), { de: "2026-11-13", ate: "2026-11-13" });
// De um dia solto no meio do fim de semana, as setas voltam para os fechamentos.
assert.deepEqual(fechamentoAnterior({ de: "2026-11-15", ate: "2026-11-15" }, hoje), { de: "2026-11-13", ate: "2026-11-15" });
assert.deepEqual(fechamentoSeguinte({ de: "2026-11-14", ate: "2026-11-14" }, hoje), { de: "2026-11-16", ate: "2026-11-16" });

// 5. Atalhos de período.
assert.deepEqual(semanaPassada("2026-11-18"), { de: "2026-11-09", ate: "2026-11-15" });
assert.deepEqual(semanaPassada("2026-11-16"), { de: "2026-11-09", ate: "2026-11-15" }, "na segunda");
assert.deepEqual(semanaPassada("2026-11-15"), { de: "2026-11-02", ate: "2026-11-08" }, "no domingo a semana corrente ainda é a de 09/11");
assert.deepEqual(esteMes("2026-11-18"), { de: "2026-11-01", ate: "2026-11-18" });
assert.deepEqual(mesPassado("2026-11-18"), { de: "2026-10-01", ate: "2026-10-31" });
assert.deepEqual(mesPassado("2027-01-10"), { de: "2026-12-01", ate: "2026-12-31" });

// 6. Rótulos.
assert.equal(rotuloDaJanela({ de: "2026-11-17", ate: "2026-11-17" }), "Terça-feira, 17/11/2026");
assert.equal(rotuloDaJanela({ de: "2026-11-13", ate: "2026-11-15" }), "sex 13/11 a dom 15/11/2026");
assert.equal(rotuloDaJanela({ de: "2026-12-31", ate: "2027-01-03" }), "qui 31/12/2026 a dom 03/01/2027");

// 7. Hoje em Brasília e validação de data.
assert.equal(hojeEmBrasilia(new Date("2026-11-18T02:00:00Z")), "2026-11-17", "23h de 17/11 em Brasília");
assert.equal(hojeEmBrasilia(new Date("2026-11-18T03:00:00Z")), "2026-11-18");
assert.equal(dataValida("2026-11-17"), true);
assert.equal(dataValida("2026-02-31"), false);
assert.equal(dataValida("17/11/2026"), false);
assert.equal(dataValida(null), false);

console.log("dias-uteis: ok");
