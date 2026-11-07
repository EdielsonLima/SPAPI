// Trava da regra do Total a Receber (igual ao Power BI). Rodar:
//   npx tsx src/__tests__/a-receber-regra.test.ts
import assert from "node:assert/strict";
import {
  entraNoAReceber, entraNasVencidas, entraNaCarteiraAberta,
  ehReceitaDeLocacao, ehDocumentoDeLocacao, ehCondicaoPermuta, ignoraFiltroTipoDoc,
} from "../lib/a-receber-regra";

const hoje = "2026-11-07";
const cat = (id: string | number) => [{ financialCategoryId: id }];

// Os quatro casos reais da Silva Packer Construtora em 07/11/2026.
const francisca = { correctedBalanceAmount: 4900.87, dueDate: "2026-11-10", documentIdentificationName: "CONTRATO", paymentsCategories: cat("1010106") };
const bigliardi = { correctedBalanceAmount: 1000, dueDate: "2026-11-22", documentIdentificationName: "CONTRATO", paymentsCategories: cat("10514") };
const lncNaoAluguel = { correctedBalanceAmount: 108.08, dueDate: "2026-11-15", documentIdentificationName: "CONTRATO DE LOCACAO NAO CONTABIL", paymentsCategories: cat("2090111") };
const locacao = { correctedBalanceAmount: 16683.5, dueDate: "2026-11-10", documentIdentificationName: "CONTRATO DE LOCAÇÃO", paymentsCategories: cat(10513) };

assert.equal(entraNoAReceber(francisca, hoje), true);
assert.equal(entraNoAReceber(bigliardi, hoje), false, "documento CONTRATO com categoria de aluguel sai");
assert.equal(entraNoAReceber(lncNaoAluguel, hoje), true, "documento de locação sem categoria de aluguel entra");
assert.equal(entraNoAReceber(locacao, hoje), false, "aluguel sai (categoria numérica também)");

// Soma dos quatro = o que o Power BI mostra para a empresa (R$ 9.909,82 com as 2 parcelas de cada).
const soma = [francisca, francisca, bigliardi, bigliardi, lncNaoAluguel, locacao]
  .filter((i) => entraNoAReceber(i, hoje))
  .reduce((s, i) => s + i.correctedBalanceAmount, 0);
assert.equal(soma.toFixed(2), "9909.82");

// Vencida, sem saldo, sem vencimento e permuta não entram.
assert.equal(entraNoAReceber({ ...francisca, dueDate: "2026-11-06" }, hoje), false);
assert.equal(entraNoAReceber({ ...francisca, dueDate: hoje }, hoje), true, "vence hoje entra");
assert.equal(entraNoAReceber({ ...francisca, correctedBalanceAmount: 0 }, hoje), false);
assert.equal(entraNoAReceber({ ...francisca, dueDate: null }, hoje), false);
assert.equal(entraNoAReceber({ ...francisca, paymentTerm: { id: "PE", descrition: "Permuta" } }, hoje), false);
assert.equal(ehCondicaoPermuta({ paymentTerm: { id: "PM", descrition: "Parcelas Mensais" } }), false);
assert.equal(entraNoAReceber({ ...francisca, paymentsCategories: undefined }, hoje), true, "sem categoria entra");

assert.equal(ehReceitaDeLocacao({ paymentsCategories: [...cat("1010106"), ...cat("10513")] }), true);
assert.equal(ehDocumentoDeLocacao("Contrato de Locação"), true);
assert.equal(ehDocumentoDeLocacao("CONTRATO"), false);
assert.equal(ignoraFiltroTipoDoc(lncNaoAluguel), true);
assert.equal(ignoraFiltroTipoDoc(locacao), true, "aluguel vencido também passa pelo filtro Tipo Doc");
assert.equal(ignoraFiltroTipoDoc(francisca), false);

// Vencidas (Total Vencidas do Power BI): aluguel conta, permuta não, sem multa/juros.
const vencida = { ...francisca, dueDate: "2026-10-10" };
const aluguelVencido = { ...locacao, dueDate: "2026-10-10" };
assert.equal(entraNasVencidas(vencida, hoje), true);
assert.equal(entraNasVencidas(aluguelVencido, hoje), true, "aluguel vencido entra (como no BI)");
assert.equal(entraNasVencidas({ ...vencida, paymentTerm: { id: "PE", descrition: "Permuta" } }, hoje), false);
assert.equal(entraNasVencidas(francisca, hoje), false, "a vencer não entra");
assert.equal(entraNasVencidas({ ...vencida, dueDate: hoje }, hoje), false, "vence hoje ainda não é vencida");
assert.equal(entraNasVencidas({ ...vencida, correctedBalanceAmount: 0 }, hoje), false);

// % Atrasada = vencidas ÷ carteira em aberto (com aluguel a vencer, sem permuta).
const carteira = [vencida, aluguelVencido, francisca, locacao, bigliardi,
  { ...francisca, paymentTerm: { id: "PE", descrition: "Permuta" } }];
const venc = carteira.filter((i) => entraNasVencidas(i, hoje)).reduce((s, i) => s + i.correctedBalanceAmount, 0);
const base = carteira.filter((i) => entraNaCarteiraAberta(i)).reduce((s, i) => s + i.correctedBalanceAmount, 0);
assert.equal(venc.toFixed(2), (4900.87 + 16683.5).toFixed(2));
assert.equal(base.toFixed(2), (4900.87 * 2 + 16683.5 * 2 + 1000).toFixed(2));

console.log("a-receber-regra: ok");
