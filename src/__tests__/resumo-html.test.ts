// Trava do Resumo Financeiro em HTML: npx tsx src/__tests__/resumo-html.test.ts
// Números = abas Resumo e Orçamento do Painel Executivo em produção, 16/11/2026 às 16:27
// (Silva Packer, 10 empresas, 2016 a 2026), as telas que o Edielson mandou ao pedir a
// coluna "Ainda a Sair" (até 16/11 a trava usava a tela de 11/11/2026, com a Res. Téc.).
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
  valorEstoque: number, aindaASair: number, qtDispApto: number, qtDispSala: number, estoqueSemPreco = false,
): LinhaResumoHtml => ({ empresa, finalizada, totalRecebido, totalPago, totalAReceber, valorEstoque, estoqueSemPreco, aindaASair, qtDispApto, qtDispSala });

// Ainda a Sair = coluna "A Realizar" da aba Orçamento; finalizada não tem.
const linhas: LinhaResumoHtml[] = [
  linha("EDIFICIO 135 JARDINS", false, 96907390.94, 99031477.52, 29735670.61, 13000000, 7441112.38, 3, 0),
  linha("PALACIO ELIZABETH", false, 66621424.24, 39273195.25, 48066360.14, 33000000, 71061336.32, 11, 0),
  linha("ROZZA", false, 27364836.76, 15871450.60, 17289779.59, 38150000, 41005558.26, 11, 6),
  linha("DOMUS", false, 22295949.08, 11483293.94, 40557697.47, 62500000, 65447431.46, 16, 6),
  linha("SERENITY", false, 16705801.95, 19552903.19, 15082659.15, 26500000, 28002397.35, 7, 1),
  linha("TETRA", false, 4295000, 6569283.17, 0, 73000000, 50369864.83, 14, 0),
  linha("TESLA RESIDENCIAL", true, 55592659.27, 48881848.79, 2307436.33, 6450000, 0, 0, 3),
  linha("SOLAR DI CAPRI", true, 31899964.67, 31517406.99, 2454396.13, 2800000, 0, 1, 0),
  linha("SOLAR DI SIENA", true, 27783607.89, 21602819.59, 542141.04, 0, 0, 6, 4, true),
  linha("RESIDENCIAL HANNOVER", true, 26128948.57, 27072185.38, 3056924.48, 3000000, 0, 0, 2),
];

const centavos = (a: number, b: number, o: string) => assert.ok(Math.abs(a - b) < 0.005, `${o}: ${a} ≠ ${b}`);

// 1. Totais = linha "Total" e cartões da tela.
const t = totaisDoResumo(linhas);
centavos(t.recebido, 375595583.37, "Total Recebido");
centavos(t.pago, 320855864.42, "Total Pago");
centavos(t.lucro, 54739718.95, "Lucro Realizado");
centavos(t.aReceber, 159093064.94, "Total a Receber");
centavos(t.estoque, 258400000, "Valor Estoque");
centavos(t.aEntrar, 417493064.94, "Ainda a Entrar");
centavos(t.aSair, 263327700.60, "Ainda a Sair = cartão Saldo a Realizar do Orçamento");
centavos(t.lucroARealizar, 154165364.34, "Lucro a Realizar");
assert.equal(porcento(t.margem!, 2), "14,57%");
assert.deepEqual([t.dispApto, t.dispSala], [69, 22]);

// 2. Formato igual ao da tela.
assert.equal(reais(96907390.94), "R$ 96.907.390,94");
assert.equal(reais(-2124086.58), "-R$ 2.124.086,58");
assert.equal(porcento(-2.1919), "-2,2%");
assert.equal(porcento(41.05), "41,1%");

const html = montarResumoHtml({
  linhas, marca: "Silva Packer", data: "16/11/2026", geradoEm: "16/11/2026 16:40",
  atualizadoEm: "16/11/2026 às 16:27", periodo: rotuloPeriodo(["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]),
});

// 3. Os números da tela estão no arquivo (cartões, tabela e cartões de celular).
const vezes = (trecho: string) => html.split(trecho).length - 1;
for (const v of ["R$ 375.595.583,37", "R$ 320.855.864,42", "R$ 54.739.718,95", "R$ 417.493.064,94", "R$ 263.327.700,60", "R$ 154.165.364,34"]) {
  assert.ok(vezes(v) >= 3, `${v} no cartão do topo, na tabela e no cartão do total`);
}
assert.equal(vezes('<div class="kpi">'), 6, "seis cartões no topo: três do já realizado, três do ainda a realizar");
for (const v of ["R$ 159.093.064,94", "R$ 258.400.000,00", "14,57%"]) assert.ok(vezes(v) >= 2, v);
// Uma linha de cada jeito: lucro negativo, margem, a entrar, a sair, lucro a realizar.
for (const v of [
  "-R$ 2.124.086,58", "-2,2%", "R$ 42.735.670,61", "R$ 7.441.112,38", "R$ 35.294.558,23",
  "R$ 27.348.228,99", "41,1%", "R$ 71.061.336,32", "R$ 10.005.023,82",
  "R$ 103.057.697,47", "R$ 37.610.266,01", "-53,0%", "R$ 50.369.864,83", "R$ 22.630.135,17", "R$ 382.557,68", "1,2%",
]) {
  assert.ok(vezes(v) >= 2, `${v} na tabela e no cartão`);
}
// Tetra: o a entrar é só o estoque (estoque e a entrar, na tabela e no cartão).
assert.ok(vezes("R$ 73.000.000,00") >= 4);
// Finalizada não tem Ainda a Sair: o lucro a realizar é o que ainda entra (Tesla).
assert.ok(vezes("R$ 8.757.436,33") >= 4);
// Siena: unidades à venda sem preço — diz "sem preço"; a receber = a entrar = lucro a realizar.
assert.equal(vezes("sem preço</span>"), 2);
assert.ok(vezes("R$ 542.141,04") >= 6);
// Tetra não tem nada a receber e finalizada não tem a sair: traço, não "R$ 0,00".
assert.equal(vezes("R$ 0,00"), 0);
// Disponibilidade por extenso no cartão.
assert.ok(html.includes("11 apartamentos · 6 salas"));
assert.ok(html.includes("7 apartamentos · 1 sala<"));
assert.ok(html.includes("69 apartamentos · 22 salas"));
// A reserva técnica saiu do Resumo (Edielson, 16/11/2026).
assert.ok(!/Res\. ?T[ée]c|Reserva t[ée]cnica/i.test(html), "sem reserva técnica");
// Tabela com 12 colunas: empreendimento + 4 + 5 + 2.
assert.ok(html.includes('<th colspan="5" class="ini"><span>Ainda a realizar</span></th><th colspan="2" class="ini"><span>Disponibilidade</span></th>'));
assert.ok(html.includes("<th>Ainda a Sair</th><th>Lucro a Realizar</th>"));
assert.ok(html.includes('<td colspan="12">Finalizadas</td>'));
const primeiraLinha = html.slice(html.indexOf("<tbody>"), html.indexOf("</tr>", html.indexOf("<tbody>")));
assert.equal(primeiraLinha.split("<td").length - 1, 12, "12 células por linha");
// Cor (Edielson, 16/11/2026): Ainda a Entrar em azul, Ainda a Sair no vermelho suave do
// cartão Total Pago — na tabela, na linha de total, nos cartões de celular e nos do topo.
assert.ok(primeiraLinha.includes('<td class="b az">R$ 42.735.670,61</td><td class="b sa">R$ 7.441.112,38</td>'), "linha colorida");
assert.ok(html.includes('<td class="az">R$ 417.493.064,94</td>') && html.includes('<td class="sa">R$ 263.327.700,60</td>'), "total colorido");
assert.ok(html.includes('<span class="az">R$ 42.735.670,61</span>') && html.includes('<span class="sa">R$ 7.441.112,38</span>'), "cartão de celular colorido");
assert.ok(html.includes('<div class="val b">R$ 417.493.064,94</div>') && html.includes('<div class="val r">R$ 263.327.700,60</div>'), "cartões do topo coloridos");
assert.ok(html.includes(".az{color:var(--blue)}.sa{color:var(--rose)}") && html.includes("--rose:#c03f55"));
// Finalizada sem Ainda a Sair: traço na coluna, e não um valor.
assert.ok(html.includes('<td class="b sa">-</td>'));

// 4. Finalizadas depois das em andamento, embaixo de um divisor (um na tabela, um nos cartões).
assert.equal(vezes(">Finalizadas<"), 2);
assert.ok(html.indexOf("TETRA") < html.indexOf(">Finalizadas<"));
assert.ok(html.indexOf(">Finalizadas<") < html.indexOf("TESLA RESIDENCIAL"));
assert.ok(html.includes("6 em andamento · 4 finalizados"));

// 5. Cabeçalho, período e rodapé.
assert.ok(html.includes("<title>Resumo Financeiro 16/11/2026 | Silva Packer</title>"));
assert.ok(html.includes("2016 a 2026"));
assert.ok(html.includes("Relat&oacute;rio gerado em 16/11/2026 16:40"));
assert.ok(html.includes("atualizados em 16/11/2026 às 16:27"));
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

// 9. Obra em que falta sair mais do que entrar: lucro a realizar negativo, em vermelho,
//    na tabela, no cartão do empreendimento, no cartão do total e no cartão do topo.
const noVermelho = montarResumoHtml({ linhas: [linha("OBRA CARA", false, 1000, 400, 300, 200, 800, 2, 0)], marca: "X", data: "01/02/2026", geradoEm: "01/02/2026 08:00" });
assert.ok(noVermelho.includes('<td class="b neg">-R$ 300,00</td>'));
assert.ok(noVermelho.includes('<span class="neg">-R$ 300,00</span>'));
assert.ok(noVermelho.includes('<div class="val r">-R$ 300,00</div>'));
centavos(totaisDoResumo([linha("OBRA CARA", false, 1000, 400, 300, 200, 800, 2, 0)]).lucroARealizar, -300, "negativo");

const saida = process.env.RESUMO_HTML_SAIDA;
if (saida) {
  const arquivoLogo = join(process.cwd(), "public", "logo-full.jpg");
  const logo = existsSync(arquivoLogo) ? `data:image/jpeg;base64,${readFileSync(arquivoLogo).toString("base64")}` : undefined;
  writeFileSync(saida, montarResumoHtml({
    linhas, marca: "Silva Packer", data: "16/11/2026", geradoEm: "16/11/2026 16:40",
    atualizadoEm: "16/11/2026 às 16:27", periodo: "2016 a 2026", logo,
  }), "utf8");
  console.log(`relatório de exemplo gravado em ${saida}`);
}
console.log("resumo-html: ok");
