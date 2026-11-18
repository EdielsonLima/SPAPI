// npx tsx src/__tests__/saldos-diarios.test.ts
// Trava do saldo diário recalculado (src/lib/saldos-diarios.ts), que alimenta o gráfico
// Evolução do Saldo da aba Saldos. Tem de bater com o dia a dia do Fechamento de Caixa.
import assert from "node:assert/strict";
import { BANK_NAMES, DIMBAN_ACCOUNT_COMPANY } from "../lib/dimBanco";
import { diaADia, fecharCaixa, montarConta, type MovimentoCaixa } from "../lib/fechamento-caixa";
import { datasDeAncora, saldosDiarios, totalPorDia } from "../lib/saldos-diarios";

let id = 0;
const mov = (conta: string, empresa: number, data: string, tipo: "E" | "S", valor: number, origem = "CR"): MovimentoCaixa => ({
  bankMovementId: ++id, bankMovementDate: data, bankMovementAmount: valor, bankMovementOperationType: tipo, bankMovementOriginId: origem, accountNumber: conta, companyId: empresa,
});

// Empresa 1 (BB 275226-3 e BTG 00483730-8) com movimento em 12, 13, 16 e 17/11; empresa 4
// (490-1) só em 13/11; empresa 7 (487-1) parada na janela; conta CAIXA fora da relação.
const movimentos: MovimentoCaixa[] = [
  mov("275226-3", 1, "2026-11-12", "E", 91756.79),
  mov("275226-3", 1, "2026-11-13", "E", 127434.39),
  mov("275226-3", 1, "2026-11-16", "E", 300000),
  mov("275226-3", 1, "2026-11-16", "S", 20948.36, "CP"),
  mov("275226-3", 1, "2026-11-17", "E", 19964.86),
  mov("490-1", 4, "2026-11-13", "S", 1000, "CP"),
  mov("CAIXA", 1, "2026-11-17", "S", 15170, "CP"),
];

// ── 1. Datas em que pedir saldo: a última com movimento de cada empresa até o fim ────────
assert.deepEqual(datasDeAncora(movimentos, "2026-11-17"), ["2026-11-13", "2026-11-17"]);
assert.deepEqual(datasDeAncora(movimentos, "2026-11-15"), ["2026-11-13"], "movimento depois do fim não conta");
assert.deepEqual(datasDeAncora([], "2026-11-17"), []);

// ── 2. Saldo de cada dia ─────────────────────────────────────────────────────────────────
// O Sienge devolve em 17/11 as contas da empresa 1 e em 13/11 as das empresas 1 e 4.
const saldos = {
  "2026-11-17": { "1:275226-3": 1087476.78, "1:00483730-8": 4433492.58, "1:CAIXA": 500 },
  "2026-11-13": { "1:275226-3": 788460.28, "1:00483730-8": 4433492.58, "4:490-1": 1150145.95 },
};
const fotos = { "2026-11-10": { "7:487-1": 83781.76, "1:275226-3": 1 } };
const dias = saldosDiarios({ movimentos, saldos, fotos, de: "2026-11-12", ate: "2026-11-17" });
{
  assert.deepEqual(Object.keys(dias), ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"], "todos os dias, com fim de semana");
  const bb = (d: string) => dias[d].find((c) => c.accountId === "1:275226-3")!.amount;
  // Antes da primeira data com saldo: volta descontando o movimento de 13/11.
  assert.equal(bb("2026-11-12"), 661025.89);
  assert.equal(bb("2026-11-13"), 788460.28);
  // Fim de semana: nada se move, vale o saldo de sexta.
  assert.equal(bb("2026-11-14"), 788460.28);
  assert.equal(bb("2026-11-15"), 788460.28);
  // Segunda: saldo de sexta + movimentos do dia; terça: o que o Sienge devolveu.
  assert.equal(bb("2026-11-16"), 1067511.92);
  assert.equal(bb("2026-11-17"), 1087476.78);
  // Conta sem movimento de empresa que teve: constante.
  assert.deepEqual(Object.values(dias).map((l) => l.find((c) => c.accountId === "1:00483730-8")!.amount), Array(6).fill(4433492.58));
  // Empresa 4: só há saldo de 13/11; antes volta o movimento, depois não muda.
  assert.deepEqual(Object.values(dias).map((l) => l.find((c) => c.accountId === "4:490-1")!.amount), [1151145.95, 1150145.95, 1150145.95, 1150145.95, 1150145.95, 1150145.95]);
  // Empresa parada: o Sienge não devolveu; vale a foto gravada, sem mudar.
  assert.deepEqual(Object.values(dias).map((l) => l.find((c) => c.accountId === "7:487-1")!.amount), Array(6).fill(83781.76));
  // A foto não passa por cima do saldo do Sienge (ela tinha R$ 1,00 no BB).
  assert.equal(dias["2026-11-12"].filter((c) => c.accountId === "1:275226-3").length, 1);
  // Conta fora da relação que o Sienge devolveu também entra (o gráfico soma só as marcadas).
  assert.equal(dias["2026-11-16"].find((c) => c.accountId === "1:CAIXA")!.amount, 15670);
  assert.equal(dias["2026-11-17"].find((c) => c.accountId === "1:CAIXA")!.amount, 500);
}

// ── 3. Bate com o dia a dia do Fechamento de Caixa ───────────────────────────────────────
{
  const EMPRESAS: Record<number, string> = { 1: "CONSTRUTORA", 4: "135 JARDINS", 7: "HANNOVER" };
  const contas = Object.entries(DIMBAN_ACCOUNT_COMPANY)
    .filter(([c]) => ["275226-3", "00483730-8", "490-1", "487-1"].includes(c))
    .map(([c, e]) => montarConta(c, e, EMPRESAS[e], BANK_NAMES[c]));
  const f = fecharCaixa({ contas, movimentos, saldos, fotos, de: "2026-11-13", ate: "2026-11-17", geradoEm: "x" });
  const fechamento = diaADia(f.linhas, f.lancamentos, f.de, f.ate);
  const grafico = totalPorDia(saldosDiarios({ movimentos, saldos, fotos, de: "2026-11-13", ate: "2026-11-17" }), contas.map((c) => c.id));
  for (const d of fechamento) assert.equal(grafico[d.data], d.saldoFinal, `saldo de ${d.data} igual no gráfico e no Fechamento`);
  assert.equal(grafico["2026-11-17"], 1087476.78 + 4433492.58 + 1150145.95 + 83781.76);
}

console.log("saldos-diarios: ok");
