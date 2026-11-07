// Trava da variação do DRE Completo: npx tsx src/__tests__/dre-variacao.test.ts
// Números = tela do DRE Completo de 07/11/2026 (Silva Packer, 2026).
import assert from "node:assert/strict";
import { variacaoDre } from "../lib/dre-variacao";

const perto = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.05, `${a} ≠ ${b}`);

// Custo variável jun→jul: caiu de 5,21 mi para 4,66 mi → "−10,5%", verde.
const julho = variacaoDre(-4663228.15, -5212081.44, true)!;
perto(julho.exibida, -10.53);
assert.ok(julho.efeito > 0, "custo que cai é bom para o resultado (verde)");

// Custo variável jan→fev: subiu de 3,02 mi para 3,51 mi → "+16,4%", vermelho.
const fevereiro = variacaoDre(-3513705.86, -3017376.85, true)!;
perto(fevereiro.exibida, 16.45);
assert.ok(fevereiro.efeito < 0, "custo que sobe é ruim para o resultado (vermelho)");

// Receita jan→fev: sinal e cor iguais aos de antes (+59,6%, verde).
const receita = variacaoDre(6750707.55, 4229607.51, false)!;
perto(receita.exibida, 59.6);
perto(receita.efeito, 59.6);

// Lucro bruto jun→jul, de prejuízo para lucro: +342,4%, como antes.
const lucro = variacaoDre(2303277.5, -950043.02, false)!;
perto(lucro.exibida, 342.4);
assert.ok(lucro.efeito > 0);

// Mês anterior zerado: sem percentual.
assert.equal(variacaoDre(-100, 0, true), null);

// Cor sempre pelo efeito; nas linhas de custo o número é o efeito com o sinal trocado.
for (const [a, b] of [[-80, -100], [-120, -100], [20, -100], [-50, 10]]) {
  const v = variacaoDre(a, b, true)!;
  assert.equal(v.exibida, -v.efeito);
}
console.log("dre-variacao: ok");
