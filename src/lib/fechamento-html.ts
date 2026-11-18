// Fechamento de Caixa em HTML para baixar ou imprimir (Edielson, 18/11/2026: a caixa
// "tem que imprimir" o fechamento que o Carlos Humberto pede). Arquivo único, sem script,
// com o logo embutido, no padrão visual do fechamento das 07:30 (`gen_fechamento.py`, no
// repositório rotinas-silvapacker) e do Resumo (`resumo-html.ts`).
//
// Os números são os da tela: a aba entrega as linhas e os lançamentos já filtrados e este
// arquivo só monta. Nenhuma regra de cálculo aqui (elas ficam em fechamento-caixa.ts).
import { formatCurrency } from "./dashboard-utils";
import { agruparLinhas, contarLancamentos, diaADia, totalizar, type GrupoFechamento, type Lancamento, type LinhaConta, type PagoEmDinheiro } from "./fechamento-caixa";
import { abrevDoDia, dataBr, feriado, rotuloDaJanela, somarDias } from "./dias-uteis";

export interface DadosFechamentoHtml {
  de: string;
  ate: string;
  /** Linhas e lançamentos como estão na tela (com os filtros de empresa e banco aplicados). */
  linhas: LinhaConta[];
  lancamentos: Lancamento[];
  pagoEmDinheiro: PagoEmDinheiro;
  avisos?: string[];
  marca: string;
  /** "18/11/2026 12:19": quando o arquivo foi gerado. */
  geradoEm: string;
  /** "18/11/2026 às 12:14": quando o painel buscou saldos e movimentos no Sienge. */
  posicao?: string;
  /** "só Banco do Brasil" etc., quando a tela está filtrada. */
  filtro?: string;
  /** Data URI do logo. */
  logo?: string;
}

/** Quantos lançamentos entram na lista do arquivo (o restante fica só no painel). */
export const MAX_LANCAMENTOS_HTML = 300;

const reais = (v: number) => formatCurrency(Number.isFinite(v) ? v : 0).replace(/[  ]/g, " ");
const comSinal = (v: number) => (v > 0 ? `+${reais(v)}` : reais(v));
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Fechamento-de-Caixa-Silva-Packer-2026-11-17.html" (ou "…-2026-11-09-a-2026-11-15.html"). */
export function nomeArquivoFechamento(marca: string, de: string, ate: string): string {
  const slug = marca.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Fechamento-de-Caixa-${slug || "Painel"}-${de === ate ? ate : `${de}-a-${ate}`}.html`;
}

const CSS = `
:root{--nav:#0f2740;--nav2:#1b3a5c;--ink:#1f2937;--muted:#4b5563;--line:#e5e7eb;--green:#0f7b4f;--greenbg:#e7f5ee;--red:#b3261e;--redbg:#fdeceb;--card:#fff;--bg:#f4f6f9}
*{box-sizing:border-box}
html,body{max-width:100%;overflow-x:hidden}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;-webkit-text-size-adjust:100%}
img{max-width:100%;height:auto}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px 48px}
header{background:linear-gradient(135deg,var(--nav),var(--nav2));color:#fff;padding:28px 0;margin-bottom:22px}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;opacity:.8;margin:0}h1{margin:6px 0 2px;font-size:26px;font-weight:700;overflow-wrap:anywhere}.sub{opacity:.85;font-size:13px}
.hd{display:flex;align-items:center;gap:18px}.logo{background:#fff;border-radius:12px;padding:7px 10px;flex:0 0 auto;box-shadow:0 4px 12px rgba(0,0,0,.18)}.logo img{height:54px;width:auto;display:block}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:-46px 0 18px}
.kpi{background:linear-gradient(160deg,#173654,#0f2740);border:1px solid #24507a;border-radius:12px;padding:14px 15px;color:#fff;box-shadow:0 10px 22px rgba(0,0,0,.28);min-width:0}
.kpi .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#a9c0d6;margin-bottom:6px}.kpi .val{font-size:clamp(14px,1.55vw,19px);font-weight:700;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums}.kpi .val.g{color:#4ade80}.kpi .val.r{color:#fb7185}.kpi .qt{font-size:11px;color:#93aac2;margin-top:3px}
.notas{margin:0 0 20px;padding:0;list-style:none;font-size:12.5px;color:var(--muted)}.notas li{padding:3px 0}.notas b{color:var(--ink)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:20px;box-shadow:0 4px 14px rgba(15,39,64,.04)}
h2{margin:0 0 4px;font-size:17px}h2 .pill{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;margin-left:8px;vertical-align:middle;white-space:nowrap;background:#eef2f7;color:var(--nav)}
.hint{color:var(--muted);font-size:12px;margin:0 0 14px}
.pos{color:var(--green)}.neg{color:var(--red)}.m{color:var(--muted)}
.tabela{overflow-x:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tbl th,.tbl td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tbl th:first-child,.tbl td:first-child{text-align:left;padding-left:2px;white-space:normal}
.tbl thead th{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;vertical-align:bottom}
.tbl tr.grp td{font-weight:700;background:#f8fafc}
.tbl tr.cta td{font-size:12px;color:var(--muted)}.tbl tr.cta td:first-child{padding-left:16px}.tbl tr.cta td.fim{color:var(--ink);font-weight:600}
.tbl tr.tot-row td{font-weight:700;border-top:2px solid var(--nav);border-bottom:none;background:#f8fafc}
.tbl td.esq,.tbl th.esq{text-align:left;white-space:normal}
.tbl tr.fds td{color:var(--muted)}
.cta-num{font-family:Consolas,'Courier New',monospace;font-size:11px}
.selo{display:inline-block;font-size:10.5px;font-weight:600;padding:0 7px;border-radius:999px;background:#eef2f7;color:var(--nav);margin-left:6px;white-space:nowrap}
details summary{cursor:pointer;font-weight:700;font-size:17px;list-style-position:inside}
details summary .pill{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;margin-left:8px;background:#eef2f7;color:var(--nav)}
details[open] summary{margin-bottom:12px}
footer{color:var(--muted);font-size:11px;text-align:center;margin-top:26px;line-height:1.6}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.kpi .val{font-size:clamp(14px,3.8vw,20px)}.kpi.fim{grid-column:1 / -1}}
@media(max-width:640px){section{padding:16px 12px}table.tbl{font-size:11.5px}.tbl th,.tbl td{padding:7px 4px}}
@media(max-width:600px){.hd{gap:12px}.logo img{height:40px}h1{font-size:20px}}
@media(max-width:560px){.wrap{padding:0 10px 40px}.kpis{gap:10px;margin:-40px 0 16px}.kpi{padding:12px 13px}h2{font-size:15px}}
@media print{body{background:#fff}section,.kpi{box-shadow:none}section{break-inside:avoid-page}header,.kpi,.tbl tr.grp td,.tbl tr.tot-row td,.selo,h2 .pill{-webkit-print-color-adjust:exact;print-color-adjust:exact}details:not([open]){display:none}}
`;

const valor = (v: number, classe: string, sinal = false) => (v === 0 ? '<span class="m">-</span>' : `<span class="${classe}">${sinal ? comSinal(v) : reais(v)}</span>`);
const saldo = (v: number | null) => (v === null ? '<span class="m">sem saldo</span>' : `<span${v < 0 ? ' class="neg"' : ""}>${reais(v)}</span>`);

function tabelaDeGrupos(grupos: GrupoFechamento[], por: "empresa" | "banco", total: ReturnType<typeof totalizar>): string {
  const p: string[] = [];
  p.push('<div class="tabela"><table class="tbl"><thead><tr>'
    + `<th>${por === "empresa" ? "Empresa" : "Banco"}</th><th>Saldo anterior</th><th>Entradas</th><th>Sa&iacute;das</th><th>Transfer&ecirc;ncias</th><th>Saldo final</th>`
    + "</tr></thead><tbody>");
  for (const g of grupos) {
    p.push('<tr class="grp">'
      + `<td>${esc(g.nome)}</td>`
      + `<td>${reais(g.total.saldoAnterior)}</td>`
      + `<td>${valor(g.total.entradas, "pos")}</td>`
      + `<td>${valor(g.total.saidas, "neg")}</td>`
      + `<td>${valor(g.total.transferencias, "", true)}</td>`
      + `<td>${saldo(g.total.saldoFinal)}</td>`
      + "</tr>");
    for (const l of g.linhas) {
      p.push('<tr class="cta">'
        + `<td>${esc(por === "empresa" ? l.instituicao : l.empresa)} <span class="cta-num">${esc(l.conta)}</span>`
        + (l.detalhe ? `<span class="selo">${esc(l.detalhe)}</span>` : "")
        + (l.estimado ? '<span class="selo">estimado</span>' : "")
        + "</td>"
        + `<td>${saldo(l.saldoAnterior)}</td>`
        + `<td>${valor(l.entradas, "pos")}</td>`
        + `<td>${valor(l.saidas, "neg")}</td>`
        + `<td>${valor(l.transferencias, "", true)}</td>`
        + `<td class="fim">${saldo(l.saldoFinal)}</td>`
        + "</tr>");
    }
  }
  p.push('<tr class="tot-row">'
    + "<td>Total</td>"
    + `<td>${reais(total.saldoAnterior)}</td>`
    + `<td>${valor(total.entradas, "pos")}</td>`
    + `<td>${valor(total.saidas, "neg")}</td>`
    + `<td>${valor(total.transferencias, "", true)}</td>`
    + `<td>${reais(total.saldoFinal)}</td>`
    + "</tr></tbody></table></div>");
  return p.join("");
}

export function montarFechamentoHtml(dados: DadosFechamentoHtml): string {
  const { de, ate, linhas, lancamentos } = dados;
  const umDia = de === ate;
  const t = totalizar(linhas);
  const variacao = t.saldoFinal - t.saldoAnterior;
  const vespera = somarDias(de, -1);
  const periodo = umDia ? dataBr(ate) : rotuloDaJanela({ de, ate });
  const marca = esc(dados.marca);
  const nEntradas = contarLancamentos(lancamentos, "entrada");
  const nSaidas = contarLancamentos(lancamentos, "saida");
  const nTransf = contarLancamentos(lancamentos, "transferencia");
  const contaPorId = new Map(linhas.map((l) => [l.id, l]));

  const titulo = `Fechamento de Caixa ${periodo} | ${dados.marca}`;
  const descricao = `Saldo anterior ${reais(t.saldoAnterior)} · Entradas ${reais(t.entradas)} · Saídas ${reais(t.saidas)} · Saldo final ${reais(t.saldoFinal)}`;

  const p: string[] = [];
  p.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">');
  p.push(`<title>${esc(titulo)}</title>`);
  p.push(`<meta property="og:type" content="website"><meta property="og:site_name" content="${marca}">`);
  p.push(`<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">`);
  p.push(`<style>${CSS}</style></head><body>`);

  p.push('<header><div class="wrap hd">'
    + (dados.logo ? `<div class="logo"><img src="${esc(dados.logo)}" alt="${marca}"></div>` : "")
    + `<div><p class="eyebrow">${marca} &middot; Fechamento de Caixa</p>`
    + `<h1>Fechamento de Caixa &mdash; ${esc(periodo)}</h1>`
    + `<div class="sub">Quanto havia nas contas banc&aacute;rias, o que entrou, o que saiu e com quanto fechou${dados.filtro ? ` &middot; ${esc(dados.filtro)}` : ""}</div>`
    + "</div></div></header>");

  p.push('<div class="wrap">');
  p.push('<div class="kpis">'
    + `<div class="kpi"><div class="lbl">Saldo anterior</div><div class="val">${reais(t.saldoAnterior)}</div><div class="qt">fim de ${abrevDoDia(vespera)}, ${dataBr(vespera)}</div></div>`
    + `<div class="kpi"><div class="lbl">Entradas</div><div class="val g">${reais(t.entradas)}</div><div class="qt">${plural(nEntradas, "recebimento", "recebimentos")}</div></div>`
    + `<div class="kpi"><div class="lbl">Sa&iacute;das</div><div class="val r">${reais(t.saidas)}</div><div class="qt">${plural(nSaidas, "pagamento", "pagamentos")}</div></div>`
    + `<div class="kpi"><div class="lbl">Transfer&ecirc;ncias</div><div class="val">${t.transferencias === 0 ? reais(0) : comSinal(t.transferencias)}</div><div class="qt">${nTransf === 0 ? "nenhuma no per&iacute;odo" : "l&iacute;quido entre contas"}</div></div>`
    + `<div class="kpi fim"><div class="lbl">Saldo final</div><div class="val">${reais(t.saldoFinal)}</div><div class="qt">${variacao === 0 ? "sem varia&ccedil;&atilde;o" : `${comSinal(variacao)} ${umDia ? "no dia" : "no per&iacute;odo"}`}</div></div>`
    + "</div>");

  const notas: string[] = [];
  if (dados.pagoEmDinheiro.total !== 0) {
    notas.push(`Pago em dinheiro pelo caixa interno: <b>${reais(dados.pagoEmDinheiro.total)}</b> (${plural(dados.pagoEmDinheiro.qtd, "pagamento", "pagamentos")}). N&atilde;o passa pelos bancos, por isso n&atilde;o est&aacute; nas Sa&iacute;das.`);
  }
  if (Math.abs(t.diferenca) > 0.005) {
    notas.push(`Saldo no Sienge: <b>${reais(t.saldoSienge)}</b>. ${reais(Math.abs(t.diferenca))} em lan&ccedil;amentos recentes ainda n&atilde;o entraram nele.`);
  }
  for (const a of dados.avisos ?? []) notas.push(esc(a));
  if (notas.length > 0) p.push(`<ul class="notas">${notas.map((n) => `<li>${n}</li>`).join("")}</ul>`);

  p.push(`<section><h2>Por empresa <span class="pill">${plural(linhas.length, "conta", "contas")}</span></h2>`
    + '<p class="hint">Saldo anterior + entradas &minus; sa&iacute;das &plusmn; transfer&ecirc;ncias = saldo final, em cada linha.</p>'
    + tabelaDeGrupos(agruparLinhas(linhas, "empresa"), "empresa", t)
    + "</section>");

  p.push("<section><h2>Por banco</h2>"
    + '<p class="hint">As mesmas contas, agrupadas pela institui&ccedil;&atilde;o.</p>'
    + tabelaDeGrupos(agruparLinhas(linhas, "banco"), "banco", t)
    + "</section>");

  if (!umDia) {
    const dias = diaADia(linhas, lancamentos, de, ate);
    p.push("<section><h2>Dia a dia</h2>"
      + '<p class="hint">Movimento de cada dia e o saldo das contas no fim dele.</p>'
      + '<div class="tabela"><table class="tbl"><thead><tr><th>Dia</th><th>Lan&ccedil;amentos</th><th>Entradas</th><th>Sa&iacute;das</th><th>Transfer&ecirc;ncias</th><th>Saldo no fim do dia</th></tr></thead><tbody>'
      + dias.map((d) => {
        const nome = feriado(d.data);
        return `<tr${d.qtd === 0 ? ' class="fds"' : ""}>`
          + `<td>${abrevDoDia(d.data)} ${dataBr(d.data)}${nome ? `<span class="selo">${esc(nome)}</span>` : ""}</td>`
          + `<td>${d.qtd === 0 ? '<span class="m">-</span>' : d.qtd}</td>`
          + `<td>${valor(d.entradas, "pos")}</td>`
          + `<td>${valor(d.saidas, "neg")}</td>`
          + `<td>${valor(d.transferencias, "", true)}</td>`
          + `<td>${reais(d.saldoFinal)}</td>`
          + "</tr>";
      }).join("")
      + '<tr class="tot-row">'
      + `<td>Total do per&iacute;odo</td><td>${t.qtd}</td><td>${valor(t.entradas, "pos")}</td><td>${valor(t.saidas, "neg")}</td><td>${valor(t.transferencias, "", true)}</td><td>${reais(t.saldoFinal)}</td>`
      + "</tr></tbody></table></div></section>");
  }

  if (lancamentos.length > 0) {
    const mostrados = lancamentos.slice(0, MAX_LANCAMENTOS_HTML);
    p.push(`<section><details${lancamentos.length <= 60 ? " open" : ""}><summary>Lan&ccedil;amentos <span class="pill">${lancamentos.length}</span></summary>`
      + '<div class="tabela"><table class="tbl"><thead><tr>'
      + `${umDia ? "" : '<th class="esq">Data</th>'}<th class="esq">Quem</th><th class="esq">Documento</th><th class="esq">Conta</th><th>Valor</th>`
      + "</tr></thead><tbody>"
      + mostrados.map((l) => {
        const c = contaPorId.get(l.contaId);
        return "<tr>"
          + (umDia ? "" : `<td>${dataBr(l.data)}</td>`)
          + `<td class="esq">${esc(l.quem || "-")}${l.abate ? `<span class="selo">${esc(l.historico || "abate")}</span>` : ""}</td>`
          + `<td class="esq m">${esc(l.documento || "-")}</td>`
          + `<td class="esq m">${c ? `${esc(c.empresa)} &middot; ${esc(c.instituicao)} <span class="cta-num">${esc(c.conta)}</span>` : esc(l.contaId)}</td>`
          + `<td class="${l.efeito >= 0 ? "pos" : "neg"}">${comSinal(l.efeito)}</td>`
          + "</tr>";
      }).join("")
      + "</tbody></table></div>"
      + (lancamentos.length > MAX_LANCAMENTOS_HTML ? `<p class="hint" style="margin:12px 0 0">Mostrando os ${MAX_LANCAMENTOS_HTML} primeiros de ${lancamentos.length}. Os demais est&atilde;o na aba Fechamento de Caixa do painel.</p>` : "")
      + "</details></section>");
  }

  p.push("<footer>"
    + `Relat&oacute;rio gerado em ${esc(dados.geradoEm)}${dados.posicao ? ` &middot; saldos e movimentos buscados no Sienge em ${esc(dados.posicao)}` : ""} &middot; Fonte: Sienge (via Painel Financeiro).<br>`
    + "Contas da rela&ccedil;&atilde;o banc&aacute;ria (17). Entradas e sa&iacute;das s&atilde;o o que passou pelo banco, j&aacute; sem reten&ccedil;&atilde;o de imposto e desconto. Transfer&ecirc;ncias entre as contas se anulam no total."
    + "</footer></div></body></html>");
  return p.join("\n");
}
