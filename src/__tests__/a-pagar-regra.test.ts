// Trava da regra do A Pagar (igual ao Power BI). Rodar:
//   npx tsx src/__tests__/a-pagar-regra.test.ts
import assert from "node:assert/strict";
import { entraNoAPagar, entraNasAtrasadas, ehPrevisaoDeComissao, ignoraFiltroTipoDocCP, basePagas } from "../lib/a-pagar-regra";

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

// Contas Atrasadas (card "Contas Atrasadas CARD" do BI), casos reais de 08/11/2026.
const hoje2 = "2026-11-08";
const conteiners = { correctedBalanceAmount: 5635.4, dueDate: "2025-12-10", documentIdentificationId: "NFE" }; // Domus, não consistido
assert.equal(entraNasAtrasadas(conteiners, hoje2), true, "vencida entra (a consistência não importa)");
assert.equal(entraNasAtrasadas(comissaoVencida, hoje2), false, "previsão de comissão sai das Atrasadas (fica no A Pagar)");
for (const doc of ["PPC", "PPE", "PCT", "PRV", " prv "]) {
  assert.equal(entraNasAtrasadas({ ...conteiners, documentIdentificationId: doc }, hoje2), false, `previsão ${doc} sai`);
}
assert.equal(entraNasAtrasadas({ ...conteiners, dueDate: "2026-11-07" }, hoje2), true, "venceu ontem entra");
assert.equal(entraNasAtrasadas({ ...conteiners, dueDate: hoje2 }, hoje2), false, "vence hoje é A Pagar");
assert.equal(entraNasAtrasadas({ ...conteiners, correctedBalanceAmount: 0 }, hoje2), false, "paga sai");
assert.equal(entraNasAtrasadas({ ...conteiners, dueDate: null }, hoje2), false);
// A parcela nunca está nos dois quadros ao mesmo tempo, exceto a PRC vencida (só no A Pagar).
for (const i of [conteiners, nfe, pedidoPrevisto, { ...nfe, dueDate: "2026-11-01" }]) {
  assert.equal(entraNoAPagar(i, hoje2) && entraNasAtrasadas(i, hoje2), false);
}
// Os 3 não consistidos que o painel deixava fora: R$ 8.131,40.
const naoConsistidos = [
  conteiners,
  { correctedBalanceAmount: 1331.61, dueDate: "2025-03-10", documentIdentificationId: "FAT" }, // Sul Brasil, M.R. Mafra
  { correctedBalanceAmount: 1164.39, dueDate: "2026-04-17", documentIdentificationId: "NFS" }, // SP Construtora, Max Mohr (já sem imposto)
];
assert.equal(naoConsistidos.filter((i) => entraNasAtrasadas(i, hoje2)).reduce((s, i) => s + i.correctedBalanceAmount, 0).toFixed(2), "8131.40");

// Contas Pagas (Total pago do BI): movimento bancário avulso só da empresa do modo.
const HOLDING = "SILVA ADMINISTRADORA HOLDING LTDA";
const doModoSP = (empresa: string) => empresa !== HOLDING;
const titulo = { companyName: "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA", billId: 41035 };
const tarifaSP = { companyName: "PALACIO ELIZABETH", billId: 1 };
const tarifaHolding = { companyName: HOLDING, billId: 2 };
const tituloHolding = { companyName: HOLDING, billId: 3 }; // a lista de títulos já vem filtrada pelo modo; não é papel da base
assert.deepEqual(basePagas([titulo], [tarifaSP, tarifaHolding], doModoSP), [titulo, tarifaSP], "movimento da Holding fica fora do modo Silva Packer");
assert.deepEqual(basePagas([titulo, tituloHolding], [], doModoSP), [titulo, tituloHolding], "não mexe nos títulos");
assert.deepEqual(basePagas([], [tarifaHolding, tarifaSP], (e) => e === HOLDING), [tarifaHolding], "no modo Holding, só os dela");
assert.deepEqual(basePagas([], [], doModoSP), []);

console.log("a-pagar-regra: ok");
