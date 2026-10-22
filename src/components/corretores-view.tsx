"use client";

// Comercial › Corretores — ranking de corretores e imobiliárias. Tela trazida
// do Financeiro da Leven (desenho aprovado lá em 26/09/2026) em 22/10/2026.
// Fonte: comissões do Sienge
// (/commissions), cruzadas com os contratos pela regra rankingParceiros.
// Contrato sem comissão lançada conta como venda direta.

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate, MONTH_LABELS } from "@/lib/dashboard-utils";
import { rankingParceiros, type Parceiro, type SiengeComissao } from "@/lib/comercial-utils";
import type { SiengeSalesContract } from "@/types/sienge";
import { AlertTriangle, Building2, User } from "lucide-react";

type Filtro = "todos" | "imobiliaria" | "corretor" | "casa";
// Ouro, prata, bronze, iguais nos dois temas.
const MEDALHA = [
  "bg-amber-300 text-amber-950 dark:bg-amber-300 dark:text-amber-950",
  "bg-slate-300 text-slate-900 dark:bg-slate-300 dark:text-slate-900",
  "bg-orange-300 text-orange-950 dark:bg-orange-300 dark:text-orange-950",
];
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
const rotuloTipo = (t: Parceiro["tipo"]) => (t === "casa" ? "Da casa" : t === "corretor" ? "Corretor" : "Imobiliária");
const corAvatar = (t: Parceiro["tipo"]) => (t === "casa" ? "bg-emerald-700" : t === "corretor" ? "bg-[#4f7096]" : "bg-primary");
const iniciais = (nome: string) => nome.replace(/\b(LTDA|EIRELI|ME|S\/?A|DE|DA|DO|DOS|DAS|E)\b/gi, " ").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const mesRotulo = (m: string) => { const [a, mm] = m.split("-"); return `${MONTH_LABELS[Number(mm) - 1] || mm}/${a.slice(2)}`; };

// Cartão de indicador: rótulo, número e uma linha de apoio, com um filete de cor.
function Indicador({ rotulo, valor, apoio, barra }: { rotulo: string; valor: React.ReactNode; apoio: string; barra: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/60">
      <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r ${barra}`} />
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{rotulo}</div>
      <div className="mt-2 text-[24px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900 dark:text-white">{valor}</div>
      <div className="mt-1.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{apoio}</div>
    </div>
  );
}

export function CorretoresView({ contratos, comissoes }: { contratos: SiengeSalesContract[]; comissoes: SiengeComissao[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [escolhido, setEscolhido] = useState<number | null>(null);

  const r = useMemo(() => rankingParceiros(comissoes, contratos), [comissoes, contratos]);
  const lista = r.parceiros.filter(p => filtro === "todos" || p.tipo === filtro);
  const sel = lista.find(p => p.id === escolhido) ?? lista[0] ?? null;
  const max = Math.max(1, ...lista.map(p => p.valor));
  const totalVendido = r.valorComParceiros + r.valorCasa + r.valorDireto;
  const pct = (v: number) => (totalVendido ? ((v / totalVendido) * 100).toFixed(1).replace(".", ",") : "0");
  const imobs = r.parceiros.filter(p => p.tipo === "imobiliaria").length;
  const corretores = r.parceiros.filter(p => p.tipo === "corretor").length;
  const daCasa = r.parceiros.filter(p => p.tipo === "casa");
  // Com mais de 12 meses de histórico as barras mensais ficam ilegíveis: soma por ano.
  const porAno = r.porMes.length > 12;
  const serie = porAno
    ? Array.from(r.porMes.reduce((acc, m) => {
        const a = m.mes.slice(0, 4); const e = acc.get(a) ?? { valor: 0, qtd: 0 };
        e.valor += m.valor; e.qtd += m.qtd; return acc.set(a, e);
      }, new Map<string, { valor: number; qtd: number }>()).entries()).map(([mes, e]) => ({ mes, ...e }))
    : r.porMes;
  const maxMes = Math.max(1, ...serie.map(m => m.valor));

  const Tipo = ({ t }: { t: Parceiro["tipo"] }) => (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${t === "casa" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : t === "corretor" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-primary/10 text-primary"}`}>{rotuloTipo(t)}</span>
  );

  return (
    <div className="space-y-5">
      {/* Filtro por tipo */}
      <div role="group" aria-label="Tipo de parceiro" className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-900">
        {([["todos", "Todos"], ["imobiliaria", "Imobiliárias"], ["corretor", "Corretores"], ["casa", "Da casa"]] as const).map(([id, rotulo]) => (
          <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
            className={`h-8 rounded-md px-3 text-xs font-bold transition-colors ${filtro === id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {/* Indicadores */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Indicador rotulo="Vendido com parceiros" valor={formatCurrency(r.valorComParceiros)} apoio={`${plural(r.contratosComParceiros, "contrato")} · ${pct(r.valorComParceiros)}% do valor vendido`} barra="bg-sky-500" />
        <Indicador rotulo="Vendido pela equipe da casa" valor={formatCurrency(r.valorCasa)} apoio={`${plural(r.contratosCasa, "contrato")} · ${pct(r.valorCasa)}%${daCasa.length ? ` · ${daCasa.map(p => p.nome.split(" ")[0]).join(", ")}` : ""}`} barra="bg-emerald-600" />
        <Indicador rotulo="Comissões" valor={formatCurrency(r.comissoes)} apoio={r.parceiros.length === 0 ? "nenhuma lançada" : r.comissoesPagas ? "todas pagas" : "há parcelas em aberto"} barra="bg-amber-500" />
        <Indicador rotulo="Parceiros externos" valor={imobs + corretores} apoio={`${plural(imobs, "imobiliária")} · ${plural(corretores, "corretor autônomo", "corretores autônomos")}`} barra="bg-indigo-500" />
        <Indicador rotulo="Venda direta / sem corretor" valor={formatCurrency(r.valorDireto)} apoio={`${plural(r.contratosDiretos, "contrato")} sem comissão lançada`} barra="bg-slate-400" />
      </div>

      {lista.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent className="p-10 text-center text-sm text-muted-foreground">Nenhum parceiro com venda no período e filtros atuais.</CardContent></Card>
      ) : (
        <>
          {/* Pódio */}
          <section aria-labelledby="podio" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="podio" className="text-base font-bold text-slate-900 dark:text-white">Quem mais vendeu</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">por valor vendido · clique para ver os clientes</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {lista.slice(0, 3).map((p, i) => {
                const ativo = sel?.id === p.id;
                return (
                  <button key={p.id} type="button" aria-pressed={ativo} onClick={() => setEscolhido(p.id)}
                    className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${ativo ? "border-primary/60 ring-2 ring-primary/20 dark:border-primary" : "border-slate-200 dark:border-slate-800"} ${i === 0 ? "bg-amber-50/40 dark:bg-amber-400/[0.05]" : "bg-white dark:bg-slate-900/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex h-6 min-w-[38px] items-center justify-center rounded-full px-2 text-xs font-bold ${MEDALHA[i]}`}>{i + 1}º</span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{rotuloTipo(p.tipo)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${corAvatar(p.tipo)}`}>{iniciais(p.nome)}</span>
                      <span className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-50">{p.nome}</span>
                    </div>
                    <div className="mt-4 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(p.valor)}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plural(p.contratos, "contrato")} · {plural(p.clientes, "cliente")} · comissão {formatCurrency(p.comissao)}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* Ranking completo */}
            <section aria-labelledby="ranking" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="ranking" className="text-base font-bold text-slate-900 dark:text-white">Ranking completo</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">{plural(lista.length, "parceiro")} · {plural(lista.reduce((n, p) => n + p.contratos, 0), "contrato")}</span>
              </div>
              <div className="mt-3 grid grid-cols-[28px_minmax(0,1fr)_56px_128px_104px] gap-3 border-b border-slate-100 px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800">
                <span>#</span><span>Parceiro</span><span className="text-right">Contr.</span><span className="text-right">Vendido</span><span className="text-right">Comissão</span>
              </div>
              <div className="mt-2 space-y-1">
                {lista.map((p, i) => {
                  const ativo = sel?.id === p.id;
                  return (
                    <button key={p.id} type="button" aria-pressed={ativo} onClick={() => setEscolhido(p.id)}
                      className={`grid w-full grid-cols-[28px_minmax(0,1fr)_56px_128px_104px] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${ativo ? "border-primary/30 bg-primary/5 dark:border-primary/50 dark:bg-primary/10" : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                      <span className="text-sm font-bold text-slate-400">{i + 1}</span>
                      <span className="min-w-0 space-y-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100" title={p.nome}>{p.nome}</span>
                          <Tipo t={p.tipo} />
                        </span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <span className={`block h-full rounded-full ${i === 0 ? "bg-[#1c3354] dark:bg-[#8eabcf]" : "bg-[#3b6290]"}`} style={{ width: `${Math.round((p.valor / max) * 100)}%` }} />
                        </span>
                      </span>
                      <span className="text-right text-[13px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{p.contratos}</span>
                      <span className="text-right text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(p.valor)}</span>
                      <span className="text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(p.comissao)}</span>
                    </button>
                  );
                })}
              </div>
              {filtro === "todos" && r.contratosDiretos > 0 && (
                <div className="mt-2 grid grid-cols-[28px_minmax(0,1fr)_56px_128px_104px] items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 dark:border-slate-700">
                  <span className="text-sm text-slate-400">—</span>
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">Venda direta / sem corretor lançado</span>
                  <span className="text-right text-[13px] tabular-nums text-slate-500">{r.contratosDiretos}</span>
                  <span className="text-right text-[13px] tabular-nums text-slate-500">{formatCurrency(r.valorDireto)}</span>
                  <span className="text-right text-xs text-slate-400">—</span>
                </div>
              )}

              {/* Vendido com parceiros por mês */}
              {r.porMes.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Vendido com parceiros por {porAno ? "ano" : "mês"}</div>
                  <div className="mt-3 flex h-40 items-end gap-3">
                    {serie.map(m => (
                      <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                        <span className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(m.valor)}</span>
                        <div className={`w-full rounded-t-md ${m.valor === maxMes ? "bg-[#1c3354] dark:bg-[#8eabcf]" : "bg-[#3b6290]"}`} style={{ height: `${Math.max(6, (m.valor / maxMes) * 100)}px` }} />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{porAno ? m.mes : mesRotulo(m.mes)} · {plural(m.qtd, "contrato")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Parceiro escolhido */}
            {sel && (
              <section aria-labelledby="parceiro" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                <div className="h-1 bg-primary" />
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 pb-4 pt-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {sel.tipo === "imobiliaria" ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    {sel.tipo === "casa" ? "Corretor da casa" : sel.tipo === "corretor" ? "Corretor autônomo" : "Imobiliária parceira"}
                  </div>
                  <h2 id="parceiro" className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-white">{sel.nome}</h2>
                  <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
                    <div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Vendido</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{formatCurrency(sel.valor)}</dd></div>
                    <div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Comissão</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{formatCurrency(sel.comissao)}</dd></div>
                    <div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Contratos</dt><dd className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{sel.contratos}</dd></div>
                    <div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Ticket médio</dt><dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(sel.ticket)}</dd></div>
                  </dl>
                  {totalVendido > 0 && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{pct(sel.valor)}% do valor vendido no período</p>
                  )}
                </div>
                <div className="px-5 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Clientes deste parceiro · {sel.clientes}</div>
                  <ul className="mt-3 space-y-2">
                    {sel.vendas.map(v => (
                      <li key={v.contratoId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100" title={v.cliente}>{v.cliente}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{v.unidades.join(" + ") || "—"} · contrato {v.contrato}{v.data ? ` · ${formatDate(v.data)}` : ""}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(v.valor)}</div>
                          <div className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">comissão {formatCurrency(v.comissao)} · {v.comissaoPaga ? "paga" : "em aberto"}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {r.contratosDiretos > 0 && (
        <div role="note" className="flex gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-400/[0.07]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">{r.contratosDiretos} dos {r.contratosDiretos + r.contratosComParceiros + r.contratosCasa} contratos não têm corretor nem comissão lançados no Sienge</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">O ranking lê as comissões cadastradas no Sienge. Um contrato vendido por parceiro que ainda não tem a comissão lançada aparece como venda direta até o cadastro ser feito.</p>
          </div>
        </div>
      )}
    </div>
  );
}
