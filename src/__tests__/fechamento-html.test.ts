// npx tsx src/__tests__/fechamento-html.test.ts
// Trava do Fechamento de Caixa em HTML (src/lib/fechamento-html.ts): o arquivo repete os
// números que recebe da tela e não traz script. Para ver o arquivo:
//   FECHAMENTO_HTML_SAIDA=arquivo.html npx tsx src/__tests__/fechamento-html.test.ts
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { BANK_NAMES, DIMBAN_ACCOUNT_COMPANY } from "../lib/dimBanco";
import { fecharCaixa, montarConta, type MovimentoCaixa } from "../lib/fechamento-caixa";
import { montarFechamentoHtml, nomeArquivoFechamento } from "../lib/fechamento-html";

const EMPRESAS: Record<number, string> = {
  1: "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA", 3: "SUL BRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA", 4: "EDIFICIO 135 JARDINS",
  5: "SOLAR DI CAPRI", 6: "PALACIO ELIZABETH", 7: "RESIDENCIAL HANNOVER", 8: "SOLAR DI SIENA", 9: "TESLA RESIDENCIAL", 10: "SERENITY", 11: "ROZZA",
};
const contas = Object.entries(DIMBAN_ACCOUNT_COMPANY).map(([conta, empresa]) => montarConta(conta, empresa, EMPRESAS[empresa], BANK_NAMES[conta]));
let id = 0;
const mov = (conta: string, empresa: number, data: string, tipo: "E" | "S", valor: number, origem: string, extra: Partial<MovimentoCaixa> = {}): MovimentoCaixa => ({
  bankMovementId: ++id, bankMovementDate: data, bankMovementAmount: valor, bankMovementOperationType: tipo, bankMovementOriginId: origem, accountNumber: conta, companyId: empresa, ...extra,
});
const TRANSF = { bankMovementOperationName: "Transferência entre empresas", documentIdentificationName: "TRANSFERÊNCIA ENTRE CONTAS", bankMovementHistoricName: "Transferência" };
const saldos16 = {
  "1:0257918-9": -140161.65, "1:275226-3": 1067511.92, "1:00483730-8": 4433492.58, "1:00910779-3": 4536262.19,
  "3:0241711-1": -325801.45, "3:A0241711-1": 1861181.53, "3:5370-8": 455497.95, "3:5791519180": 25439.4, "3:A5026-3": 1908080.48,
  "4:490-1": 818990.17, "5:274-7": 34873.64, "6:479-0": 2850545.11, "7:487-1": 83781.76, "8:277-1": 15838.35,
  "9:276-3": 40722.43, "10:924-5": 63959.24, "11:1241-6": 624925.39,
};
const movimentos: MovimentoCaixa[] = [
  mov("275226-3", 1, "2026-11-17", "E", 25000, "CR", { clientName: "CLIENTE <A> & FILHOS", documentIdentificationName: "CONTRATO", documentIdentificationNumber: "PER.201" }),
  mov("275226-3", 1, "2026-11-17", "S", 4500, "BC", { ...TRANSF, documentIdentificationNumber: "SP BB/SAH BB" }),
  mov("275226-3", 1, "2026-11-17", "S", 520, "CP", { creditorName: "LAVANDERIA", documentIdentificationName: "NFS-e", documentIdentificationNumber: "114" }),
  mov("275226-3", 1, "2026-11-17", "E", 57.2, "CP", { bankMovementHistoricName: "Retenção impostos" }),
  mov("490-1", 4, "2026-11-17", "E", 595000, "CR", { clientName: "CLIENTE B" }),
  mov("490-1", 4, "2026-11-18", "S", 1000, "CP", { creditorName: "FORNECEDOR C" }),
  mov("CAIXA", 1, "2026-11-17", "S", 15170, "CP", {}),
];

// ── 1. Um dia ────────────────────────────────────────────────────────────────────────────
const f = fecharCaixa({ contas, movimentos, saldos: { "2026-11-16": saldos16 }, de: "2026-11-17", ate: "2026-11-17", geradoEm: "2026-11-18T15:14:00.000Z" });
const html = montarFechamentoHtml({
  de: f.de, ate: f.ate, linhas: f.linhas, lancamentos: f.lancamentos, pagoEmDinheiro: f.pagoEmDinheiro, avisos: f.avisos,
  marca: "Silva Packer", geradoEm: "18/11/2026 12:19", posicao: "18/11/2026 às 12:14", logo: "data:image/jpeg;base64,AAAA",
});
{
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(!/<script/i.test(html), "arquivo sem script");
  assert.ok(!/undefined|NaN|\[object/.test(html), "nada quebrado no texto");
  assert.ok(html.includes("Fechamento de Caixa &mdash; 17/11/2026"));
  assert.ok(html.includes('src="data:image/jpeg;base64,AAAA"'), "logo embutido");
  // Cartões: os números do fechamento (anterior 18.355.139,04; +620.000; -462,80; -4.500).
  for (const texto of ["R$ 18.355.139,04", "R$ 620.000,00", "R$ 462,80", "-R$ 4.500,00", "R$ 18.970.176,24", "+R$ 615.037,20 no dia", "fim de seg, 16/11/2026", "2 recebimentos", "1 pagamento"]) {
    assert.ok(html.includes(texto), `falta "${texto}"`);
  }
  assert.ok(html.includes("Pago em dinheiro pelo caixa interno: <b>R$ 15.170,00</b> (1 pagamento)"));
  // Duas tabelas (empresa e banco) com as 17 contas cada e o mesmo total.
  assert.equal((html.match(/<tr class="cta">/g) || []).length, 34);
  assert.equal((html.match(/<tr class="grp">/g) || []).length, 10 + 4);
  assert.equal((html.match(/<tr class="tot-row">/g) || []).length, 2);
  assert.ok(html.includes("Por empresa") && html.includes("Por banco") && !html.includes("Dia a dia"));
  // Lançamentos: nome com caracteres de HTML sai escapado; retenção vem marcada.
  assert.ok(html.includes("CLIENTE &lt;A&gt; &amp; FILHOS"));
  assert.ok(html.includes('<span class="selo">Retenção impostos</span>'));
  assert.ok(html.includes("SP BB/SAH BB"));
  assert.ok(html.includes("<details open>"), "poucos lançamentos: lista aberta");
  assert.ok(html.includes("Relat&oacute;rio gerado em 18/11/2026 12:19 &middot; saldos e movimentos buscados no Sienge em 18/11/2026 às 12:14"));
}

// ── 2. Período de vários dias e tela filtrada ────────────────────────────────────────────
{
  const p = fecharCaixa({ contas, movimentos, saldos: { "2026-11-16": saldos16 }, de: "2026-11-17", ate: "2026-11-18", geradoEm: "x" });
  const soBB = p.linhas.filter((l) => l.instituicao === "Banco do Brasil");
  const ids = new Set(soBB.map((l) => l.id));
  const h = montarFechamentoHtml({
    de: p.de, ate: p.ate, linhas: soBB, lancamentos: p.lancamentos.filter((l) => ids.has(l.contaId)), pagoEmDinheiro: p.pagoEmDinheiro,
    marca: "Silva Packer", geradoEm: "19/11/2026 08:00", filtro: "só Banco do Brasil",
  });
  assert.ok(h.includes("Fechamento de Caixa &mdash; ter 17/11 a qua 18/11/2026"));
  assert.ok(h.includes("&middot; só Banco do Brasil"));
  assert.ok(h.includes("Dia a dia") && h.includes("ter 17/11/2026") && h.includes("qua 18/11/2026"));
  assert.equal((h.match(/<tr class="cta">/g) || []).length, 20, "10 contas do Banco do Brasil nas duas tabelas");
  assert.ok(h.includes("<th class=\"esq\">Data</th>"), "com vários dias a lista mostra a data");
  assert.ok(!h.includes("<div class=\"logo\">"), "sem logo o cabeçalho sai só com o texto");
  assert.ok(!/undefined|NaN/.test(h));
}

// ── 3. Nome do arquivo ───────────────────────────────────────────────────────────────────
assert.equal(nomeArquivoFechamento("Silva Packer", "2026-11-17", "2026-11-17"), "Fechamento-de-Caixa-Silva-Packer-2026-11-17.html");
assert.equal(nomeArquivoFechamento("Silva Packer", "2026-11-09", "2026-11-15"), "Fechamento-de-Caixa-Silva-Packer-2026-11-09-a-2026-11-15.html");

if (process.env.FECHAMENTO_HTML_SAIDA) {
  writeFileSync(process.env.FECHAMENTO_HTML_SAIDA, html, "utf8");
  console.log("arquivo gravado em", process.env.FECHAMENTO_HTML_SAIDA);
}
console.log("fechamento-html: ok");
