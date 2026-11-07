// Trava da regra do A Pagar (igual ao Power BI). Rodar:
//   npx tsx src/__tests__/a-pagar-regra.test.ts
import assert from "node:assert/strict";
import { entraNoAPagar, ehPrevisaoDeComissao, ignoraFiltroTipoDocCP } from "../lib/a-pagar-regra";

const hoje = "2026-11-07";

// Casos reais de 07/11/2026.
const nfe = { correctedBalanceAmount: 25524.11, dueDate: "2026-11-29", documentIdentificationId: "NFE " }; // Chave Digital, não consistido
const comissaoVencida = { correctedBalanceAmount: 82500, dueDate: "2026-03-27", documentIdentificationId: "PRC" }; // Domus, Reserva Imob
const pedidoPrevisto = { correctedBalanceAmount: 50000, dueDate: "2026-12-14", documentIdentificationId: "PPC" };
const medicaoPrevista = { correctedBalanceAmount: 940505.92, dueDate: "2027-11-22", documentIdentificationId: "PCT" };

assert.equal(entraNoAPagar(nfe, hoje), true, "a vencer entra (a consistência não importa)");
assert.equal(entraNoAPagar(comissaoVencida, hoje), true, "previsão de comissão entra mesmo vencida (como no BI)");
assert.equal(entraNoAPagar({ ...comissaoVencida, dueDate: "2027-01-10" }, hoje), true);
assert.equal(entraNoAPagar(pedidoPrevisto, hoje), false, "previsão de pedido de compra sai");
assert.equal(entraNoAPagar(medicaoPrevista, hoje), false, "previsão de medição de contrato sai");
assert.equal(entraNoAPagar({ ...nfe, documentIdentificationId: "PRV" }, hoje), false);
assert.equal(entraNoAPagar({ ...nfe, documentIdentificationId: "PPE" }, hoje), false);

// Vencida, sem saldo e sem vencimento.
assert.equal(entraNoAPagar({ ...nfe, dueDate: "2026-11-06" }, hoje), false, "vencida vai para Atrasadas");
assert.equal(entraNoAPagar({ ...nfe, dueDate: hoje }, hoje), true, "vence hoje entra");
assert.equal(entraNoAPagar({ ...nfe, correctedBalanceAmount: 0 }, hoje), false);
assert.equal(entraNoAPagar({ ...comissaoVencida, correctedBalanceAmount: 0 }, hoje), false, "comissão já paga sai");
assert.equal(entraNoAPagar({ ...nfe, dueDate: null }, hoje), false);

// Soma do Domus em 2026 do que o painel não contava: 2 NF-e não consistidas + 2 comissões.
const domus = [
  { correctedBalanceAmount: 354.42, dueDate: "2026-11-23", documentIdentificationId: "NFE" },
  { correctedBalanceAmount: 354.42, dueDate: "2026-12-21", documentIdentificationId: "NFE" },
  comissaoVencida,
  { correctedBalanceAmount: 7500, dueDate: "2026-03-27", documentIdentificationId: "PRC" },
];
const soma = domus.filter((i) => entraNoAPagar(i, hoje)).reduce((s, i) => s + i.correctedBalanceAmount, 0);
assert.equal(soma.toFixed(2), "90708.84");

assert.equal(ehPrevisaoDeComissao({ documentIdentificationId: " prc " }), true);
assert.equal(ignoraFiltroTipoDocCP(comissaoVencida), true);
assert.equal(ignoraFiltroTipoDocCP(nfe), false);

console.log("a-pagar-regra: ok");
