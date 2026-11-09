// Trava do CUB-SC: mês novo do Sinduscon-SC entra na série do myside.
// Rodar: npx tsx src/__tests__/cub-scraper.test.ts
import assert from "node:assert/strict";
import { lerCubSinduscon, completarComSinduscon, type CubRow } from "../lib/indicadores/cub-scraper";

// Trecho real da página CUB Mensal do Sinduscon (09/11/2026).
const HTML = `<h3 class="w-text"><span class="w-text-h"><span class="w-text-value">CUB Norma 2006</span></span></h3>
<p class="w-text"><span class="w-text-h"><span class="w-text-value">Residencial Médio</span></span></p><div class="wpb_text_column"><div class="wpb_wrapper"><p><strong>Mês de Referência:</strong><br />
<span style="color: #9e3d42;">Outubro/2026</span></p>
</div></div><div class="wpb_text_column"><div class="wpb_wrapper"><p><strong>Para ser usado em:</strong><br />
<span style="color: #9e3d42;">Novembro/2026</span></p>
</div></div><div class="wpb_text_column us_custom_eb849559"><div class="wpb_wrapper"><p><span style="color: #9e3d42;">R$3.182,95</span><br />
0,35%</p>
</div></div>
<p class="w-text"><span class="w-text-h"><span class="w-text-value">Comercial Médio</span></span></p><div><p><strong>Mês de Referência:</strong><br />
<span>Outubro/2026</span></p><p><strong>Para ser usado em:</strong><br /><span>Novembro/2026</span></p><p><span>R$3.385,25</span><br />0,33%</p></div>`;

const sind = lerCubSinduscon(HTML);
// "CUB de novembro" = para ser usado em novembro; Residencial, não Comercial.
assert.deepEqual(sind, { ano: 2026, mes: 11, valor_m2: 3182.95, variacao_pct: 0.35 });
assert.equal(lerCubSinduscon("<html>sem CUB</html>"), null);
assert.deepEqual(lerCubSinduscon(HTML.replace("0,35%", "-0,12%"))?.variacao_pct, -0.12);

const linha = (ano: number, mes: number, valor: number): CubRow => ({
  ano, mes, valor_m2: valor, variacao_pct: 0, variacao_acumulada_ano_pct: 0, variacao_anual_pct: 0, fonte: "myside",
});
// Bases do myside (Nov/25 e Dez/25) e o último mês que ele tinha em 09/11 (Out/26).
const myside = [linha(2025, 11, 3003.08), linha(2025, 12, 3008.85), linha(2026, 10, 3171.96)];

const comNov = completarComSinduscon(myside, sind);
assert.equal(comNov.length, 4);
const nov = comNov[3];
assert.equal(nov.fonte, "sinduscon");
assert.equal(nov.valor_m2, 3182.95);
assert.equal(nov.variacao_pct, 0.35);
// Acumulado no ano = ÷ dez/25; 12 meses = ÷ nov/25 (o Sinduscon anunciou 5,99%).
assert.equal(nov.variacao_acumulada_ano_pct, Math.round((3182.95 / 3008.85 - 1) * 10000) / 100);
assert.equal(nov.variacao_anual_pct, 5.99);

// Myside já tem o mês: nada muda (o número dele fica).
const jaTem = [...myside, linha(2026, 11, 3182.95)];
assert.equal(completarComSinduscon(jaTem, sind), jaTem);
// Sinduscon fora do ar: série como veio.
assert.equal(completarComSinduscon(myside, null), myside);
// Sem a base de 12 meses: não inventa número.
assert.equal(completarComSinduscon([linha(2025, 12, 3008.85), linha(2026, 10, 3171.96)], sind).length, 2);

console.log("cub-scraper: ok");
