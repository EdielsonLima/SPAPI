// npx tsx src/__tests__/fechamento-caixa.test.ts
// Trava das regras do Fechamento de Caixa (src/lib/fechamento-caixa.ts). Os casos grandes são
// o de 17/11/2026, com os saldos e os movimentos que o Sienge devolveu em 18/11/2026, e o de
// 18/11/2026 com os 17 movimentos reais do dia (Entradas e Saídas iguais ao fechamento das 07:30).
import assert from "node:assert/strict";
import { BANK_NAMES, DIMBAN_ACCOUNT_COMPANY } from "../lib/dimBanco";
import {
  agruparLinhas,
  classificar,
  composicaoOutros,
  contarLancamentos,
  datasDeSaldo,
  diaADia,
  ehTransferencia,
  fecharCaixa,
  montarConta,
  pagoEmDinheiro,
  resumoForaDosBancos,
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
  // Avulso (sem título) vai para Outros: transferência, saque, depósito e resgate; tarifa; o resto.
  const categoria = (m: MovimentoCaixa) => {
    const c = classificar(m);
    return `${c.tipo}/${c.categoria}`;
  };
  assert.equal(categoria(mov("275226-3", 1, "2026-11-17", "S", 266000, "BC", TRANSF)), "outro/transferencia");
  assert.equal(categoria(mov("275226-3", 1, "2026-11-17", "S", 50000, "BC", { bankMovementOperationName: "Saque", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS", bankMovementHistoricName: "Saque Bancário" })), "outro/transferencia");
  assert.equal(categoria(mov("275226-3", 1, "2026-11-17", "E", 38000, "BC", { bankMovementOperationName: "Depósito", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS" })), "outro/transferencia");
  assert.equal(categoria(mov("A5026-3", 3, "2026-11-17", "S", 9000, "BC", { bankMovementOperationName: "Transferência", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS", bankMovementHistoricName: "Resgate de Aplicação" })), "outro/transferencia");
  // "Transferência entre empresas" lançada com documento AVISO DE LANÇAMENTO também é transferência.
  assert.equal(categoria(mov("275226-3", 1, "2026-11-17", "S", 5000, "BC", { bankMovementOperationName: "Transferência entre empresas", documentIdentificationName: "AVISO DE LANÇAMENTO" })), "outro/transferencia");
  assert.deepEqual(classificar(mov("275226-3", 1, "2026-11-17", "S", 15.14, "BC", TARIFA)), { tipo: "outro", efeito: -15.14, abate: false, categoria: "tarifa" });
  assert.equal(categoria(mov("275226-3", 1, "2026-11-17", "E", 3.5, "BC", { bankMovementOperationName: "Aviso de Lançamento", documentIdentificationName: "AVISO DE LANÇAMENTO", bankMovementHistoricName: "Crédito" })), "outro/avulso");
  // Título da Holding (pago por conta de outra empresa) também vai para Outros.
  assert.deepEqual(classificar(mov("275226-3", 1, "2026-11-17", "S", 1000, "CP", PAGTO), true), { tipo: "outro", efeito: -1000, abate: false, categoria: "holding" });
  // Estorno de baixa vem com valor negativo: vale o sinal (diminui a saída, não soma).
  assert.deepEqual(classificar(mov("9937-6", 2, "2026-09-08", "S", -580, "CP", PAGTO)), { tipo: "saida", efeito: 580, abate: false });
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
const f17 = fecharCaixa({ contas, movimentos: movimentos17, saldos: saldos17, de: "2026-11-17", ate: "2026-11-17", geradoEm: "2026-11-18T14:00:00.000Z", empresasHolding: [2] });
{
  const t = totalizar(f17.linhas);
  assert.equal(t.saldoAnterior, 18355139.04, "saldo anterior = saldo de 16/11 no Sienge");
  assert.equal(t.entradas, 723033.95, "entradas = Total Recebido do fechamento das 07:30");
  assert.equal(t.saidas, 15690, "saídas = Total Pago do fechamento das 07:30: R$ 520,00 no banco + R$ 15.170,00 em dinheiro");
  // Outros: transferência para a holding (−4.500), 3 tarifas (−19,25) e a volta do que foi pago em dinheiro (+15.170).
  assert.equal(t.outros, 10650.75);
  assert.deepEqual(composicaoOutros(f17.lancamentos), { transferencias: -4500, tarifas: -19.25, holding: 0, avulsos: 0, foraDosBancos: 15170 });
  assert.equal(t.saldoFinal, 19073133.74, "o saldo dos bancos não muda com a regra nova");
  assert.equal(Math.round((t.saldoAnterior + t.entradas - t.saidas + t.outros) * 100), Math.round(t.saldoFinal * 100), "a conta fecha");
  // O saldo do Sienge para 17/11 ainda não tinha as três tarifas: aparece a diferença.
  assert.equal(t.diferenca, 19.25);
  assert.equal(t.saldoSienge, 19073152.99);
  assert.equal(t.incompleto, false);
  assert.deepEqual(f17.avisos, []);

  const bb = f17.linhas.find((l) => l.id === "1:275226-3")!;
  assert.deepEqual(
    [bb.saldoAnterior, bb.entradas, bb.saidas, bb.outros, bb.saldoFinal, bb.saldoSienge, bb.diferenca, bb.qtd],
    [1067511.92, 25000, 520, -4515.14, 1087476.78, 1087491.92, 15.14, 6]
  );
  // Empresa sem movimento no período: fecha com o saldo anterior e não há saldo do Sienge para conferir.
  const rozza = f17.linhas.find((l) => l.id === "11:1241-6")!;
  assert.deepEqual([rozza.saldoAnterior, rozza.saldoFinal, rozza.saldoSienge, rozza.diferenca, rozza.qtd], [624925.39, 624925.39, null, 0, 0]);
  // Conta sem movimento de empresa que teve: o Sienge devolve o saldo e ele confere.
  const btg = f17.linhas.find((l) => l.id === "1:00483730-8")!;
  assert.deepEqual([btg.saldoFinal, btg.saldoSienge, btg.diferenca], [4433492.58, 4433492.58, 0]);

  // O caixa interno da Construtora vira uma linha fora dos bancos, sem saldo; o da holding, o mútuo e a conta da holding ficam fora.
  assert.equal(f17.linhas.length, 18);
  const caixa = f17.linhas.find((l) => l.id === "1:CAIXA")!;
  assert.deepEqual(
    [caixa.foraDosBancos, caixa.bancoNome, caixa.instituicao, caixa.entradas, caixa.saidas, caixa.outros, caixa.saldoAnterior, caixa.saldoFinal, caixa.qtd],
    [true, "Caixa interno (dinheiro)", "Fora dos bancos", 0, 15170, 15170, null, null, 2]
  );
  assert.deepEqual(resumoForaDosBancos(f17.linhas), [{ rotulo: "Caixa interno (dinheiro)", recebido: 0, pago: 15170, qtd: 2 }]);

  // Lançamentos: os das 17 contas e os 2 do caixa interno, no período.
  assert.equal(f17.lancamentos.length, 19);
  assert.equal(contarLancamentos(f17.lancamentos, "entrada"), 8);
  assert.equal(contarLancamentos(f17.lancamentos, "saida"), 3);
  assert.equal(contarLancamentos(f17.lancamentos, "outro"), 8);
  assert.equal(f17.lancamentos.filter((l) => l.foraDosBancos).length, 2);
  assert.equal(f17.lancamentos[0].efeito, 565000, "do maior para o menor dentro do dia");
  assert.equal(f17.lancamentos[0].quem, "CLIENTE B");
  assert.equal(f17.lancamentos.find((l) => l.categoria === "transferencia")!.quem, "Transferência");

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
    [porEmpresa[0].total.saldoAnterior, porEmpresa[0].total.entradas, porEmpresa[0].total.saidas, porEmpresa[0].total.outros, porEmpresa[0].total.saldoFinal],
    [9897105.04, 25000, 15690, 10654.86, 9917069.9]
  );
  const sul = porEmpresa.find((g) => g.nome === EMPRESAS[3])!;
  assert.deepEqual([sul.total.saldoAnterior, sul.total.outros, sul.total.saldoFinal], [3924397.91, 266000, 4190397.91]);
  const jardins = porEmpresa.find((g) => g.nome === EMPRESAS[4])!;
  assert.deepEqual([jardins.total.saldoAnterior, jardins.total.entradas, jardins.total.outros, jardins.total.saldoFinal], [818990.17, 595000, -266000, 1147990.17]);

  const porBanco = agruparLinhas(f17.linhas, "banco");
  assert.deepEqual(porBanco.map((g) => g.nome).sort(), ["BTG Pactual", "Banco do Brasil", "Bradesco", "Caixa Econômica", "Fora dos bancos"]);
  const ultimo = porBanco[porBanco.length - 1];
  assert.deepEqual([ultimo.nome, ultimo.semSaldo, ultimo.total.saidas], ["Fora dos bancos", true, 15170], "fora dos bancos vem por último, sem saldo");
  assert.equal(porBanco.find((g) => g.nome === "Banco do Brasil")!.linhas.length, 10);
  const somaBancos = porBanco.reduce((s, g) => s + g.total.saldoFinal, 0);
  assert.equal(Math.round(somaBancos * 100), 1907313374, "por banco soma o mesmo total");
  // A transferência entre empresas aparece nos bancos: saiu do BB (135 Jardins) e entrou no Bradesco (Sul Brasil).
  assert.equal(porBanco.find((g) => g.nome === "Bradesco")!.total.outros, 266000);
}

// ── 5. Retenção e desconto abatem; título em conta fora da lista entra fora dos bancos ───
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
  assert.deepEqual([bb.entradas, bb.saidas, bb.outros, bb.qtd], [480, 890, 0, 2]);
  assert.equal(bb.saldoFinal, 1067101.92);
  assert.equal(f.lancamentos.length, 5);
  assert.equal(f.lancamentos.filter((l) => l.abate).length, 2);
  const outra = f.linhas.find((l) => l.id === "1:99999-9")!;
  assert.deepEqual([outra.foraDosBancos, outra.bancoNome, outra.entradas, outra.outros, outra.saldoFinal], [true, "Conta fora da lista", 777, -777, null]);
  const t = totalizar(f.linhas);
  assert.deepEqual([t.entradas, t.outros, t.incompleto], [1257, -777, false], "a linha fora dos bancos não deixa o total incompleto");
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
  assert.deepEqual([t.saldoAnterior, t.entradas, t.saidas, t.outros, t.saldoFinal], [11500, 300, 100, 265950, 277650]);
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

// ── 9. O fechamento de 18/11/2026: os 17 movimentos reais do dia ─────────────────────────
// A aba mostrava Entradas R$ 18.259,39 e Saídas R$ 0,00; o fechamento das 07:30, Total
// Recebido R$ 105.516,19 e Total Pago R$ 87.256,80. A diferença passou pelo caixa interno.
{
  const VIDROS = { ...PAGTO, documentIdentificationName: "CONTRATO", documentIdentificationNumber: "PER-TURQUESA", billId: 25947, installmentId: 19, creditorName: "FERREIRA E CAMARGO VIDROS" };
  const ALEXANDRE = { ...RECEB, documentIdentificationNumber: "R-2450.1401+", billId: 611, installmentId: 31, clientName: "ALEXANDRE VITOR MACHADO" };
  const LUCAS = { ...RECEB, documentIdentificationNumber: "PALAC.2801.2", billId: 681, installmentId: 27, clientName: "LUCAS MARTINS MEDEIROS" };
  const SAH = { ...TRANSF, documentIdentificationNumber: "SB BB/SAH BB" };
  const movimentos18: MovimentoCaixa[] = [
    mov("9937-6", 2, "2026-11-18", "E", 7500, "BC", SAH),
    mov("MUTUO-2", 2, "2026-11-18", "S", 7500, "BC", SAH),
    mov("5370-8", 3, "2026-11-18", "S", 7500, "BC", SAH),
    mov("MUTUO-3", 3, "2026-11-18", "E", 7500, "BC", SAH),
    // A Construtora paga pelo caixa interno um título do 135 Jardins (o mútuo do 135 tem a saída).
    mov("MUTUO-1", 1, "2026-11-18", "E", 87256.8, "CP", VIDROS),
    mov("CAIXA", 1, "2026-11-18", "S", 87256.8, "CP", VIDROS),
    mov("MUTUO-4", 4, "2026-11-18", "S", 87256.8, "CP", VIDROS),
    // E recebe em dinheiro dois títulos de outras empresas (o mútuo delas tem a entrada).
    mov("MUTUO-1", 1, "2026-11-18", "S", 51925, "CR", ALEXANDRE),
    mov("CAIXA", 1, "2026-11-18", "E", 51925, "CR", ALEXANDRE),
    mov("MUTUO-1", 1, "2026-11-18", "S", 35331.8, "CR", LUCAS),
    mov("CAIXA", 1, "2026-11-18", "E", 35331.8, "CR", LUCAS),
    mov("5370-8", 3, "2026-11-18", "E", 7500, "CR", { ...RECEB, documentIdentificationName: "CONTRATO DE LOCAÇÃO", billId: 1112, installmentId: 2, clientName: "JULIANA CHEN" }),
    mov("MUTUO-6", 6, "2026-11-18", "E", 35330.8, "CR", LUCAS),
    mov("MUTUO-6", 6, "2026-11-18", "E", 1, "CR", { ...LUCAS, bankMovementHistoricName: "Recebimento acréscimo" }),
    mov("924-5", 10, "2026-11-18", "E", 10759.39, "CR", { ...RECEB, billId: 311, installmentId: 48, clientName: "CARLOS EDUARDO FERREIRA HALUCH" }),
    mov("MUTUO-13", 13, "2026-11-18", "E", 51924.9, "CR", ALEXANDRE),
    mov("MUTUO-13", 13, "2026-11-18", "E", 0.1, "CR", { ...ALEXANDRE, bankMovementHistoricName: "Recebimento acréscimo" }),
  ];
  // Saldo de 17/11 já com as três tarifas (como o Sienge devolveu em 18/11 mais tarde).
  const fim17 = { ...saldos17["2026-11-17"], "1:275226-3": 1087476.78, "5:274-7": 44434.73, "10:924-5": 77265.17 };
  const f = fecharCaixa({
    contas,
    movimentos: movimentos18,
    saldos: { "2026-11-16": saldos17["2026-11-16"], "2026-11-17": fim17 },
    de: "2026-11-18",
    ate: "2026-11-18",
    geradoEm: "x",
    empresasHolding: [2],
    nomesEmpresas: { 2: "SILVA ADMINISTRADORA HOLDING LTDA", 13: "RESIDENCIAL RUA 2450" },
  });
  const t = totalizar(f.linhas);
  assert.equal(t.saldoAnterior, 19073133.74);
  assert.equal(t.entradas, 105516.19, "= Total Recebido do fechamento das 07:30");
  assert.equal(t.saidas, 87256.8, "= Total Pago do fechamento das 07:30");
  assert.equal(t.outros, -7500, "a transferência da Sul Brasil para a holding; o caixa interno recebeu e pagou o mesmo valor");
  assert.equal(t.saldoFinal, 19083893.13, "o mesmo saldo final de antes");
  const caixa = f.linhas.find((l) => l.id === "1:CAIXA")!;
  assert.deepEqual([caixa.entradas, caixa.saidas, caixa.outros, caixa.qtd], [87256.8, 87256.8, 0, 3]);
  // Cada lançamento do caixa diz de que empresa é o título.
  const doCaixa = f.lancamentos.filter((l) => l.contaId === "1:CAIXA");
  assert.deepEqual(
    doCaixa.map((l) => [l.quem, l.empresaTitulo]),
    [
      ["FERREIRA E CAMARGO VIDROS", EMPRESAS[4]],
      ["ALEXANDRE VITOR MACHADO", "RESIDENCIAL RUA 2450"],
      ["LUCAS MARTINS MEDEIROS", EMPRESAS[6]],
    ]
  );
  // Título da própria dona da conta não leva a marca.
  assert.equal(f.lancamentos.find((l) => l.titulo === 1112)!.empresaTitulo, undefined);
  // A conta da holding que recebeu a transferência não entra (não é título das empresas).
  assert.equal(f.linhas.some((l) => l.id === "2:9937-6"), false);
}

// ── 10. Holding: título do Galpão pago pela conta dela; título dela pago por conta da lista ──
{
  const GALPAO = { ...PAGTO, billId: 777, installmentId: 1, creditorName: "CELESC" };
  const DA_HOLDING = { ...PAGTO, billId: 888, installmentId: 1, creditorName: "CONTADOR" };
  const movs = [
    mov("9937-6", 2, "2026-11-05", "S", 90.18, "CP", GALPAO),
    mov("MUTUO-2", 2, "2026-11-05", "E", 90.18, "CP", GALPAO),
    mov("MUTUO-15", 15, "2026-11-05", "S", 90.18, "CP", GALPAO),
    mov("275226-3", 1, "2026-11-05", "S", 1000, "CP", DA_HOLDING),
    mov("MUTUO-1", 1, "2026-11-05", "E", 1000, "CP", DA_HOLDING),
    mov("MUTUO-2", 2, "2026-11-05", "S", 1000, "CP", DA_HOLDING),
    // Título da própria holding pago pela conta dela: não entra em nada.
    mov("9937-6", 2, "2026-11-05", "S", 300, "CP", { ...PAGTO, billId: 999, installmentId: 1 }),
  ];
  const bb = contas.filter((c) => c.id === "1:275226-3");
  const f = fecharCaixa({
    contas: bb,
    movimentos: movs,
    saldos: { "2026-11-04": { "1:275226-3": 5000 } },
    de: "2026-11-05",
    ate: "2026-11-05",
    geradoEm: "x",
    nomesEmpresas: { 2: "SILVA ADMINISTRADORA HOLDING LTDA", 15: "GALPÃO - RUA CANELINHA" },
  });
  const t = totalizar(f.linhas);
  // A holding é achada pelo nome; o pagamento do Galpão entra nas Saídas, o da holding fica em Outros.
  assert.deepEqual([t.entradas, t.saidas, t.outros, t.saldoFinal], [0, 90.18, -909.82, 4000]);
  const daHolding = f.linhas.find((l) => l.id === "2:9937-6")!;
  assert.deepEqual([daHolding.foraDosBancos, daHolding.bancoNome, daHolding.saidas, daHolding.outros], [true, "Conta da Holding", 90.18, 90.18]);
  assert.equal(f.lancamentos.find((l) => l.titulo === 777)!.empresaTitulo, "GALPÃO - RUA CANELINHA");
  const pagoPelaLista = f.lancamentos.find((l) => l.titulo === 888)!;
  assert.deepEqual([pagoPelaLista.tipo, pagoPelaLista.categoria, pagoPelaLista.empresaTitulo], ["outro", "holding", "SILVA ADMINISTRADORA HOLDING LTDA"]);
  assert.equal(f.lancamentos.some((l) => l.titulo === 999), false);
  assert.deepEqual(composicaoOutros(f.lancamentos), { transferencias: 0, tarifas: 0, holding: -1000, avulsos: 0, foraDosBancos: 90.18 });
}

// ── 11. Estorno de baixa: valor negativo diminui a saída do dia ──────────────────────────
{
  const movs = [
    mov("275226-3", 1, "2026-11-05", "S", 580, "CP", { ...PAGTO, billId: 50, installmentId: 1 }),
    mov("275226-3", 1, "2026-11-05", "S", -580, "CP", { ...PAGTO, billId: 50, installmentId: 1, bankMovementHistoricName: "Estorno" }),
  ];
  const bb = contas.filter((c) => c.id === "1:275226-3");
  const f = fecharCaixa({ contas: bb, movimentos: movs, saldos: { "2026-11-04": { "1:275226-3": 5000 } }, de: "2026-11-05", ate: "2026-11-05", geradoEm: "x" });
  const t = totalizar(f.linhas);
  assert.deepEqual([t.saidas, t.saldoFinal], [0, 5000], "pagamento e estorno se anulam (antes somava R$ 1.160,00)");
}

console.log("fechamento-caixa: ok");
