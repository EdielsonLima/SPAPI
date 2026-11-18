// npx tsx src/__tests__/fechamento-caixa.test.ts
// Trava das regras do Fechamento de Caixa (src/lib/fechamento-caixa.ts). O caso grande é o
// de 17/11/2026, com os saldos e os movimentos que o Sienge devolveu em 18/11/2026.
import assert from "node:assert/strict";
import { BANK_NAMES, DIMBAN_ACCOUNT_COMPANY } from "../lib/dimBanco";
import {
  agruparLinhas,
  classificar,
  contarLancamentos,
  datasDeSaldo,
  diaADia,
  ehTransferencia,
  fecharCaixa,
  montarConta,
  pagoEmDinheiro,
  saldoNaData,
  totalizar,
  type MovimentoCaixa,
} from "../lib/fechamento-caixa";

const EMPRESAS: Record<number, string> = {
  1: "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA",
  3: "SUL BRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA",
  4: "EDIFICIO 135 JARDINS",
  5: "SOLAR DI CAPRI",
  6: "PALACIO ELIZABETH",
  7: "RESIDENCIAL HANNOVER",
  8: "SOLAR DI SIENA",
  9: "TESLA RESIDENCIAL",
  10: "SERENITY",
  11: "ROZZA",
};
const contas = Object.entries(DIMBAN_ACCOUNT_COMPANY).map(([conta, empresa]) => montarConta(conta, empresa, EMPRESAS[empresa], BANK_NAMES[conta]));
assert.equal(contas.length, 17);

let id = 1000;
const mov = (conta: string, empresa: number, data: string, tipo: "E" | "S", valor: number, origem: string, extra: Partial<MovimentoCaixa> = {}): MovimentoCaixa => ({
  bankMovementId: ++id,
  bankMovementDate: data,
  bankMovementAmount: valor,
  bankMovementOperationType: tipo,
  bankMovementOriginId: origem,
  accountNumber: conta,
  companyId: empresa,
  ...extra,
});
const TRANSF = { bankMovementOperationName: "Transferência entre empresas", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS", bankMovementHistoricName: "Transferência" };
const TARIFA = { bankMovementOperationName: "Pagamento", documentIdentificationName: "AVISO DE LANÇAMENTO", bankMovementHistoricName: "Tarifa Bancária" };
const RECEB = { bankMovementOperationName: "Recebimento", documentIdentificationName: "CONTRATO" };
const PAGTO = { bankMovementOperationName: "Pagamento", documentIdentificationName: "Nota Fiscal de Serviço" };

// ── 1. Classificação ─────────────────────────────────────────────────────────────────────
{
  // Título a receber: entrada; "Desconto concedido" (saída de origem CR) abate a entrada.
  assert.deepEqual(classificar(mov("490-1", 4, "2026-11-17", "E", 500, "CR", RECEB)), { tipo: "entrada", efeito: 500, abate: false });
  assert.deepEqual(classificar(mov("490-1", 4, "2026-11-17", "S", 20, "CR", { bankMovementHistoricName: "Desconto concedido" })), { tipo: "entrada", efeito: -20, abate: true });
  // Título a pagar: saída; "Retenção impostos" e "Desconto obtido" (entrada de origem CP) abatem.
  assert.deepEqual(classificar(mov("275226-3", 1, "2026-11-17", "S", 1000, "CP", PAGTO)), { tipo: "saida", efeito: -1000, abate: false });
  assert.deepEqual(classificar(mov("275226-3", 1, "2026-11-17", "E", 110, "CP", { bankMovementHistoricName: "Retenção impostos" })), { tipo: "saida", efeito: 110, abate: true });
  // Avulso: transferência, saque, depósito e resgate são transferência; tarifa é saída.
  assert.equal(classificar(mov("275226-3", 1, "2026-11-17", "S", 266000, "BC", TRANSF)).tipo, "transferencia");
  assert.equal(classificar(mov("275226-3", 1, "2026-11-17", "S", 50000, "BC", { bankMovementOperationName: "Saque", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS", bankMovementHistoricName: "Saque Bancário" })).tipo, "transferencia");
  assert.equal(classificar(mov("275226-3", 1, "2026-11-17", "E", 38000, "BC", { bankMovementOperationName: "Depósito", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS" })).tipo, "transferencia");
  assert.equal(classificar(mov("A5026-3", 3, "2026-11-17", "S", 9000, "BC", { bankMovementOperationName: "Transferência", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS", bankMovementHistoricName: "Resgate de Aplicação" })).tipo, "transferencia");
  // "Transferência entre empresas" lançada com documento AVISO DE LANÇAMENTO também é transferência.
  assert.equal(classificar(mov("275226-3", 1, "2026-11-17", "S", 5000, "BC", { bankMovementOperationName: "Transferência entre empresas", documentIdentificationName: "AVISO DE LANÇAMENTO" })).tipo, "transferencia");
  assert.deepEqual(classificar(mov("275226-3", 1, "2026-11-17", "S", 15.14, "BC", TARIFA)), { tipo: "saida", efeito: -15.14, abate: false });
  // Título nunca é transferência, mesmo com a palavra no documento.
  assert.equal(ehTransferencia({ bankMovementOriginId: "CP", bankMovementOperationName: "Pagamento", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS" }), false);
}

// ── 2. Saldo numa data a partir das datas que o Sienge devolveu ──────────────────────────
{
  const saldos = { "2026-11-13": { "1:275226-3": 788460.28 }, "2026-11-16": { "1:275226-3": 1067511.92 } };
  const liq = { "2026-11-16": 279051.64, "2026-11-17": 19964.86 };
  // Domingo: o Sienge não devolve nada; vale o saldo de sexta, sem movimento no meio.
  assert.equal(saldoNaData("1:275226-3", "2026-11-15", saldos, liq), 788460.28);
  // Data com saldo devolvido: é ele.
  assert.equal(saldoNaData("1:275226-3", "2026-11-16", saldos, liq), 1067511.92);
  // Depois da última data: soma os movimentos de lá para cá.
  assert.equal(Math.round(saldoNaData("1:275226-3", "2026-11-17", saldos, liq)! * 100), 108747678);
  // Só há saldo depois: volta descontando os movimentos.
  assert.equal(Math.round(saldoNaData("1:275226-3", "2026-11-15", { "2026-11-16": saldos["2026-11-16"] }, liq)! * 100), 78846028);
  assert.equal(saldoNaData("9:276-3", "2026-11-15", saldos, {}), null);
}

// ── 3. O fechamento de 17/11/2026 ────────────────────────────────────────────────────────
const movimentos17: MovimentoCaixa[] = [
  // dia 16 (antes do período): não entra nas colunas
  mov("275226-3", 1, "2026-11-16", "E", 279051.64, "CR", RECEB),
  // Banco do Brasil da Construtora
  mov("275226-3", 1, "2026-11-17", "E", 25000, "CR", { ...RECEB, clientName: "CLIENTE A", billId: 1139 }),
  mov("275226-3", 1, "2026-11-17", "E", 266000, "BC", TRANSF),
  mov("275226-3", 1, "2026-11-17", "S", 266000, "BC", TRANSF),
  mov("275226-3", 1, "2026-11-17", "S", 4500, "BC", TRANSF),
  mov("275226-3", 1, "2026-11-17", "S", 520, "CP", { ...PAGTO, creditorName: "LAVANDERIA", billId: 42092 }),
  mov("275226-3", 1, "2026-11-17", "S", 15.14, "BC", TARIFA),
  // Sul Brasil recebe a transferência
  mov("0241711-1", 3, "2026-11-17", "E", 266000, "BC", TRANSF),
  // 135 Jardins
  mov("490-1", 4, "2026-11-17", "E", 565000, "CR", { ...RECEB, clientName: "CLIENTE B", billId: 16 }),
  mov("490-1", 4, "2026-11-17", "E", 30000, "CR", { ...RECEB, clientName: "CLIENTE C", billId: 1124 }),
  mov("490-1", 4, "2026-11-17", "S", 266000, "BC", TRANSF),
  // Capri, Palácio, Serenity
  mov("274-7", 5, "2026-11-17", "E", 9563.13, "CR", RECEB),
  mov("274-7", 5, "2026-11-17", "S", 2.04, "BC", TARIFA),
  mov("479-0", 6, "2026-11-17", "E", 27163.03, "CR", RECEB),
  mov("479-0", 6, "2026-11-17", "E", 26894.09, "CR", RECEB),
  mov("479-0", 6, "2026-11-17", "E", 26105.7, "CR", RECEB),
  mov("924-5", 10, "2026-11-17", "E", 13308, "CR", RECEB),
  mov("924-5", 10, "2026-11-17", "S", 2.07, "BC", TARIFA),
  // Fora das 17: caixa em dinheiro, mútuo e holding
  mov("CAIXA", 1, "2026-11-17", "S", 10000, "CP", PAGTO),
  mov("CAIXA", 1, "2026-11-17", "S", 5170, "CP", PAGTO),
  mov("CAIXA", 2, "2026-11-17", "S", 7144.36, "CP", PAGTO),
  mov("MUTUO-1", 1, "2026-11-17", "E", 266000, "BC", TRANSF),
  mov("9937-6", 2, "2026-11-17", "E", 4500, "BC", TRANSF),
];
// Saldos devolvidos pelo Sienge: em 16/11 todas as empresas tiveram movimento; em 17/11 as
// empresas 7, 8, 9 e 11 não tiveram e não vieram. As tarifas de 17/11 foram lançadas em
// 18/11 e ainda não estavam no saldo de 17/11.
const saldos17 = {
  "2026-11-16": {
    "1:0257918-9": -140161.65, "1:275226-3": 1067511.92, "1:00483730-8": 4433492.58, "1:00910779-3": 4536262.19,
    "3:0241711-1": -325801.45, "3:A0241711-1": 1861181.53, "3:5370-8": 455497.95, "3:5791519180": 25439.4, "3:A5026-3": 1908080.48,
    "4:490-1": 818990.17, "5:274-7": 34873.64, "6:479-0": 2850545.11, "7:487-1": 83781.76, "8:277-1": 15838.35,
    "9:276-3": 40722.43, "10:924-5": 63959.24, "11:1241-6": 624925.39,
  },
  "2026-11-17": {
    "1:0257918-9": -140161.65, "1:275226-3": 1087491.92, "1:00483730-8": 4433492.58, "1:00910779-3": 4536262.19,
    "3:0241711-1": -59801.45, "3:A0241711-1": 1861181.53, "3:5370-8": 455497.95, "3:5791519180": 25439.4, "3:A5026-3": 1908080.48,
    "4:490-1": 1147990.17, "5:274-7": 44436.77, "6:479-0": 2930707.93, "10:924-5": 77267.24,
  },
};
const f17 = fecharCaixa({ contas, movimentos: movimentos17, saldos: saldos17, de: "2026-11-17", ate: "2026-11-17", geradoEm: "2026-11-18T14:00:00.000Z" });
{
  const t = totalizar(f17.linhas);
  assert.equal(t.saldoAnterior, 18355139.04, "saldo anterior = saldo de 16/11 no Sienge");
  assert.equal(t.entradas, 723033.95, "entradas = Total Recebido do fechamento das 07:30");
  assert.equal(t.saidas, 539.25, "saídas = pagamento de R$ 520,00 + 3 tarifas");
  assert.equal(t.transferencias, -4500, "transferências internas se anulam; sobra o que foi para a holding");
  assert.equal(t.saldoFinal, 19073133.74);
  assert.equal(Math.round((t.saldoAnterior + t.entradas - t.saidas + t.transferencias) * 100), Math.round(t.saldoFinal * 100), "a conta fecha");
  // O saldo do Sienge para 17/11 ainda não tinha as três tarifas: aparece a diferença.
  assert.equal(t.diferenca, 19.25);
  assert.equal(t.saldoSienge, 19073152.99);
  assert.equal(t.incompleto, false);
  assert.deepEqual(f17.avisos, []);

  const bb = f17.linhas.find((l) => l.id === "1:275226-3")!;
  assert.deepEqual(
    [bb.saldoAnterior, bb.entradas, bb.saidas, bb.transferencias, bb.saldoFinal, bb.saldoSienge, bb.diferenca, bb.qtd],
    [1067511.92, 25000, 535.14, -4500, 1087476.78, 1087491.92, 15.14, 6]
  );
  // Empresa sem movimento no período: fecha com o saldo anterior e não há saldo do Sienge para conferir.
  const rozza = f17.linhas.find((l) => l.id === "11:1241-6")!;
  assert.deepEqual([rozza.saldoAnterior, rozza.saldoFinal, rozza.saldoSienge, rozza.diferenca, rozza.qtd], [624925.39, 624925.39, null, 0, 0]);
  // Conta sem movimento de empresa que teve: o Sienge devolve o saldo e ele confere.
  const btg = f17.linhas.find((l) => l.id === "1:00483730-8")!;
  assert.deepEqual([btg.saldoFinal, btg.saldoSienge, btg.diferenca], [4433492.58, 4433492.58, 0]);

  // Lançamentos: só os das 17 contas no período.
  assert.equal(f17.lancamentos.length, 17);
  assert.equal(contarLancamentos(f17.lancamentos, "entrada"), 8);
  assert.equal(contarLancamentos(f17.lancamentos, "saida"), 4);
  assert.equal(contarLancamentos(f17.lancamentos, "transferencia"), 5);
  assert.equal(f17.lancamentos[0].efeito, 565000, "do maior para o menor dentro do dia");
  assert.equal(f17.lancamentos[0].quem, "CLIENTE B");
  assert.equal(f17.lancamentos.find((l) => l.tipo === "transferencia")!.quem, "Transferência");

  // Pago em dinheiro: conta CAIXA das empresas das 17 contas; a da holding (2) fica fora.
  assert.deepEqual(f17.pagoEmDinheiro, { total: 15170, qtd: 2 });
  assert.deepEqual(pagoEmDinheiro(movimentos17, "2026-11-17", "2026-11-17", [1, 2]), { total: 22314.36, qtd: 3 });
}

// ── 4. Por empresa e por banco ───────────────────────────────────────────────────────────
{
  const porEmpresa = agruparLinhas(f17.linhas, "empresa");
  assert.equal(porEmpresa.length, 10);
  assert.equal(porEmpresa[0].nome, EMPRESAS[1]);
  assert.deepEqual(
    [porEmpresa[0].total.saldoAnterior, porEmpresa[0].total.entradas, porEmpresa[0].total.saidas, porEmpresa[0].total.transferencias, porEmpresa[0].total.saldoFinal],
    [9897105.04, 25000, 535.14, -4500, 9917069.9]
  );
  const sul = porEmpresa.find((g) => g.nome === EMPRESAS[3])!;
  assert.deepEqual([sul.total.saldoAnterior, sul.total.transferencias, sul.total.saldoFinal], [3924397.91, 266000, 4190397.91]);
  const jardins = porEmpresa.find((g) => g.nome === EMPRESAS[4])!;
  assert.deepEqual([jardins.total.saldoAnterior, jardins.total.entradas, jardins.total.transferencias, jardins.total.saldoFinal], [818990.17, 595000, -266000, 1147990.17]);

  const porBanco = agruparLinhas(f17.linhas, "banco");
  assert.deepEqual(porBanco.map((g) => g.nome).sort(), ["BTG Pactual", "Banco do Brasil", "Bradesco", "Caixa Econômica"]);
  assert.equal(porBanco.find((g) => g.nome === "Banco do Brasil")!.linhas.length, 10);
  const somaBancos = porBanco.reduce((s, g) => s + g.total.saldoFinal, 0);
  assert.equal(Math.round(somaBancos * 100), 1907313374, "por banco soma o mesmo total");
  // A transferência entre empresas aparece nos bancos: saiu do BB (135 Jardins) e entrou no Bradesco (Sul Brasil).
  assert.equal(porBanco.find((g) => g.nome === "Bradesco")!.total.transferencias, 266000);
}

// ── 5. Retenção e desconto abatem; conta fora da lista não entra ─────────────────────────
{
  const movs = [
    mov("275226-3", 1, "2026-11-17", "S", 1000, "CP", PAGTO),
    mov("275226-3", 1, "2026-11-17", "E", 110, "CP", { bankMovementHistoricName: "Retenção impostos" }),
    mov("275226-3", 1, "2026-11-17", "E", 500, "CR", RECEB),
    mov("275226-3", 1, "2026-11-17", "S", 20, "CR", { bankMovementHistoricName: "Desconto concedido" }),
    mov("99999-9", 1, "2026-11-17", "E", 777, "CR", RECEB),
  ];
  const f = fecharCaixa({ contas, movimentos: movs, saldos: { "2026-11-16": saldos17["2026-11-16"] }, de: "2026-11-17", ate: "2026-11-17", geradoEm: "x" });
  const bb = f.linhas.find((l) => l.id === "1:275226-3")!;
  assert.deepEqual([bb.entradas, bb.saidas, bb.transferencias, bb.qtd], [480, 890, 0, 2]);
  assert.equal(bb.saldoFinal, 1067101.92);
  assert.equal(f.lancamentos.length, 4);
  assert.equal(f.lancamentos.filter((l) => l.abate).length, 2);
}

// ── 6. Período de vários dias, dia a dia ─────────────────────────────────────────────────
{
  const movs = [
    mov("490-1", 4, "2026-11-13", "E", 1000, "CR", RECEB),
    mov("490-1", 4, "2026-11-16", "E", 300, "CR", RECEB),
    mov("490-1", 4, "2026-11-16", "S", 100, "CP", PAGTO),
    mov("490-1", 4, "2026-11-17", "S", 50, "BC", TARIFA),
    mov("275226-3", 1, "2026-11-17", "E", 266000, "BC", TRANSF),
  ];
  // Só há saldo de 12/11 (antes do período): o resto sai dos movimentos.
  const saldos = { "2026-11-12": { "4:490-1": 10000, "1:275226-3": 500 } };
  const duas = contas.filter((c) => c.id === "4:490-1" || c.id === "1:275226-3");
  const f = fecharCaixa({ contas: duas, movimentos: movs, saldos, de: "2026-11-14", ate: "2026-11-17", geradoEm: "x" });
  const t = totalizar(f.linhas);
  // O movimento de 13/11 está antes do período: entra no saldo anterior, não nas entradas.
  assert.deepEqual([t.saldoAnterior, t.entradas, t.saidas, t.transferencias, t.saldoFinal], [11500, 300, 150, 266000, 277650]);
  const dias = diaADia(f.linhas, f.lancamentos, f.de, f.ate);
  assert.deepEqual(dias.map((d) => d.data), ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
  assert.deepEqual(dias.map((d) => d.saldoFinal), [11500, 11500, 11700, 277650]);
  assert.deepEqual(dias.map((d) => d.qtd), [0, 0, 2, 2]);
  assert.equal(dias[3].saldoFinal, t.saldoFinal, "o último dia fecha com o período");
  // Filtrando uma conta, o dia a dia é só dela.
  const so135 = f.linhas.filter((l) => l.id === "4:490-1");
  assert.deepEqual(diaADia(so135, f.lancamentos, f.de, f.ate).map((d) => d.saldoFinal), [11000, 11000, 11200, 11150]);
}

// ── 7. Em que datas pedir saldo ──────────────────────────────────────────────────────────
{
  const movs = [
    mov("MUTUO-7", 7, "2026-11-13", "E", 10, "BC", TRANSF), // movimento em qualquer conta da empresa vale
    mov("275226-3", 1, "2026-11-13", "E", 10, "CR", RECEB),
    mov("275226-3", 1, "2026-11-16", "E", 10, "CR", RECEB),
    mov("275226-3", 1, "2026-11-17", "E", 10, "CR", RECEB),
    mov("490-1", 4, "2026-11-17", "E", 10, "CR", RECEB),
    mov("9937-6", 2, "2026-11-16", "E", 10, "CR", RECEB), // holding: fora
  ];
  assert.deepEqual(datasDeSaldo({ movimentos: movs, companyIds: [1, 4, 7, 8], de: "2026-11-17", ate: "2026-11-17" }), {
    antes: ["2026-11-13", "2026-11-16"],
    dentro: ["2026-11-17"],
    semAncora: [4, 8],
  });
}

// ── 8. Conta sem saldo do Sienge: foto gravada (estimado) ou aviso ───────────────────────
{
  const duas = contas.filter((c) => c.id === "8:277-1" || c.id === "9:276-3");
  const semNada = fecharCaixa({ contas: duas, movimentos: [], saldos: {}, de: "2026-11-17", ate: "2026-11-17", geradoEm: "x" });
  assert.deepEqual(semNada.linhas.map((l) => l.saldoAnterior), [null, null]);
  assert.equal(totalizar(semNada.linhas).incompleto, true);
  assert.equal(semNada.avisos.length, 1);

  const comFoto = fecharCaixa({ contas: duas, movimentos: [], saldos: { "2026-11-16": { "8:277-1": 15838.35 } }, fotos: { "2026-11-15": { "9:276-3": 40722.43, "8:277-1": 1 } }, de: "2026-11-17", ate: "2026-11-17", geradoEm: "x" });
  const siena = comFoto.linhas.find((l) => l.id === "8:277-1")!;
  const tesla = comFoto.linhas.find((l) => l.id === "9:276-3")!;
  assert.deepEqual([siena.saldoAnterior, siena.estimado], [15838.35, false], "com saldo do Sienge a foto não é usada");
  assert.deepEqual([tesla.saldoAnterior, tesla.estimado], [40722.43, true]);
  assert.equal(comFoto.avisos.length, 1);
}

console.log("fechamento-caixa: ok");
