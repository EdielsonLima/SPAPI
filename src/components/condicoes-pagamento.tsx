"use client";

// Modal "Condições" da unidade disponível (Quadro Espelho 3D): preço de
// tabela, condições de pagamento do empreendimento e o fluxo de pagamento
// (quando e quanto). Qualquer um simula mexendo nos campos; quem edita a
// tabela de preços pode salvar os números como padrão do empreendimento.

import { useEffect, useMemo, useState } from "react";
import { Copy, Save, RotateCcw, Check } from "lucide-react";
import { formatCurrency } from "@/lib/dashboard-utils";
import { CONDICOES_PADRAO, type CondicoesPagamento, fluxoDePagamento, saldoPct, validarCondicoes, mesCurto, resumoDoFluxo } from "@/lib/condicoes-pagamento";

interface Props {
  chave: string;            // empreendimento (condições guardadas por chave)
  empreendimento: string;
  unidade: string;
  andar: number;
  posicao: string;
  area: number;
  preco: number;            // preço de tabela (0 = sem preço)
  entregaConfig?: string;   // "AAAA-MM" da config do 3D, usado quando não há mês salvo
}

type Resposta = { podeEditar: boolean; cadastrada: boolean; condicoes: CondicoesPagamento; atualizadoPor: string | null; atualizadoEm: string | null };

export default function CondicoesPagamentoModal({ chave, empreendimento, unidade, andar, posicao, area, preco, entregaConfig }: Props) {
  const [base, setBase] = useState<Resposta | null>(null);
  const [c, setC] = useState<CondicoesPagamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/condicoes-pagamento?chave=${encodeURIComponent(chave)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j: Resposta = await r.json();
        if (!vivo) return;
        const cond = { ...j.condicoes, entrega: j.condicoes.entrega || entregaConfig || "" };
        setBase(j); setC(cond);
      } catch (e) {
        if (!vivo) return;
        setErro("Não consegui carregar as condições (" + (e instanceof Error ? e.message : "erro") + "). Mostrando as de referência.");
        setBase({ podeEditar: false, cadastrada: false, condicoes: CONDICOES_PADRAO, atualizadoPor: null, atualizadoEm: null });
        setC({ ...CONDICOES_PADRAO, entrega: entregaConfig || "" });
      }
    })();
    return () => { vivo = false; };
  }, [chave, entregaConfig]);

  const invalido = c ? validarCondicoes(c) : null;
  const fluxo = useMemo(() => (c && preco > 0 && !invalido ? fluxoDePagamento(preco, c) : null), [c, preco, invalido]);
  const alterado = !!(base && c && JSON.stringify({ ...base.condicoes, entrega: base.condicoes.entrega || entregaConfig || "" }) !== JSON.stringify(c));

  const campo = (k: keyof CondicoesPagamento, v: string, inteiro = false) => {
    if (!c) return;
    const n = inteiro ? parseInt(v || "0", 10) : parseFloat((v || "0").replace(",", "."));
    setC({ ...c, [k]: Number.isFinite(n) ? n : 0 });
  };
  const salvar = async () => {
    if (!c) return;
    setSalvando(true); setAviso(null);
    try {
      const r = await fetch("/api/condicoes-pagamento", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, condicoes: c }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBase(b => b ? { ...b, cadastrada: true, condicoes: j.condicoes } : b);
      setAviso("Condições salvas como padrão do empreendimento.");
    } catch (e) {
      setAviso("Não salvou: " + (e instanceof Error ? e.message : "erro"));
    } finally { setSalvando(false); }
  };
  const copiar = async () => {
    if (!fluxo || !c) return;
    const txt = resumoDoFluxo(unidade, empreendimento, area, fluxo, c, formatCurrency);
    try { await navigator.clipboard.writeText(txt); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { setAviso("Não consegui copiar; selecione o texto do fluxo e copie à mão."); }
  };

  const inp = "w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs tabular-nums focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
  const m2 = preco > 0 && area > 0 ? preco / area : 0;

  if (!c || !base) return <div className="flex h-48 items-center justify-center text-xs text-slate-500">{erro || "Carregando as condições…"}</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho de valor */}
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Preço de tabela</p>
          {preco > 0
            ? <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">{formatCurrency(preco)}</p>
            : <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Sem preço de tabela cadastrado para esta unidade. Cadastre em Comercial › Tabela de preços.</p>}
        </div>
        {m2 > 0 && <div className="text-right"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Por m²</p><p className="text-base font-bold tabular-nums">{formatCurrency(m2)}</p></div>}
        {area > 0 && <div className="text-right"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Área privativa</p><p className="text-base font-bold tabular-nums">{area.toLocaleString("pt-BR")} m²</p></div>}
        <p className="text-xs text-slate-500 sm:col-span-3">{andar}º andar · {posicao}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Condições (simulação / edição) */}
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Condições de pagamento</h3>
            {base.cadastrada ? <span className="text-[10px] text-slate-500">padrão do empreendimento{base.atualizadoPor ? ` · ${base.atualizadoPor.split("@")[0]}` : ""}</span> : <span className="text-[10px] text-amber-700 dark:text-amber-300">valores de referência, não cadastrados</span>}
          </div>
          <table className="w-full text-xs">
            <tbody>
              <Linha rotulo="Sinal (ato)"><input className={inp} type="number" min={0} max={100} step={0.5} value={c.sinalPct} onChange={e => campo("sinalPct", e.target.value)} aria-label="Sinal %" /> <span className="text-slate-500">%</span></Linha>
              <Linha rotulo="Mensais até as chaves"><input className={inp} type="number" min={0} max={100} step={0.5} value={c.mensaisPct} onChange={e => campo("mensaisPct", e.target.value)} aria-label="Mensais %" /> <span className="text-slate-500">% em</span> <input className={inp} type="number" min={0} max={240} value={c.mensaisQtd} onChange={e => campo("mensaisQtd", e.target.value, true)} aria-label="Quantidade de mensais" /> <span className="text-slate-500">×</span></Linha>
              <Linha rotulo="Balões anuais"><input className={inp} type="number" min={0} max={100} step={0.5} value={c.baloesPct} onChange={e => campo("baloesPct", e.target.value)} aria-label="Balões %" /> <span className="text-slate-500">% em</span> <input className={inp} type="number" min={0} max={30} value={c.baloesQtd} onChange={e => campo("baloesQtd", e.target.value, true)} aria-label="Quantidade de balões" /> <span className="text-slate-500">×</span></Linha>
              <Linha rotulo="Nas chaves"><input className={inp} type="number" min={0} max={100} step={0.5} value={c.chavesPct} onChange={e => campo("chavesPct", e.target.value)} aria-label="Chaves %" /> <span className="text-slate-500">%</span></Linha>
              <Linha rotulo="Saldo após as chaves"><span className="inline-block w-20 text-right font-semibold tabular-nums">{saldoPct(c)}</span> <span className="text-slate-500">% em</span> <input className={inp} type="number" min={0} max={600} value={c.saldoQtd} onChange={e => campo("saldoQtd", e.target.value, true)} aria-label="Parcelas do saldo" /> <span className="text-slate-500">×</span></Linha>
              <Linha rotulo="Entrega das chaves"><input className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800" type="month" value={c.entrega} onChange={e => setC({ ...c, entrega: e.target.value })} aria-label="Mês de entrega" /></Linha>
            </tbody>
          </table>
          <label className="mt-3 block text-[11px] text-slate-500">Correção
            <input value={c.correcao} onChange={e => setC({ ...c, correcao: e.target.value })} maxLength={300} className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
          </label>
          <label className="mt-2 block text-[11px] text-slate-500">Observações
            <textarea value={c.observacoes} onChange={e => setC({ ...c, observacoes: e.target.value })} maxLength={600} rows={2} className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
          </label>
          {invalido && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{invalido}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setC({ ...base.condicoes, entrega: base.condicoes.entrega || entregaConfig || "" })} disabled={!alterado} className={btn}><RotateCcw className="h-3.5 w-3.5" /> Voltar ao padrão</button>
            {base.podeEditar && <button type="button" onClick={salvar} disabled={salvando || !!invalido || !alterado} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"><Save className="h-3.5 w-3.5" /> {salvando ? "Salvando…" : "Salvar como padrão"}</button>}
            {!base.podeEditar && alterado && <span className="text-[11px] text-slate-500">Simulação só nesta tela; quem edita a tabela de preços pode salvar o padrão.</span>}
          </div>
          {aviso && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{aviso}</p>}
        </section>

        {/* Fluxo */}
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Fluxo de pagamento</h3>
            {fluxo && <button type="button" onClick={copiar} className={btn}>{copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? "Copiado" : "Copiar resumo"}</button>}
          </div>
          {!fluxo && <p className="text-xs text-slate-500">{preco > 0 ? "Corrija as condições para ver o fluxo." : "Sem preço de tabela não há fluxo a calcular."}</p>}
          {fluxo && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500"><th className="py-1 pr-2">Etapa</th><th className="py-1 pr-2">Quando</th><th className="py-1 pr-2 text-right">Parcelas</th><th className="py-1 pr-2 text-right">Valor</th><th className="py-1 text-right">%</th></tr></thead>
                  <tbody>
                    {fluxo.etapas.map(e => (
                      <tr key={e.etapa} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-2 font-semibold">{e.rotulo}</td>
                        <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">{e.parcelas > 0 ? `${mesCurto(e.inicio)} a ${mesCurto(e.fim)}` : mesCurto(e.inicio)}{e.etapa === "chaves" && fluxo.entregaEstimada ? " (estimado)" : ""}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{e.parcelas > 0 ? `${e.parcelas}× ${formatCurrency(e.valorParcela)}` : "única"}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{formatCurrency(e.total)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">{e.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Até as chaves · {mesCurto(fluxo.entrega)}{fluxo.entregaEstimada ? " (estimado)" : ""}</p><p className="text-base font-black tabular-nums">{formatCurrency(fluxo.ateChaves)} <span className="text-xs font-semibold text-slate-500">({Math.round(fluxo.ateChaves / fluxo.preco * 100)}%)</span></p></div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Após as chaves</p><p className="text-base font-black tabular-nums">{formatCurrency(fluxo.aposChaves)} <span className="text-xs font-semibold text-slate-500">({Math.round(fluxo.aposChaves / fluxo.preco * 100)}%)</span></p></div>
              </div>
              {(c.correcao || c.observacoes) && <p className="mt-3 text-[11px] leading-snug text-slate-500">{c.correcao}{c.correcao && c.observacoes ? " · " : ""}{c.observacoes}</p>}
            </>
          )}
        </section>
      </div>
      {erro && <p className="text-xs text-amber-700 dark:text-amber-300">{erro}</p>}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <tr><td className="py-1 pr-3 text-slate-600 dark:text-slate-300">{rotulo}</td><td className="whitespace-nowrap py-1 text-right">{children}</td></tr>;
}
