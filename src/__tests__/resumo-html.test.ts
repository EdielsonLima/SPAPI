// Trava do Resumo Financeiro em HTML: npx tsx src/__tests__/resumo-html.test.ts
// Números = aba Resumo do Painel Executivo em produção, 11/11/2026 às 07:30 (Silva Packer,
// 10 empresas, 2016 a 2026), a tela que o Edielson mandou ao pedir o relatório.
//
// Para ver o relatório com estes números (logo embutido), dê um arquivo de saída:
//   RESUMO_HTML_SAIDA=C:/tmp/resumo.html npx tsx src/__tests__/resumo-html.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  montarResumoHtml, totaisDoResumo, rotuloPeriodo, nomeArquivoResumo, reais, porcento,
  type LinhaResumoHtml,
} from "../lib/resumo-html";

const linha = (
  empresa: string, finalizada: boolean, totalRecebido: number, totalPago: number, totalAReceber: number,
  valorEstoque: number, qtDispApto: number, qtDispSala: number, qtResTec: number, estoqueSemPreco = false,
): LinhaResumoHtml => ({ empresa, finalizada, totalRecebido, totalPago, totalAReceber, valorEstoque, estoqueSemPreco, qtDispApto, qtDispSala, qtResTec });

const linhas: LinhaResumoHtml[] = [
  linha("EDIFICIO 135 JARDINS", false, 96730297.82, 98618360.58, 29796128.26, 21250000, 5, 0, 6),
  linha("PALACIO ELIZABETH", false, 66414230.66, 39264256.67, 48066360.14, 33000000, 11, 0, 0),
  linha("ROZZA", false, 27362741.14, 15701037.79, 17289779.59, 39800000, 11, 6, 0),
  linha("DOMUS", false, 22127060.55, 11391121.33, 40635577.05, 62000000, 16, 6, 0),
  linha("SERENITY", false, 16658354.15, 19455646.32, 15093418.54, 19100000, 5, 1, 2),
  linha("TETRA", false, 4295000, 6569283.17, 0, 86400000, 17, 0, 0),
  linha("TESLA RESIDENCIAL", true, 55581270.33, 48881848.79, 2307436.33, 6000000, 0, 3, 0),
  linha("SOLAR DI CAPRI", true, 31892432.49, 31517086.46, 2454396.13, 2500000, 1, 0, 0),
  linha("SOLAR DI SIENA", true, 27783607.89, 21602819.59, 542141.04, 0, 6, 4, 0, true),
  linha("RESIDENCIAL HANNOVER", true, 26045549.54, 27072183.31, 3102847.96, 3000000, 0, 2, 3),
];

const centavos = (a: number, b: number, o: string) => assert.ok(Math.abs(a - b) < 0.005, `${o}: ${a} ≠ ${b}`);

// 1. Totais = linha "Total" e cartões da tela.
const t = totaisDoResumo(linhas);
centavos(t.recebido, 374890544.57, "Total Recebido");
centavos(t.pago, 320073644.01, "Total Pago");
centavos(t.lucro, 54816900.56, "Lucro Realizado");
centavos(t.aReceber, 159288085.04, "Total a Receber");
centavos(t.estoque, 273050000, "Valor Estoque");
centavos(t.aEntrar, 432338085.04, "Ainda a Entrar");
assert.equal(porcento(t.margem!, 2), "14,62%");
assert.deepEqual([t.dispApto, t.dispSala, t.resTec], [72, 22, 11]);

// 2. Formato igual ao da tela.
assert.equal(reais(96730297.82), "R$ 96.730.297,82");
assert.equal(reais(-1888062.76), "-R$ 1.888.062,76");
assert.equal(porcento(-1.9519), "-2,0%");
assert.equal(porcento(40.879), "40,9%");

const html = montarResumoHtml({
  linhas, marca: "Silva Packer", data: "11/11/2026", geradoEm: "11/11/2026 09:15",
  atualizadoEm: "11/11/2026 às 07:30", periodo: rotuloPeriodo(["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]),
});

// 3. Os números da tela estão no arquivo (cartões, tabela e cartões de celular).
const vezes = (trecho: string) => html.split(trecho).length - 1;
for (const v of ["R$ 374.890.544,57", "R$ 320.073.644,01", "R$ 54.816.900,56", "R$ 432.338.085,04"]) {
  assert.ok(vezes(v) >= 3, `${v} no cartão do topo, na tabela e no cartão do total`);
}
for (const v of ["R$ 159.288.085,04", "R$ 273.050.000,00", "14,62%"]) assert.ok(vezes(v) >= 2, v);
// Uma linha de cada jeito: lucro negativo, margem, a entrar.
for (const v of ["-R$ 1.888.062,76", "-2,0%", "R$ 51.046.128,26", "R$ 27.149.973,99", "40,9%", "R$ 102.635.577,05", "-53,0%", "R$ 86.400.000,00", "R$ 375.346,03", "1,2%"]) {
  assert.ok(vezes(v) >= 2, `${v} na tabela e no cartão`);
}
// Siena: unidades à venda sem preço — diz "sem preço" e o a entrar é só o a receber.
assert.equal(vezes("sem preço</span>"), 2);
assert.ok(vezes("R$ 542.141,04") >= 4);
// Tetra não tem nada a receber: traço, não "R$ 0,00".
assert.equal(vezes("R$ 0,00"), 0);
// Disponibilidade por extenso no cartão.
assert.ok(html.includes("11 apartamentos · 6 salas"));
assert.ok(html.includes("5 apartamentos · 1 sala<"));
assert.ok(html.includes("72 apartamentos · 22 salas"));
assert.ok(html.includes("11 unidades"));

// 4. Finalizadas depois das em andamento, embaixo de um divisor (um na tabela, um nos cartões).
assert.equal(vezes(">Finalizadas<"), 2);
assert.ok(html.indexOf("TETRA") < html.indexOf(">Finalizadas<"));
assert.ok(html.indexOf(">Finalizadas<") < html.indexOf("TESLA RESIDENCIAL"));
assert.ok(html.includes("6 em andamento · 4 finalizados"));

// 5. Cabeçalho, período e rodapé.
assert.ok(html.includes("<title>Resumo Financeiro 11/11/2026 | Silva Packer</title>"));
assert.ok(html.includes("2016 a 2026"));
assert.ok(html.includes("Relat&oacute;rio gerado em 11/11/2026 09:15"));
assert.ok(html.includes("atualizados em 11/11/2026 às 07:30"));
assert.ok(!html.includes("<img"), "sem logo, sem imagem quebrada");
assert.ok(!/undefined|NaN|\[object/.test(html));
assert.ok(!html.includes("<script"), "arquivo estático, sem script");

// 6. Nome de empresa não vira HTML.
const perigoso = montarResumoHtml({ linhas: [linha('OBRA <b>"X"</b> & CIA', false, 100, 40, 0, 0, 0, 0, 0)], marca: "A & B", data: "01/02/2026", geradoEm: "01/02/2026 08:00" });
assert.ok(perigoso.includes("OBRA &lt;b&gt;&quot;X&quot;&lt;/b&gt; &amp; CIA"));
assert.ok(!perigoso.includes("<b>\"X\"</b>"));
assert.ok(!perigoso.includes(">Finalizadas<"), "sem finalizada, sem divisor");
assert.ok(perigoso.includes("60,0%"));

// 7. Sem recebimento não há margem; lista vazia não quebra.
const semReceita = montarResumoHtml({ linhas: [linha("OBRA NOVA", false, 0, 500, 0, 0, 0, 0, 0)], marca: "X", data: "01/02/2026", geradoEm: "01/02/2026 08:00" });
assert.ok(!semReceita.includes("margem -"));
assert.ok(semReceita.includes("-R$ 500,00"));
assert.equal(totaisDoResumo([]).margem, null);
assert.ok(montarResumoHtml({ linhas: [], marca: "X", data: "01/02/2026", geradoEm: "01/02/2026 08:00" }).includes("Resumo Financeiro"));

// 8. Período e nome do arquivo.
assert.equal(rotuloPeriodo([]), "todo o histórico");
assert.equal(rotuloPeriodo(["2026"]), "2026");
assert.equal(rotuloPeriodo(["2026", "2024", "2025"]), "2024 a 2026");
assert.equal(rotuloPeriodo(["2022", "2026"]), "2022, 2026");
assert.equal(rotuloPeriodo(["2026"], ["01", "02", "03"]), "2026 · só jan, fev, mar");
assert.equal(rotuloPeriodo(["2026"], ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]), "2026");
assert.equal(nomeArquivoResumo("Silva Packer", "11/11/2026"), "Resumo-Financeiro-Silva-Packer-2026-11-11.html");
assert.equal(nomeArquivoResumo("Construção & Cia.", "05/01/2027"), "Resumo-Financeiro-Construcao-Cia-2027-01-05.html");

const saida = process.env.RESUMO_HTML_SAIDA;
if (saida) {
  const arquivoLogo = join(process.cwd(), "public", "logo-full.jpg");
  const logo = existsSync(arquivoLogo) ? `data:image/jpeg;base64,${readFileSync(arquivoLogo).toString("base64")}` : undefined;
  writeFileSync(saida, montarResumoHtml({
    linhas, marca: "Silva Packer", data: "11/11/2026", geradoEm: "11/11/2026 09:15",
    atualizadoEm: "11/11/2026 às 07:30", periodo: "2016 a 2026", logo,
  }), "utf8");
  console.log(`relatório de exemplo gravado em ${saida}`);
}
console.log("resumo-html: ok");
