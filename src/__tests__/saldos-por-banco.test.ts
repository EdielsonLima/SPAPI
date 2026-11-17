// Trava da tabela "Contas por Banco" da aba Saldos: npx tsx src/__tests__/saldos-por-banco.test.ts
// Pedido do Edielson em 17/11/2026: alternar a tabela da direita entre empresa e banco.
import assert from "node:assert/strict";
import { BANK_NAMES } from "../lib/dimBanco";
import { agruparPorBanco, detalheDaConta, instituicaoDaConta, OUTRAS_CONTAS, type ContaSaldo } from "../lib/saldos-por-banco";

// 1. As 17 contas da lista da Cátia caem em 4 bancos, sem sobrar nome solto.
const bancosDoMapa = new Set(Object.values(BANK_NAMES).map(n => instituicaoDaConta({ bankName: n })));
assert.deepEqual([...bancosDoMapa].sort(), ["BTG Pactual", "Banco do Brasil", "Bradesco", "Caixa Econômica"]);
assert.equal(instituicaoDaConta({ bankName: "Aplicação Bradesco" }), "Bradesco");
assert.equal(instituicaoDaConta({ bankName: "Aplicação Caixa" }), "Caixa Econômica");
assert.equal(instituicaoDaConta({ bankName: "BTG Pactual - JP" }), "BTG Pactual");

// 2. O que separa contas do mesmo banco.
assert.equal(detalheDaConta("Aplicação Bradesco"), "Aplicação");
assert.equal(detalheDaConta("Aplicação Caixa"), "Aplicação");
assert.equal(detalheDaConta("BTG Pactual - CH"), "CH");
assert.equal(detalheDaConta("Banco do Brasil"), null);
assert.equal(detalheDaConta(""), null);

// 3. Conta fora do mapa: código Febraban, se vier; sem ele, "Outras contas" (a rota manda o
//    número da conta na descrição; "CAIXA" do Sienge é o dinheiro da empresa, não a Caixa
//    Econômica). "Outras contas" fica por último mesmo com saldo maior.
assert.equal(instituicaoDaConta({ bankName: "", bankCode: "001" }), "Banco do Brasil");
assert.equal(instituicaoDaConta({ bankName: "", bankCode: "237" }), "Bradesco");
assert.equal(instituicaoDaConta({ bankName: "", bankCode: "", bankAccountDescription: "CAIXA" }), OUTRAS_CONTAS);
assert.equal(instituicaoDaConta({ bankName: "", bankCode: "", bankAccountDescription: "5791519180" }), OUTRAS_CONTAS);
const comOutras = agruparPorBanco([
  { bankAccountId: 1, bankName: "", accountNumber: "COFRE", companyName: "SILVA PACKER", currentBalance: 9e9 },
  { bankAccountId: 2, bankName: "Banco do Brasil", accountNumber: "490-1", companyName: "EDIFICIO 135 JARDINS", currentBalance: 10 },
]);
assert.deepEqual(comOutras.map(g => g.banco), ["Banco do Brasil", OUTRAS_CONTAS]);

// 4. Agrupar: total de cada banco = soma das contas; soma dos bancos = total da tabela por
//    empresa; bancos e contas do maior saldo para o menor; nenhuma conta some.
const EMPRESA: Record<string, string> = {
  "0257918-9": "SILVA PACKER", "275226-3": "SILVA PACKER", "00483730-8": "SILVA PACKER", "00910779-3": "SILVA PACKER",
  "0241711-1": "SUL BRASIL", "A0241711-1": "SUL BRASIL", "5370-8": "SUL BRASIL", "5791519180": "SUL BRASIL", "A5026-3": "SUL BRASIL",
  "490-1": "EDIFICIO 135 JARDINS", "274-7": "SOLAR DI CAPRI", "479-0": "PALACIO ELIZABETH", "487-1": "RESIDENCIAL HANNOVER",
  "277-1": "SOLAR DI SIENA", "276-3": "TESLA RESIDENCIAL", "924-5": "SERENITY", "1241-6": "ROZZA",
};
let id = 0;
const contas: ContaSaldo[] = Object.entries(BANK_NAMES).map(([accountNumber, bankName]) => ({
  bankAccountId: ++id,
  bankName,
  accountNumber,
  companyName: EMPRESA[accountNumber],
  currentBalance: Math.round(((id * 7919) % 100000) * 100 + 0.37 * 100) / 100 - (accountNumber === "274-7" ? 150000 : 0),
}));
assert.equal(contas.length, 17);
const grupos = agruparPorBanco(contas);
const totalGeral = contas.reduce((s, c) => s + c.currentBalance, 0);
const somaBancos = grupos.reduce((s, g) => s + g.total, 0);
assert.ok(Math.abs(somaBancos - totalGeral) < 0.005, `${somaBancos} ≠ ${totalGeral}`);
assert.equal(grupos.reduce((s, g) => s + g.contas.length, 0), 17);
for (const g of grupos) {
  const soma = g.contas.reduce((s, c) => s + c.conta.currentBalance, 0);
  assert.ok(Math.abs(soma - g.total) < 0.005, g.banco);
  for (let i = 1; i < g.contas.length; i++) assert.ok(g.contas[i - 1].conta.currentBalance >= g.contas[i].conta.currentBalance, g.banco);
}
for (let i = 1; i < grupos.length; i++) assert.ok(grupos[i - 1].total >= grupos[i].total);
const qtd = Object.fromEntries(grupos.map(g => [g.banco, g.contas.length]));
assert.deepEqual(qtd, { "Banco do Brasil": 10, Bradesco: 3, "Caixa Econômica": 2, "BTG Pactual": 2 });
const btg = grupos.find(g => g.banco === "BTG Pactual")!;
assert.deepEqual(btg.contas.map(c => c.detalhe).sort(), ["CH", "JP"]);

console.log("saldos-por-banco: ok");
