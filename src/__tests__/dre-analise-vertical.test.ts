// Trava da análise vertical da DRE: npx tsx src/__tests__/dre-analise-vertical.test.ts
// Números = DRE Simples da tela de 09/11/2026 (Silva Packer, 2026), a mesma que
// mostrava os cards 15,5 % / 11,4 % / −4,7 % / −6,6 %.
import assert from "node:assert/strict";
import { pctDaReceita, formatarPctReceita } from "../lib/dre-analise-vertical";

const receita = 46346652.94;
const linha = (valor: number, comSinal: boolean) => formatarPctReceita(pctDaReceita(valor, receita, comSinal));

// Receita é 100 % dela mesma.
assert.equal(linha(receita, false), "100,0%");

// Custo e despesa: sem sinal ("o custo variável é 84,5 % da receita").
assert.equal(linha(-39171965.09, false), "84,5%");
assert.equal(linha(-1892285.6, false), "4,1%");
assert.equal(linha(-1376758.45, false), "3,0%");
assert.equal(linha(-6063388.93, false), "13,1%");
assert.equal(linha(-719746.12, false), "1,6%");
assert.equal(linha(-167055.8, false), "0,4%");

// Linhas de lucro: margem com sinal, igual à pílula dos cards do topo.
assert.equal(linha(7174687.85, true), "15,5%");
assert.equal(linha(5282402.25, true), "11,4%");
assert.equal(linha(-2157745.13, true), "-4,7%");
assert.equal(linha(-3044547.05, true), "-6,6%");

// Custos somam a receita menos o lucro bruto: 100 % − 84,5 % = 15,5 %.
const cv = pctDaReceita(-39171965.09, receita, false)!;
const lb = pctDaReceita(7174687.85, receita, true)!;
assert.ok(Math.abs(100 - cv - lb) < 1e-9);

// Sem receita no período: sem percentual.
assert.equal(pctDaReceita(-100, 0, false), null);
assert.equal(formatarPctReceita(null), "");

// Bordas de formatação.
assert.equal(formatarPctReceita(0), "0,0%");
assert.equal(formatarPctReceita(0.03), "<0,1%");
assert.equal(formatarPctReceita(-0.03), "<0,1%");
assert.equal(formatarPctReceita(-0.04999), "<0,1%");
assert.equal(formatarPctReceita(1234.56), "1.234,6%");

console.log("dre-analise-vertical: ok");
