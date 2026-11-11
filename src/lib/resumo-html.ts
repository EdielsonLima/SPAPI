// Resumo Financeiro em HTML, no mesmo padrão do Fechamento de Caixa que o João Paulo já
// recebe (Edielson, 11/11/2026: "um HTML bonito no mesmo padrão daquele que a gente já
// manda para o João Paulo do fechamento de caixa, para ele ter esse resumo também").
//
// Função pura: recebe as linhas JÁ CALCULADAS pela aba Resumo do Painel Executivo (as
// mesmas da tela, na mesma ordem) e devolve um arquivo HTML único, sem script e sem
// dependência externa (o logo vai embutido). Nenhuma regra de cálculo mora aqui: só as
// contas de exibição que a tela também faz (lucro = recebido − pago, margem, a entrar,
// totais = soma das linhas). Trava: npx tsx src/__tests__/resumo-html.test.ts
//
// O visual (cabeçalho azul com logo, 4 cartões escuros, seções brancas) é o do
// gen_fechamento.py do repositório rotinas-silvapacker. Diferença de propósito: o Resumo
// tem 10 números por empreendimento, que não cabem em tabela no celular. Em tela larga
// sai a tabela da tela (três blocos); abaixo de 1240 px, um cartão por empreendimento.

import { formatCurrency } from "./dashboard-utils";

export interface LinhaResumoHtml {
  empresa: string;
  /** Empreendimento com status Finalizada (vai para baixo do divisor). */
  finalizada: boolean;
  totalRecebido: number;
  totalPago: number;
  totalAReceber: number;
  valorEstoque: number;
  /** Tem unidade à venda e nenhuma com preço no painel: mostra "sem preço". */
  estoqueSemPreco: boolean;
  qtDispApto: number;
  qtDispSala: number;
  qtResTec: number;
}

export interface DadosResumoHtml {
  /** Linhas na ordem da tela (em andamento primeiro, finalizadas no fim). */
  linhas: LinhaResumoHtml[];
  /** Nome que vai no cabeçalho ("Silva Packer"). */
  marca: string;
  /** Data do relatório, DD/MM/AAAA. */
  data: string;
  /** Quando o arquivo foi gerado, "DD/MM/AAAA HH:MM". */
  geradoEm: string;
  /** Última atualização dos dados do Sienge no painel, "DD/MM/AAAA às HH:MM". */
  atualizadoEm?: string;
  /** Período do Total Recebido / Total Pago, como "2016 a 2026". */
  periodo?: string;
  /** Logo embutido (data URI) ou URL; sem ele o cabeçalho sai só com o texto. */
  logo?: string;
  /** Modo Holding: o Total a Receber é a carteira inteira de aluguel. */
  holding?: boolean;
  /** Endereço público, quando o relatório for publicado (prévia do link no WhatsApp). */
  link?: string;
}

export interface TotaisResumoHtml {
  recebido: number;
  pago: number;
  lucro: number;
  /** Lucro ÷ Recebido × 100; null sem recebimento. */
  margem: number | null;
  aReceber: number;
  estoque: number;
  aEntrar: number;
  dispApto: number;
  dispSala: number;
  resTec: number;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "R$ 1.234,56" igual ao da tela, com espaço comum (o Intl devolve espaço duro). */
export function reais(v: number): string {
  return formatCurrency(Number.isFinite(v) ? v : 0).replace(/[  ]/g, " ");
}

/** "14,62%", "-2,0%": o mesmo formato da coluna Margem. */
export function porcento(v: number, casas = 1): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function margemDe(recebido: number, pago: number): number | null {
  return recebido > 0 ? ((recebido - pago) / recebido) * 100 : null;
}

/** Totais = soma das linhas, como a linha "Total" da tela. */
export function totaisDoResumo(linhas: LinhaResumoHtml[]): TotaisResumoHtml {
  const soma = (f: (l: LinhaResumoHtml) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const recebido = soma(l => l.totalRecebido);
  const pago = soma(l => l.totalPago);
  const aReceber = soma(l => l.totalAReceber);
  const estoque = soma(l => l.valorEstoque);
  return {
    recebido, pago, lucro: recebido - pago, margem: margemDe(recebido, pago),
    aReceber, estoque, aEntrar: aReceber + estoque,
    dispApto: soma(l => l.qtDispApto), dispSala: soma(l => l.qtDispSala), resTec: soma(l => l.qtResTec),
  };
}

/**
 * Período do Total Recebido / Total Pago, a partir do filtro de anos e meses da tela.
 * Nenhum ano marcado = sem filtro (a tela mostra tudo).
 */
export function rotuloPeriodo(anos: Iterable<string>, meses: Iterable<string> = []): string {
  const a = [...anos].map(Number).filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  const m = [...meses].map(Number).filter(n => n >= 1 && n <= 12).sort((x, y) => x - y);
  let texto: string;
  if (a.length === 0) texto = "todo o histórico";
  else if (a.length === 1) texto = String(a[0]);
  else if (a[a.length - 1] - a[0] === a.length - 1) texto = `${a[0]} a ${a[a.length - 1]}`;
  else texto = a.join(", ");
  if (m.length > 0 && m.length < 12) texto += ` · só ${m.map(n => MESES_CURTOS[n - 1]).join(", ")}`;
  return texto;
}

/** Nome do arquivo baixado: "Resumo-Financeiro-Silva-Packer-2026-11-11.html". */
export function nomeArquivoResumo(marca: string, data: string): string {
  const [d, m, a] = data.split("/");
  const slug = marca.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Resumo-Financeiro-${slug || "Painel"}-${a}-${m}-${d}.html`;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const sinal = (v: number) => (v < 0 ? "neg" : "pos");

function disponiveis(apto: number, sala: number): string {
  const partes: string[] = [];
  if (apto > 0) partes.push(plural(apto, "apartamento", "apartamentos"));
  if (sala > 0) partes.push(plural(sala, "sala", "salas"));
  return partes.length > 0 ? partes.join(" · ") : "-";
}

const CSS = `
:root{--nav:#0f2740;--nav2:#1b3a5c;--ink:#1f2937;--muted:#4b5563;--line:#e5e7eb;--green:#0f7b4f;--greenbg:#e7f5ee;--red:#b3261e;--redbg:#fdeceb;--amber:#92400e;--card:#fff;--bg:#f4f6f9}
*{box-sizing:border-box}
html,body{max-width:100%;overflow-x:hidden}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;-webkit-text-size-adjust:100%}
img{max-width:100%;height:auto}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px 48px}
header{background:linear-gradient(135deg,var(--nav),var(--nav2));color:#fff;padding:28px 0;margin-bottom:22px}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;opacity:.8;margin:0}h1{margin:6px 0 2px;font-size:26px;font-weight:700;overflow-wrap:anywhere}.sub{opacity:.85;font-size:13px}
.hd{display:flex;align-items:center;gap:18px}.logo{background:#fff;border-radius:12px;padding:7px 10px;flex:0 0 auto;box-shadow:0 4px 12px rgba(0,0,0,.18)}.logo img{height:54px;width:auto;display:block}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:-46px 0 26px}
.kpi{background:linear-gradient(160deg,#173654,#0f2740);border:1px solid #24507a;border-radius:12px;padding:16px 18px;color:#fff;box-shadow:0 10px 22px rgba(0,0,0,.28);min-width:0}
.kpi .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#a9c0d6;margin-bottom:6px}.kpi .val{font-size:clamp(17px,1.75vw,21px);font-weight:700;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums}.kpi .val.g{color:#4ade80}.kpi .val.r{color:#fb7185}.kpi .qt{font-size:11px;color:#93aac2;margin-top:3px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:20px;box-shadow:0 4px 14px rgba(15,39,64,.04)}
h2{margin:0 0 4px;font-size:17px}h2 .pill{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;margin-left:8px;vertical-align:middle;white-space:nowrap}.pill.g{background:var(--greenbg);color:var(--green)}.pill.r{background:var(--redbg);color:var(--red)}.pill.n{background:#eef2f7;color:var(--nav)}
.hint{color:var(--muted);font-size:12px;margin:0 0 14px}
.pos{color:var(--green)}.neg{color:var(--red)}.sp{color:var(--amber);font-weight:600}
.tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;white-space:nowrap}.tag.pos{background:var(--greenbg)}.tag.neg{background:var(--redbg)}
.tabela{overflow-x:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th,.tbl td{padding:9px 5px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tbl th:first-child,.tbl td:first-child{text-align:left;padding-left:2px}
.tbl thead th{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;vertical-align:bottom}
.tbl thead tr.grp th{text-align:center;border-bottom:none;padding:0 5px 4px;letter-spacing:.12em;color:var(--nav)}
.tbl thead tr.grp th span{display:block;border-bottom:2px solid #cbd5e1;padding-bottom:5px}
.tbl .ini{border-left:1px solid var(--line)}
.tbl td.c,.tbl th.c{text-align:center}
.tbl td.emp{font-weight:600}.tbl td.b{font-weight:700}.tbl td.m{color:var(--muted)}
.tbl tbody tr:hover td{background:#fafbfc}
.tbl tr.div td{background:#f8fafc;font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600;padding:6px 2px}
.tbl tr.fin td.emp{font-weight:500;color:var(--muted)}
.tbl tr.tot-row td{font-weight:700;border-top:2px solid var(--nav);border-bottom:none;background:#f8fafc;font-size:12.5px}
.cartoes{display:none}
.grade{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.divisor{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600;margin:20px 0 10px}
.emp-card{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;break-inside:avoid}
.emp-head{display:flex;justify-content:space-between;align-items:center;background:#f2f5f9;padding:10px 12px;font-weight:700;font-size:13px;gap:10px}
.emp-body{padding:2px 12px 10px}
.blk{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600;margin:10px 0 2px}
.lin{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:5px 0;font-size:13px;border-bottom:1px solid #f0f2f5}
.lin span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.lin.b{font-weight:700;border-bottom:none}
.emp-card.total{border-color:var(--nav)}.emp-card.total .emp-head{background:var(--nav);color:#fff}
.ler{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin:10px 0 0;padding:0;list-style:none;font-size:12.5px;color:var(--muted)}
.ler b{color:var(--ink)}
footer{color:var(--muted);font-size:11px;text-align:center;margin-top:26px;line-height:1.6}
@media(max-width:1239px){.tabela{display:none}.cartoes{display:block}}
@media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr)}.kpi .val{font-size:clamp(13px,3.6vw,20px)}.ler{grid-template-columns:1fr}}
@media(max-width:760px){.grade{grid-template-columns:1fr}}
@media(max-width:640px){section{padding:16px 14px}}
@media(max-width:600px){.hd{gap:12px}.logo img{height:40px}h1{font-size:20px}}
@media(max-width:560px){.wrap{padding:0 10px 40px}.kpis{gap:10px;margin:-40px 0 22px}.kpi{padding:12px 13px}h2{font-size:15px}h2 .pill{display:inline-block;margin:4px 0 0}}
@media print{body{background:#fff}section,.kpi{box-shadow:none}header,.kpi,.emp-head,.tag,.pill{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function linhaTabela(l: LinhaResumoHtml): string {
  const lucro = l.totalRecebido - l.totalPago;
  const margem = margemDe(l.totalRecebido, l.totalPago);
  const aEntrar = l.totalAReceber + l.valorEstoque;
  const estoque = l.valorEstoque > 0 ? reais(l.valorEstoque) : l.estoqueSemPreco ? '<span class="sp">sem preço</span>' : "-";
  return `<tr${l.finalizada ? ' class="fin"' : ""}>`
    + `<td class="emp">${esc(l.empresa)}</td>`
    + `<td class="ini">${reais(l.totalRecebido)}</td>`
    + `<td>${reais(l.totalPago)}</td>`
    + `<td class="b ${sinal(lucro)}">${reais(lucro)}</td>`
    + `<td>${margem === null ? "-" : `<span class="tag ${sinal(margem)}">${porcento(margem)}</span>`}</td>`
    + `<td class="ini m">${l.totalAReceber > 0 ? reais(l.totalAReceber) : "-"}</td>`
    + `<td class="m">${estoque}</td>`
    + `<td class="b">${aEntrar > 0 ? reais(aEntrar) : "-"}</td>`
    + `<td class="ini c">${l.qtDispApto > 0 ? l.qtDispApto : "-"}</td>`
    + `<td class="c">${l.qtDispSala > 0 ? l.qtDispSala : "-"}</td>`
    + `<td class="c m">${l.qtResTec > 0 ? l.qtResTec : "-"}</td>`
    + "</tr>";
}

function cartao(l: LinhaResumoHtml): string {
  const lucro = l.totalRecebido - l.totalPago;
  const margem = margemDe(l.totalRecebido, l.totalPago);
  const aEntrar = l.totalAReceber + l.valorEstoque;
  const estoque = l.valorEstoque > 0 ? reais(l.valorEstoque) : l.estoqueSemPreco ? '<span class="sp">sem preço</span>' : "-";
  return '<div class="emp-card">'
    + `<div class="emp-head"><span>${esc(l.empresa)}</span>${margem === null ? "" : `<span class="tag ${sinal(margem)}">margem ${porcento(margem)}</span>`}</div>`
    + '<div class="emp-body">'
    + '<div class="blk">Já realizado</div>'
    + `<div class="lin"><span>Total recebido</span><span>${reais(l.totalRecebido)}</span></div>`
    + `<div class="lin"><span>Total pago</span><span>${reais(l.totalPago)}</span></div>`
    + `<div class="lin b"><span>Lucro realizado</span><span class="${sinal(lucro)}">${reais(lucro)}</span></div>`
    + '<div class="blk">Ainda a entrar</div>'
    + `<div class="lin"><span>Total a receber</span><span>${l.totalAReceber > 0 ? reais(l.totalAReceber) : "-"}</span></div>`
    + `<div class="lin"><span>Valor do estoque</span><span>${estoque}</span></div>`
    + `<div class="lin b"><span>Ainda a entrar</span><span>${aEntrar > 0 ? reais(aEntrar) : "-"}</span></div>`
    + '<div class="blk">Disponibilidade</div>'
    + `<div class="lin"><span>À venda</span><span>${disponiveis(l.qtDispApto, l.qtDispSala)}</span></div>`
    + (l.qtResTec > 0 ? `<div class="lin"><span>Reserva técnica</span><span>${plural(l.qtResTec, "unidade", "unidades")}</span></div>` : "")
    + "</div></div>";
}

export function montarResumoHtml(dados: DadosResumoHtml): string {
  const { linhas } = dados;
  const t = totaisDoResumo(linhas);
  const ativas = linhas.filter(l => !l.finalizada);
  const finalizadas = linhas.filter(l => l.finalizada);
  const marca = esc(dados.marca);
  const periodo = dados.periodo ? esc(dados.periodo) : "";
  const margemTotal = t.margem === null ? "-" : porcento(t.margem, 2);

  const titulo = `Resumo Financeiro ${dados.data} | ${dados.marca}`;
  const descricao = `Recebido ${reais(t.recebido)} · Pago ${reais(t.pago)} · Lucro realizado ${reais(t.lucro)} · Ainda a entrar ${reais(t.aEntrar)}`;

  const contagem = [
    ativas.length > 0 ? `${ativas.length} em andamento` : "",
    finalizadas.length > 0 ? plural(finalizadas.length, "finalizado", "finalizados") : "",
  ].filter(Boolean).join(" · ");

  const p: string[] = [];
  p.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">');
  p.push(`<title>${esc(titulo)}</title>`);
  p.push(`<meta property="og:type" content="website"><meta property="og:site_name" content="${marca}">`);
  p.push(`<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">`);
  if (dados.link) p.push(`<meta property="og:url" content="${esc(dados.link)}">`);
  p.push(`<style>${CSS}</style></head><body>`);

  p.push('<header><div class="wrap hd">'
    + (dados.logo ? `<div class="logo"><img src="${esc(dados.logo)}" alt="${marca}"></div>` : "")
    + `<div><p class="eyebrow">${marca} &middot; Resumo Financeiro</p>`
    + `<h1>Resumo Financeiro &mdash; ${esc(dados.data)}</h1>`
    + '<div class="sub">O que cada empreendimento já recebeu e pagou, o que ainda tem a entrar e o que está à venda</div>'
    + "</div></div></header>");

  p.push('<div class="wrap">');
  p.push('<div class="kpis">'
    + `<div class="kpi"><div class="lbl">Total Recebido</div><div class="val g">${reais(t.recebido)}</div><div class="qt">${periodo ? `acumulado &middot; ${periodo}` : "acumulado"}</div></div>`
    + `<div class="kpi"><div class="lbl">Total Pago</div><div class="val r">${reais(t.pago)}</div><div class="qt">${periodo ? `acumulado &middot; ${periodo}` : "acumulado"}</div></div>`
    + `<div class="kpi"><div class="lbl">Lucro Realizado</div><div class="val ${t.lucro >= 0 ? "g" : "r"}">${reais(t.lucro)}</div><div class="qt">recebido &minus; pago${t.margem === null ? "" : ` &middot; margem ${margemTotal}`}</div></div>`
    + `<div class="kpi"><div class="lbl">Ainda a Entrar</div><div class="val">${reais(t.aEntrar)}</div><div class="qt">a receber + estoque &agrave; venda</div></div>`
    + "</div>");

  // Tela larga: a tabela da aba Resumo, com os três blocos de colunas.
  const corpoTabela = ativas.map(linhaTabela).join("")
    + (finalizadas.length > 0 ? `<tr class="div"><td colspan="11">Finalizadas</td></tr>${finalizadas.map(linhaTabela).join("")}` : "")
    + '<tr class="tot-row"><td>Total</td>'
    + `<td class="ini">${reais(t.recebido)}</td><td>${reais(t.pago)}</td><td class="${sinal(t.lucro)}">${reais(t.lucro)}</td>`
    + `<td>${t.margem === null ? "-" : `<span class="tag ${sinal(t.margem)}">${margemTotal}</span>`}</td>`
    + `<td class="ini">${reais(t.aReceber)}</td><td>${reais(t.estoque)}</td><td>${reais(t.aEntrar)}</td>`
    + `<td class="ini c">${t.dispApto}</td><td class="c">${t.dispSala}</td><td class="c">${t.resTec}</td></tr>`;
  const tabela = '<div class="tabela"><table class="tbl"><thead>'
    + '<tr class="grp"><th></th><th colspan="4" class="ini"><span>Já realizado</span></th><th colspan="3" class="ini"><span>Ainda a entrar</span></th><th colspan="3" class="ini"><span>Disponibilidade</span></th></tr>'
    + "<tr><th>Empreendimento</th>"
    + '<th class="ini">Total Recebido</th><th>Total Pago</th><th>Lucro Realizado</th><th>Margem</th>'
    + '<th class="ini">Total a Receber</th><th>Valor Estoque</th><th>Ainda a Entrar</th>'
    + '<th class="ini c">Disp. Ap.</th><th class="c">Disp. Sala</th><th class="c">Res. Téc.</th></tr>'
    + `</thead><tbody>${corpoTabela}</tbody></table></div>`;

  // Tela estreita (celular, tablet, impressão em retrato): um cartão por empreendimento.
  const cartaoTotal = '<div class="emp-card total">'
    + `<div class="emp-head"><span>TOTAL GERAL</span>${t.margem === null ? "" : `<span class="tag ${sinal(t.margem)}">margem ${margemTotal}</span>`}</div>`
    + '<div class="emp-body">'
    + '<div class="blk">Já realizado</div>'
    + `<div class="lin"><span>Total recebido</span><span>${reais(t.recebido)}</span></div>`
    + `<div class="lin"><span>Total pago</span><span>${reais(t.pago)}</span></div>`
    + `<div class="lin b"><span>Lucro realizado</span><span class="${sinal(t.lucro)}">${reais(t.lucro)}</span></div>`
    + '<div class="blk">Ainda a entrar</div>'
    + `<div class="lin"><span>Total a receber</span><span>${reais(t.aReceber)}</span></div>`
    + `<div class="lin"><span>Valor do estoque</span><span>${reais(t.estoque)}</span></div>`
    + `<div class="lin b"><span>Ainda a entrar</span><span>${reais(t.aEntrar)}</span></div>`
    + '<div class="blk">Disponibilidade</div>'
    + `<div class="lin"><span>À venda</span><span>${disponiveis(t.dispApto, t.dispSala)}</span></div>`
    + (t.resTec > 0 ? `<div class="lin"><span>Reserva técnica</span><span>${plural(t.resTec, "unidade", "unidades")}</span></div>` : "")
    + "</div></div>";
  const cartoes = '<div class="cartoes">'
    + (ativas.length > 0 ? `<div class="grade">${ativas.map(cartao).join("")}</div>` : "")
    + (finalizadas.length > 0 ? `<div class="divisor">Finalizadas</div><div class="grade">${finalizadas.map(cartao).join("")}</div>` : "")
    + `<div class="divisor">Todos os empreendimentos</div>${cartaoTotal}`
    + "</div>";

  p.push("<section>"
    + `<h2>Resumo por empreendimento${contagem ? ` <span class="pill n">${contagem}</span>` : ""}</h2>`
    + `<p class="hint">Total Recebido e Total Pago pelo valor l&iacute;quido e pela data da baixa${periodo ? ` (${periodo})` : ""}. Total a Receber e estoque na posi&ccedil;&atilde;o de hoje.</p>`
    + tabela + cartoes
    + "</section>");

  const aReceberTexto = dados.holding
    ? "saldo em aberto das parcelas a receber (carteira inteira)."
    : "parcelas que vencem de hoje em diante, sem permuta e sem aluguel. Parcela vencida não entra aqui: fica em Inadimplência.";
  p.push("<section><h2>Como ler</h2><ul class=\"ler\">"
    + "<li><b>Lucro Realizado</b> = Total Recebido &minus; Total Pago. É o que sobrou (ou faltou) do dinheiro que já entrou e saiu.</li>"
    + "<li><b>Margem</b> = Lucro Realizado &divide; Total Recebido. Em obra em andamento fica negativa enquanto se gasta mais do que se recebe.</li>"
    + `<li><b>Total a Receber</b>: ${aReceberTexto}</li>`
    + "<li><b>Valor Estoque</b>: preço de tabela das unidades disponíveis para venda. Unidade sem preço cadastrado não soma.</li>"
    + "<li><b>Ainda a Entrar</b> = Total a Receber + Valor Estoque. Não desconta o que falta gastar para terminar a obra.</li>"
    + "<li><b>Disponibilidade</b>: apartamentos e salas comerciais à venda. Reserva técnica não soma no estoque.</li>"
    + "</ul></section>");

  p.push(`<footer>Relat&oacute;rio gerado em ${esc(dados.geradoEm)} &middot; Fonte: Sienge (via Painel Financeiro).`
    + (dados.atualizadoEm ? `<br>Dados do Sienge atualizados em ${esc(dados.atualizadoEm)}.` : "")
    + "</footer>");
  p.push("</div></body></html>");
  return p.join("\n");
}
