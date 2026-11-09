// Trava da regra do A Pagar (igual ao Power BI). Rodar:
//   npx tsx src/__tests__/a-pagar-regra.test.ts
import assert from "node:assert/strict";
import {
  entraNoAPagar, entraNasAtrasadas, basePagas,
  entraNoGeralAPagar, geralAPagar, estimativaSaidas, consistido,
  ehTarifaCobrancaDeTituloAReceber, movimentosParaPagas,
} from "../lib/a-pagar-regra";

const hoje = "2026-11-07";

// Casos reais de 07/11/2026.
const nfe = { correctedBalanceAmount: 25524.11, dueDate: "2026-11-29", documentIdentificationId: "NFE ", consistencyStatus: "S" };
const comissaoVencida = { correctedBalanceAmount: 82500, dueDate: "2026-03-27", documentIdentificationId: "PRC" }; // Domus, Reserva Imob
const pedidoPrevisto = { correctedBalanceAmount: 50000, dueDate: "2026-12-14", documentIdentificationId: "PPC" };
const medicaoPrevista = { correctedBalanceAmount: 940505.92, dueDate: "2027-11-22", documentIdentificationId: "PCT" };

assert.equal(entraNoAPagar(nfe, hoje), true, "a vencer entra");
assert.equal(entraNoAPagar(comissaoVencida, hoje), false, "previsão de comissão vencida sai (como o Sienge, 09/11)");
assert.equal(entraNoAPagar({ ...comissaoVencida, dueDate: "2027-01-10" }, hoje), false, "previsão de comissão a vencer também sai");
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

// Edielson, 09/11/2026: "Tirar, como o Sienge". No Domus: as 2 NF-e não
// consistidas e as 2 previsões de comissão (consistidas) saem.
const domus = [
  { correctedBalanceAmount: 354.42, dueDate: "2026-11-23", documentIdentificationId: "NFE", consistencyStatus: "N" },
  { correctedBalanceAmount: 354.42, dueDate: "2026-12-21", documentIdentificationId: "NFE", consistencyStatus: "N" },
  { ...comissaoVencida, consistencyStatus: "S" },
  { correctedBalanceAmount: 7500, dueDate: "2026-03-27", documentIdentificationId: "PRC", consistencyStatus: "S" },
];
const soma = domus.filter((i) => entraNoAPagar(i, hoje)).reduce((s, i) => s + i.correctedBalanceAmount, 0);
assert.equal(soma.toFixed(2), "0.00");
// Domus de 09/11 a 31/12/2050: painel antes R$ 1.393.077,51; Sienge R$ 1.302.368,67.
assert.equal((1393077.51 - 354.42 * 2 - 82500 - 7500).toFixed(2), "1302368.67");
// 135 Jardins: título 41760 (CHAVE DIGITAL), não consistido — a diferença
// inteira entre o painel (R$ 1.739.050,27) e o relatório do Sienge
// (R$ 1.662.470,27) em 09/11.
const chaveDigital = [25524.11, 25524.11, 25531.78].map((v, k) => ({
  correctedBalanceAmount: v, dueDate: ["2026-11-29", "2026-12-29", "2027-01-28"][k], documentIdentificationId: "NFE", consistencyStatus: "N",
}));
assert.equal(chaveDigital.filter((i) => entraNoAPagar(i, "2026-11-09")).length, 0, "não consistido sai do A Pagar");
assert.equal((1739050.27 - chaveDigital.reduce((s, i) => s + i.correctedBalanceAmount, 0)).toFixed(2), "1662470.27");
assert.equal(consistido({ consistencyStatus: " n " }), false);
assert.equal(consistido({ consistencyStatus: "S" }), true);
assert.equal(consistido({}), true, "sem a informação, conta (como antes do campo existir)");

assert.equal(entraNoAPagar({ ...nfe, documentIdentificationId: " prc " }, hoje), false, "PRC com espaço/minúscula também sai");

// Contas Atrasadas (card "Contas Atrasadas CARD" do BI), casos reais de 08/11/2026.
const hoje2 = "2026-11-08";
const conteiners = { correctedBalanceAmount: 5635.4, dueDate: "2025-12-10", documentIdentificationId: "NFE" }; // Domus
assert.equal(entraNasAtrasadas(conteiners, hoje2), true, "vencida entra");
assert.equal(entraNasAtrasadas(comissaoVencida, hoje2), false, "previsão de comissão sai das Atrasadas");
for (const doc of ["PPC", "PPE", "PCT", "PRV", " prv "]) {
  assert.equal(entraNasAtrasadas({ ...conteiners, documentIdentificationId: doc }, hoje2), false, `previsão ${doc} sai`);
}
assert.equal(entraNasAtrasadas({ ...conteiners, dueDate: "2026-11-07" }, hoje2), true, "venceu ontem entra");
assert.equal(entraNasAtrasadas({ ...conteiners, dueDate: hoje2 }, hoje2), false, "vence hoje é A Pagar");
assert.equal(entraNasAtrasadas({ ...conteiners, correctedBalanceAmount: 0 }, hoje2), false, "paga sai");
assert.equal(entraNasAtrasadas({ ...conteiners, dueDate: null }, hoje2), false);
// A parcela nunca está nos dois quadros ao mesmo tempo.
for (const i of [conteiners, nfe, pedidoPrevisto, { ...nfe, dueDate: "2026-11-01" }]) {
  assert.equal(entraNoAPagar(i, hoje2) && entraNasAtrasadas(i, hoje2), false);
}
// Os 3 não consistidos vencidos (R$ 8.131,40) ficam fora das Atrasadas, como no Sienge (09/11).
const naoConsistidos = [
  { ...conteiners, consistencyStatus: "N" }, // Domus, Conteiners Catarinense
  { correctedBalanceAmount: 1331.61, dueDate: "2025-03-10", documentIdentificationId: "FAT", consistencyStatus: "N" }, // Sul Brasil, M.R. Mafra
  { correctedBalanceAmount: 1164.39, dueDate: "2026-04-17", documentIdentificationId: "NFS", consistencyStatus: "N" }, // SP Construtora, Max Mohr
];
assert.equal(naoConsistidos.filter((i) => entraNasAtrasadas(i, hoje2)).length, 0, "não consistido sai das Atrasadas");

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

// Geral a Pagar (BI "Geral a Pagar Ajustado"): toda parcela em aberto sem as
// 4 previsões está em exatamente um dos dois quadros — por isso o card soma
// Total a Pagar + Contas em Atraso.
const casosGeral = [
  nfe, comissaoVencida, pedidoPrevisto, medicaoPrevista, conteiners,
  { ...conteiners, correctedBalanceAmount: 0 },
  { ...nfe, dueDate: hoje2 },
  { ...nfe, dueDate: "2026-11-07" },
  { ...comissaoVencida, dueDate: "2027-01-10" },
  { ...nfe, documentIdentificationId: "PRV" },
  { ...conteiners, documentIdentificationId: "PRC" },
  { correctedBalanceAmount: 262774.77, dueDate: "2023-11-17", documentIdentificationId: "MED" }, // TETRA 15597/14: fica (o BI tira)
  ...naoConsistidos, ...chaveDigital,
];
for (const i of casosGeral) {
  const quadros = Number(entraNoAPagar(i, hoje2)) + Number(entraNasAtrasadas(i, hoje2));
  assert.equal(quadros, entraNoGeralAPagar(i) ? 1 : 0, `Geral = A Pagar + Atrasadas (${i.documentIdentificationId} ${i.dueDate})`);
}
assert.equal(entraNoGeralAPagar(pedidoPrevisto), false, "previsão de pedido fica fora do Geral");
assert.equal(entraNoGeralAPagar(comissaoVencida), false, "previsão de comissão fica fora do Geral (09/11)");
// Na tela em 09/11/2026, dados de 08/11 (modo Silva Packer, todas as empresas, vencimento e
// baixa em 2026): Total Pago + Geral a Pagar.
assert.equal(geralAPagar(0, 0), 0);
assert.equal(geralAPagar(4129766.92, 2505304.90).toFixed(2), "6635071.82");
assert.equal(estimativaSaidas(64957152.12, 6635071.82).toFixed(2), "71592223.94");

// Tarifa de cobrança de título a receber (09/11/2026): movimentos reais.
// 135 Jardins, 25/05/2023, título a receber 312 ("BOLETO TESTE"), R$ 2,08.
const tarifaCR = { bankMovementId: 17251, bankMovementOriginId: "CR", bankMovementOperationType: "S", bankMovementHistoricName: "Pag. tarifa bancária cobrança", bankMovementAmount: 2.08 };
// Tarifa avulsa (origem BC) do mesmo 135 Jardins, 01/08/2023 — já vinha nos avulsos.
const tarifaBC = { bankMovementId: 900001, bankMovementOriginId: "BC", bankMovementOperationType: "S", bankMovementHistoricName: "Pag. tarifa bancária cobrança", bankMovementAmount: 2.08 };
// Origem CR que NÃO entra no relatório: o recebimento e o desconto concedido.
const recebimentoCR = { bankMovementId: 900002, bankMovementOriginId: "CR", bankMovementOperationType: "S", bankMovementHistoricName: "Recebimento", bankMovementAmount: 1500 };
const descontoCR = { bankMovementId: 900003, bankMovementOriginId: "CR", bankMovementOperationType: "S", bankMovementHistoricName: "Desconto concedido", bankMovementAmount: 0.58 };
const pagamentoCP = { bankMovementId: 900004, bankMovementOriginId: "CP", bankMovementOperationType: "S", bankMovementHistoricName: "Pagamento", bankMovementAmount: 100 };
assert.equal(ehTarifaCobrancaDeTituloAReceber(tarifaCR), true, "tarifa do boleto de título a receber entra");
assert.equal(ehTarifaCobrancaDeTituloAReceber({ ...tarifaCR, bankMovementHistoricName: "PAG. TARIFA BANCARIA COBRANCA" }), true, "sem acento e em maiúscula");
assert.equal(ehTarifaCobrancaDeTituloAReceber(tarifaBC), false, "avulsa já entra por outro caminho");
assert.equal(ehTarifaCobrancaDeTituloAReceber(recebimentoCR), false);
assert.equal(ehTarifaCobrancaDeTituloAReceber(descontoCR), false);
assert.equal(ehTarifaCobrancaDeTituloAReceber({ ...tarifaCR, bankMovementOperationType: "E" }), false, "entrada não");
assert.equal(ehTarifaCobrancaDeTituloAReceber({ ...tarifaCR, bankMovementAmount: 0 }), false, "zerada não");
const todos = [tarifaBC, tarifaCR, recebimentoCR, descontoCR, pagamentoCP];
assert.deepEqual(movimentosParaPagas([tarifaBC], todos), [tarifaBC, tarifaCR], "avulsos + tarifa CR, sem o resto");
assert.deepEqual(movimentosParaPagas([tarifaBC, tarifaCR], todos), [tarifaBC, tarifaCR], "não repete o que já está nos avulsos");
assert.deepEqual(movimentosParaPagas([tarifaBC], []), [tarifaBC], "antes de chegar a lista completa");
// Maio/2023 do 135 Jardins: painel R$ 1.082.610,13 + R$ 2,08 = Sienge R$ 1.082.612,21.
assert.equal((1082610.13 + tarifaCR.bankMovementAmount).toFixed(2), "1082612.21");

console.log("a-pagar-regra: ok");
