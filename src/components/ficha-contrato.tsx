"use client";

// Ficha do contrato de uma unidade (Quadro Espelho e maquete 3D) — trazida do
// Financeiro da Leven (ModalContrato). Pedido do Edielson (23/10): clicar numa
// unidade vendida e ver o contrato inteiro: cliente, unidades, posição
// financeira, condições e as parcelas reais de cada condição.
//
// Parcelas = títulos de contas a receber com o billId que o próprio contrato
// aponta (receivableBillId). São lidas só quando a primeira ficha abre, na
// mesma janela de datas do Painel (ano-10 até ano+15), para cair no cache.
// Valores desligados no Quadro = nenhum R$ aqui também ("R$ ••••").

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SiengeIncome, SiengeSalesContract } from "@/types/sienge";
import { formatCurrency, formatDate } from "@/lib/dashboard-utils";
import { pavimentoDaUnidade, valorDaUnidadeNoContrato } from "@/lib/comercial-utils";
import { COR_SITUACAO } from "@/lib/situacao-unidade";
import { Building2, CalendarDays, FileText, Ruler, User, Users, Wallet, CircleDot, ChevronRight, Layers, Car, Home, Loader2 } from "lucide-react";

export interface UnidadeFicha {
  enterprise: string;
  unit: string;
  tipo: string;
  area: number;
  floor: string;
  situacao: string;
}

// Uma leitura por sessão da página: todas as fichas usam a mesma lista.
let parcelasPromessa: Promise<SiengeIncome[]> | null = null;
function lerParcelas(): Promise<SiengeIncome[]> {
  if (!parcelasPromessa) {
    const ano = new Date().getFullYear();
    parcelasPromessa = fetch(`/api/sienge/income?startDate=${ano - 10}-01-01&endDate=${ano + 15}-12-31`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(d => (d.data || []) as SiengeIncome[])
      .catch(() => { parcelasPromessa = null; return []; });
  }
  return parcelasPromessa;
}

const areaFmt = (a: number) => `${a.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

export function FichaContrato({ unidade, contrato, unidadesPorNome, mostrarValores, onClose }: {
  unidade: UnidadeFicha | null;
  contrato?: SiengeSalesContract;
  unidadesPorNome: Map<string, { tipo: string; area: number }>;
  mostrarValores: boolean;
  onClose: () => void;
}) {
  const moeda = (v: number) => (mostrarValores ? formatCurrency(v) : "R$ ••••");
  const u = unidade;
  const c = contrato;
  const [expandida, setExpandida] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState<SiengeIncome[] | null>(null);

  useEffect(() => {
    if (!u || !c?.receivableBillId || parcelas) return;
    let vivo = true;
    lerParcelas().then(p => { if (vivo) setParcelas(p); });
    return () => { vivo = false; };
  }, [u, c, parcelas]);

  // O Bulk repete a parcela para cada rateio: deduplica por billId+installmentId.
  const parcelasDoContrato = useMemo(() => {
    const billId = c?.receivableBillId;
    if (!billId || !parcelas) return [] as SiengeIncome[];
    const vistos = new Set<string>();
    return parcelas.filter(i => {
      if (i.billId !== billId) return false;
      const k = `${i.billId}-${i.installmentId}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, [c, parcelas]);

  // Condição ↔ parcelas. A parcela só traz o TIPO (paymentTerm.id = PM/PA/AT),
  // não a condição, e um contrato pode ter duas "Parcelas Mensais". Reparte em
  // sequência: condições do mesmo tipo pela ordem, cada uma tomando
  // `installmentsNumber` parcelas a partir do seu 1º vencimento.
  const parcelasPorCondicao = useMemo(() => {
    const mapa = new Map<string, SiengeIncome[]>();
    if (!c) return mapa;
    const porTipo = new Map<string, SiengeIncome[]>();
    parcelasDoContrato.forEach(i => {
      const t = i.paymentTerm?.id || "";
      if (!porTipo.has(t)) porTipo.set(t, []);
      porTipo.get(t)!.push(i);
    });
    porTipo.forEach(arr => arr.sort((x, y) => x.dueDate.localeCompare(y.dueDate) || (x.installmentId - y.installmentId)));
    const conds = [...(c.paymentConditions || [])].sort((x, y) => x.orderNumber - y.orderNumber);
    const usados = new Set<number>();
    conds.forEach(p => {
      const fila = (porTipo.get(p.conditionTypeId) || []).filter(i => !usados.has(i.installmentId));
      const inicio = Math.max(0, fila.findIndex(i => i.dueDate >= (p.firstPayment || "")));
      const minhas = fila.slice(inicio, inicio + p.installmentsNumber);
      minhas.forEach(i => usados.add(i.installmentId));
      mapa.set(`${p.sequenceId}-${p.orderNumber}`, minhas);
    });
    return mapa;
  }, [c, parcelasDoContrato]);

  const cor = COR_SITUACAO[u?.situacao || ""] || "#94a3b8";
  const pago = c ? (c.paymentConditions || []).reduce((s, p) => s + (p.amountPaid || 0), 0) : 0;
  const saldo = c ? (c.paymentConditions || []).reduce((s, p) => s + (p.outstandingBalance || 0), 0) : 0;
  const total = c ? (c.value || 0) : 0;
  const pctPago = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
  const clientes = c?.salesContractCustomers || [];
  const principal = clientes.find(x => x.main) ?? clientes[0];
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasadasTotal = parcelasDoContrato.filter(i => i.balanceAmount > 0 && i.dueDate < hoje);
  const pav = u ? pavimentoDaUnidade(u.floor, u.unit) : "";

  const Campo = ({ icone: Icone, rotulo, valor, mono }: { icone: React.ElementType; rotulo: string; valor: React.ReactNode; mono?: boolean }) => (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Icone className="h-4 w-4" /></span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{rotulo}</div>
        <div className={`truncate text-sm font-semibold text-slate-900 dark:text-slate-50 ${mono ? "tabular-nums" : ""}`}>{valor}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={Boolean(u)} onOpenChange={o => { if (!o) { setExpandida(null); onClose(); } }}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 dark:bg-slate-900">
        {u && (
          <>
            {/* Cabeçalho */}
            <div className="relative border-b border-slate-200 bg-slate-50 px-7 pb-6 pt-7 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: cor }} />
              <div className="flex flex-wrap items-end justify-between gap-4 pr-6">
                <div>
                  <DialogDescription className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{u.enterprise}</DialogDescription>
                  <DialogTitle className="mt-1 text-3xl font-black leading-none text-slate-900 dark:text-white">{u.unit}</DialogTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: cor }}>{u.situacao}</span>
                    {u.tipo && <span>{u.tipo}</span>}
                    {u.area > 0 && <span>· {areaFmt(u.area)}</span>}
                    {pav && <span>· {pav.replace(/\s*pavimento\s*/i, "")} andar</span>}
                  </div>
                </div>
                {total > 0 && (
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Valor do contrato</div>
                    <div className="text-2xl font-black leading-none tabular-nums text-slate-900 dark:text-white">{moeda(total)}</div>
                    {u.area > 0 && <div className="mt-1 text-xs tabular-nums text-slate-500">{moeda(total / u.area)} / m²</div>}
                  </div>
                )}
              </div>
            </div>

            {c ? (
              <div className="max-h-[70vh] overflow-y-auto px-7 py-6">
                {/* Cliente + contrato */}
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                  <Campo icone={User} rotulo="Cliente principal" valor={principal?.name ?? "—"} />
                  <Campo icone={FileText} rotulo="Contrato" valor={<>{c.number} <span className="ml-1 text-xs font-medium text-slate-500">· {c.situation}</span></>} mono />
                  <Campo icone={CalendarDays} rotulo="Data do contrato" valor={c.contractDate ? formatDate(c.contractDate) : "—"} mono />
                  <Campo icone={CalendarDays} rotulo="Emissão" valor={c.issueDate ? formatDate(c.issueDate) : "—"} mono />
                  <Campo icone={Building2} rotulo="Empresa" valor={c.companyName} />
                  <Campo icone={Ruler} rotulo="Entrega prevista" valor={c.expectedDeliveryDate ? formatDate(c.expectedDeliveryDate) : "—"} mono />
                </div>

                {clientes.length > 1 && (
                  <div className="mt-6">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"><Users className="h-3.5 w-3.5" /> Compradores</div>
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {clientes.map(cl => (
                        <li key={cl.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="font-medium text-slate-800 dark:text-slate-100">{cl.name}{cl.main && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">principal</span>}{cl.spouse && <span className="ml-1.5 text-[10px] text-slate-500">cônjuge</span>}</span>
                          <span className="tabular-nums text-slate-500">{cl.participationPercentage}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Unidades do contrato (apartamento + vagas): parte de cada uma. */}
                {(c.salesContractUnits || []).length > 1 && (
                  <div className="mt-6">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"><Layers className="h-3.5 w-3.5" /> Unidades deste contrato</div>
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {[...c.salesContractUnits].sort((a, b) => Number(b.main) - Number(a.main) || a.name.localeCompare(b.name, undefined, { numeric: true })).map(cu => {
                        const info = unidadesPorNome.get(cu.name);
                        const tipo = info?.tipo || "";
                        const Icone = /vaga|garagem|box/i.test(tipo || cu.name) ? Car : Home;
                        const atual = cu.name === u.unit;
                        return (
                          <li key={cu.id ?? cu.name} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${atual ? "bg-slate-50 dark:bg-slate-800/50" : ""}`}>
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Icone className="h-4 w-4" /></span>
                              <span className="min-w-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{cu.name}</span>
                                {atual && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-700 dark:text-slate-300">esta</span>}
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{[tipo || "—", info?.area ? areaFmt(info.area) : null].filter(Boolean).join(" · ")}</span>
                              </span>
                            </span>
                            <span className="shrink-0 text-right tabular-nums">
                              <span className="block font-semibold text-slate-800 dark:text-slate-100">{moeda(valorDaUnidadeNoContrato(c.value, c.salesContractUnits, cu.name))}</span>
                              <span className="block text-[11px] text-slate-500">{cu.participationPercentage}% do contrato</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Posição financeira */}
                <div className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"><Wallet className="h-3.5 w-3.5" /> Posição financeira</div>
                    <div className="text-xs tabular-nums text-slate-500">{pctPago.toFixed(1)}% recebido</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pctPago}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { l: "Recebido", v: moeda(pago), c: "text-emerald-700 dark:text-emerald-400" },
                      { l: "Saldo a receber", v: moeda(saldo), c: "text-slate-900 dark:text-white" },
                      { l: "Total", v: moeda(total), c: "text-slate-900 dark:text-white" },
                      { l: "Em atraso", v: !c.receivableBillId ? "—" : parcelas === null ? "…" : atrasadasTotal.length === 0 ? "Nenhuma" : `${atrasadasTotal.length} · ${moeda(atrasadasTotal.reduce((s, i) => s + (i.correctedBalanceAmount || i.balanceAmount), 0))}`, c: atrasadasTotal.length ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-white" },
                    ].map(k => (
                      <div key={k.l}><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{k.l}</div><div className={`mt-0.5 text-base font-bold tabular-nums ${k.c}`}>{k.v}</div></div>
                    ))}
                  </div>
                </div>

                {/* Condições de pagamento — cada linha abre as parcelas reais. */}
                {(c.paymentConditions || []).length > 0 && (
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Condições de pagamento</span>
                      {c.receivableBillId && parcelas === null && <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />carregando parcelas…</span>}
                      {parcelasDoContrato.length > 0 && <span className="text-[10px] text-slate-500">clique numa condição para ver as parcelas</span>}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full min-w-[640px] table-fixed text-[13px]">
                        <colgroup>
                          <col className="w-[22%]" /><col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[15%]" />
                        </colgroup>
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-950/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Condição</th>
                            <th className="px-2 py-2 text-right font-semibold">Parc.</th>
                            <th className="px-2 py-2 text-left font-semibold">Índice</th>
                            <th className="px-2 py-2 text-right font-semibold">1º venc.</th>
                            <th className="px-2 py-2 text-right font-semibold">Valor</th>
                            <th className="px-2 py-2 text-right font-semibold">Pago</th>
                            <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {[...c.paymentConditions].sort((a, b) => a.orderNumber - b.orderNumber).map(p => {
                            const chave = `${p.sequenceId}-${p.orderNumber}`;
                            const minhas = parcelasPorCondicao.get(chave) || [];
                            const expansivel = minhas.length > 0;
                            const aberta = expandida === chave;
                            const atrasadas = minhas.filter(i => i.balanceAmount > 0 && i.dueDate < hoje).length;
                            const proxima = minhas.filter(i => i.balanceAmount > 0 && i.dueDate >= hoje).sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0];
                            return (
                              <React.Fragment key={chave}>
                                <tr onClick={() => expansivel && setExpandida(aberta ? null : chave)}
                                  className={`text-slate-800 dark:text-slate-100 ${expansivel ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""} ${aberta ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                                  <td className="px-3 py-2.5 font-medium">
                                    <span className="flex items-center gap-1.5">
                                      {expansivel && <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${aberta ? "rotate-90" : ""}`} />}
                                      <span className="truncate">{p.conditionTypeName}</span>
                                    </span>
                                    {atrasadas > 0 && <span className="ml-5 mt-0.5 inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{atrasadas} em atraso</span>}
                                  </td>
                                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{p.installmentsNumber - p.openInstallmentsNumber}/{p.installmentsNumber}</td>
                                  <td className="px-2 py-2.5 text-slate-500">{p.indexerName}</td>
                                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{p.firstPayment ? formatDate(p.firstPayment) : "—"}</td>
                                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">{moeda(p.totalValue)}</td>
                                  <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">{moeda(p.amountPaid)}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{moeda(p.outstandingBalance)}</td>
                                </tr>
                                {aberta && (
                                  <tr>
                                    <td colSpan={7} className="bg-slate-50/70 p-0 dark:bg-slate-950/40">
                                      <div className="flex items-center justify-between px-4 py-2 text-[10px] text-slate-500">
                                        <span>{minhas.length} parcela(s) · {minhas.filter(i => i.balanceAmount <= 0).length} paga(s) · {atrasadas} em atraso</span>
                                        {proxima && <span>próxima: <strong className="text-slate-700 dark:text-slate-200">{formatDate(proxima.dueDate)}</strong> · {moeda(proxima.correctedBalanceAmount || proxima.balanceAmount)}</span>}
                                      </div>
                                      <div className="max-h-56 overflow-y-auto border-t border-slate-200/70 dark:border-slate-800">
                                        <table className="w-full table-fixed text-[12px]">
                                          <thead className="text-[9px] uppercase tracking-wider text-slate-500">
                                            <tr><th className="px-4 py-1 text-left font-semibold w-[10%]">Nº</th><th className="px-2 py-1 text-left font-semibold w-[14%]">Venc.</th><th className="px-2 py-1 text-right font-semibold w-[16%]">Valor</th><th className="px-2 py-1 text-right font-semibold w-[18%]">Recebido</th><th className="px-2 py-1 text-right font-semibold w-[18%]">Saldo</th><th className="px-4 py-1 text-right font-semibold w-[24%]">Situação</th></tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                            {[...minhas].sort((x, y) => x.dueDate.localeCompare(y.dueDate)).map(i => {
                                              const paga = i.balanceAmount <= 0;
                                              const atras = !paga && i.dueDate < hoje;
                                              const recebido = i.receivedNetAmount ?? (i.payments || []).reduce((s, pg) => s + (pg.netAmount || 0), 0);
                                              const ultimo = (i.payments || []).map(pg => pg.paymentDate).filter(Boolean).sort().pop();
                                              return (
                                                <tr key={`${i.billId}-${i.installmentId}`} className={`text-slate-700 dark:text-slate-200 ${atras ? "bg-rose-50/60 dark:bg-rose-500/[0.06]" : ""}`}>
                                                  <td className="px-4 py-1.5 tabular-nums text-slate-500">{i.installmentNumber || i.installmentId}</td>
                                                  <td className="px-2 py-1.5 tabular-nums">{formatDate(i.dueDate)}</td>
                                                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{moeda(i.originalAmount)}</td>
                                                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">{recebido > 0 ? moeda(recebido) : "—"}</td>
                                                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{paga ? "—" : moeda(i.correctedBalanceAmount || i.balanceAmount)}</td>
                                                  <td className="px-4 py-1.5 text-right">
                                                    {paga
                                                      ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"><CircleDot className="h-2.5 w-2.5" />Paga{ultimo ? <span className="ml-1 font-medium normal-case tracking-normal text-slate-500">{formatDate(ultimo)}</span> : null}</span>
                                                      : atras
                                                        ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300"><CircleDot className="h-2.5 w-2.5" />Atrasada</span>
                                                        : <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">A vencer</span>}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {c.receivableBillId && parcelas !== null && parcelasDoContrato.length === 0 && (
                      <p className="mt-2 text-[11px] text-slate-500">Nenhuma parcela do título {c.receivableBillId} no contas a receber carregado.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-7 py-8 text-sm text-slate-500">Sem contrato ativo vinculado a esta unidade no Sienge.</div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
