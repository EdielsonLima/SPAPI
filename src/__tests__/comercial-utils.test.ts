/**
 * Comercial — valor da unidade no contrato (criado em 2026-10-22)
 *
 * Trava a regra que reparte o valor do contrato entre as unidades dele.
 * Antes cada unidade recebia o contrato inteiro e o "VGV vendido" do Quadro
 * Espelho somava o mesmo contrato N vezes (apto + vaga contava duas vezes).
 *
 * Também trava o ranking de corretores e imobiliárias (comissões do Sienge).
 *
 * Run: npx tsx src/__tests__/comercial-utils.test.ts
 */

import { valorDaUnidadeNoContrato, rankingParceiros, tipoParceiro, unidadesVendidas, resumoPorTipo, inferUnitTypeFromName } from "../lib/comercial-utils";

let passed = 0;
let failed = 0;

function assertEqual(actual: number, expected: number, name: string) {
  if (Math.abs(actual - expected) < 0.005) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: esperado ${expected}, veio ${actual}`);
  }
}

console.log("valorDaUnidadeNoContrato");

const aptoEVaga = [
  { name: "AP1201", participationPercentage: 85 },
  { name: "VG12", participationPercentage: 15 },
];
assertEqual(valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "AP1201"), 850_000, "apto leva a parte dele");
assertEqual(valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "VG12"), 150_000, "vaga leva a parte dela");
assertEqual(
  valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "AP1201") + valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "VG12"),
  1_000_000,
  "as partes somam o contrato (não duplica)",
);
assertEqual(valorDaUnidadeNoContrato(500_000, [{ name: "AP301", participationPercentage: 0 }], "AP301"), 500_000, "unidade única leva o contrato inteiro");
const semParticipacao = [
  { name: "AP1", participationPercentage: 0 },
  { name: "AP2", participationPercentage: 0 },
  { name: "VG1", participationPercentage: 0 },
];
assertEqual(valorDaUnidadeNoContrato(900_000, semParticipacao, "AP2"), 300_000, "participação que não fecha 100% divide igual");
assertEqual(valorDaUnidadeNoContrato(900_000, aptoEVaga, "AP999"), 0, "unidade fora do contrato = 0");
assertEqual(valorDaUnidadeNoContrato(0, aptoEVaga, "AP1201"), 0, "contrato sem valor = 0");

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
  }
}

console.log("rankingParceiros");
check("imobiliária pelo nome", tipoParceiro("FERNANDO FERNANDEZ SOLUCOES IMOBILIARIAS LTDA"), "imobiliaria");
check("corretor pessoa física", tipoParceiro("FABRICIO BILIBIO"), "corretor");
{
  const ct = (id: number, number: string, value: number, cliente: string, data: string) =>
    ({ id, number, enterpriseId: 5001, value, contractDate: data, salesContractCustomers: [{ name: cliente }], salesContractUnits: [{ name: number.replace(/\s/g, ""), main: true }] });
  const contratos = [ct(1, "AP701", 288463, "CARIN", "2026-06-11"), ct(2, "AP702", 223706, "GUILHERME", "2026-06-26"),
    ct(3, "AP802", 227061.8, "GUILHERME", "2026-07-07"), ct(4, "AP 1506", 419767.61, "MARIA", "2026-09-25"), ct(5, "AP1601", 352572.46, "RODRIGO", "2026-08-10")];
  const k = (id: number, broker: number, nome: string, num: string, valor: number, st = "PAID") =>
    ({ commissionID: id, enterpriseID: 5001, brokerID: broker, brokerName: nome, salesContractNumber: num, value: valor, installmentStatus: st });
  const comissoes = [k(1, 10, "FERNANDO FERNANDEZ SOLUCOES IMOBILIARIAS LTDA", "AP701", 14423.15), k(2, 10, "FERNANDO FERNANDEZ SOLUCOES IMOBILIARIAS LTDA", "AP702", 11185.3),
    k(3, 10, "FERNANDO FERNANDEZ SOLUCOES IMOBILIARIAS LTDA", "AP802", 11353.09), k(4, 20, "FABRICIO BILIBIO", "AP1601", 17628.62),
    k(5, 30, "FORA DO RECORTE LTDA", "AP9999", 1000)];
  const r = rankingParceiros(comissoes, contratos);
  check("ranking: 2 parceiros no recorte", r.parceiros.map(p => p.nome), ["FERNANDO FERNANDEZ SOLUCOES IMOBILIARIAS LTDA", "FABRICIO BILIBIO"]);
  check("1º: 3 contratos, 2 clientes", [r.parceiros[0].contratos, r.parceiros[0].clientes], [3, 2]);
  check("1º: valor e comissão", [Math.round(r.parceiros[0].valor * 100) / 100, r.parceiros[0].comissao], [739230.8, 36961.54]);
  check("vendido com parceiros", [r.contratosComParceiros, Math.round(r.valorComParceiros * 100) / 100], [4, 1091803.26]);
  check("venda direta = o resto", [r.contratosDiretos, r.valorDireto], [1, 419767.61]);
  check("comissões pagas", [r.comissoes, r.comissoesPagas], [54590.16, true]);
  check("por mês", r.porMes.map(m => [m.mes, m.qtd]), [["2026-06", 2], ["2026-07", 1], ["2026-08", 1]]);
  const r2 = rankingParceiros([k(9, 40, "X LTDA", "AP1506", 100, "OPEN")], contratos);
  check("número com espaço casa", r2.parceiros[0]?.contratos, 1);
  check("comissão em aberto", r2.comissoesPagas, false);
}

console.log("corretor da casa");
check("Gilberto é da casa", tipoParceiro("GILBERTO BOING"), "casa");
check("grafia com espaço/minúscula", tipoParceiro(" Gilberto  Boing "), "casa");
{
  const ct = (id: number, number: string, value: number) =>
    ({ id, number, enterpriseId: 1, value, contractDate: "2025-01-10", salesContractCustomers: [{ name: "C" + id }], salesContractUnits: [{ name: number, main: true }] });
  const contratos = [ct(1, "101", 1000), ct(2, "102", 2000), ct(3, "103", 4000), ct(4, "104", 8000)];
  const k = (id: number, broker: number, nome: string, num: string) =>
    ({ commissionID: id, enterpriseID: 1, brokerID: broker, brokerName: nome, salesContractNumber: num, value: 10, installmentStatus: "PAID" });
  const r = rankingParceiros([k(1, 7, "GILBERTO BOING", "101"), k(2, 7, "GILBERTO BOING", "102"), k(3, 8, "TERRAL - IMOVEIS LTDA", "102"), k(4, 8, "TERRAL - IMOVEIS LTDA", "103")], contratos);
  check("casa: só contratos sem parceiro de fora", [r.contratosCasa, r.valorCasa], [1, 1000]);
  check("parceiros: contrato com imobiliária conta fora", [r.contratosComParceiros, r.valorComParceiros], [2, 6000]);
  check("direta = o resto", [r.contratosDiretos, r.valorDireto], [1, 8000]);
  check("Gilberto segue no ranking", r.parceiros.map(p => p.tipo).sort(), ["casa", "imobiliaria"]);
}

console.log("unidadesVendidas");
{
  const c = { id: 9, number: "C9", value: 1_000_000, contractDate: "2025-03-01", enterpriseName: "PALACIO", situation: "Emitido", cancellationDate: null,
    salesContractCustomers: [{ name: "ANA" }], paymentConditions: [{ conditionTypeId: "PM" }],
    salesContractUnits: [{ name: "1201", participationPercentage: 85 }, { name: "G 12", participationPercentage: 15 }] };
  const tipo = (_c: unknown, n: string) => inferUnitTypeFromName(n);
  const us = unidadesVendidas([c], tipo);
  check("uma linha por unidade", us.map(u => [u.unidade, u.valor]), [["1201", 850000], ["G 12", 150000]]);
  const soApto = unidadesVendidas([c], tipo, new Set([inferUnitTypeFromName("1201")]));
  check("filtro de tipo conta só a unidade do tipo", soApto.map(u => u.unidade), ["1201"]);
  check("resumo por tipo", resumoPorTipo([{ tipo: "Apartamento" }, { tipo: "Apartamento" }, { tipo: "Vaga" }]), "2 apartamentos · 1 vaga");
}

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
