"use client";

// Andamento da obra em anéis, por cima do 3D (também na tela cheia). Números
// de /api/andamento-obra (site da Silva Packer, ou o gravado no painel).

import React, { useEffect, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import type { EtapaObra } from "@/lib/andamento-obra";

function Anel({ pct, rotulo }: { pct: number; rotulo: string }) {
  const r = 17, c = 2 * Math.PI * r;
  return (
    <div className="flex w-[64px] flex-col items-center">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke="#b91c1c"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
        <text x="22" y="22" transform="rotate(90 22 22)" textAnchor="middle" dominantBaseline="central"
          className="fill-slate-800 dark:fill-slate-100 text-[9px] font-black">{pct}%</text>
      </svg>
      <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-tight text-slate-600 dark:text-slate-300">{rotulo}</span>
    </div>
  );
}

export function AndamentoObraCard({ chave }: { chave: string }) {
  const [dados, setDados] = useState<{ etapas: EtapaObra[]; atualizadoEm: string; fonte: string; podeEditar: boolean } | null>(null);
  const [edicao, setEdicao] = useState<EtapaObra[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    fetch(`/api/andamento-obra?chave=${encodeURIComponent(chave)}`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d?.etapas) setDados(d); }).catch(() => {});
    return () => { vivo = false; };
  }, [chave]);
  if (!dados) return null;
  const salvar = async () => {
    if (!edicao) return;
    const r = await fetch("/api/andamento-obra", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, etapas: edicao }) });
    if (!r.ok) { setErro((await r.json().catch(() => ({})))?.error || "Não foi possível salvar."); return; }
    setDados({ ...dados, etapas: edicao, fonte: "painel", atualizadoEm: new Date().toISOString() }); setEdicao(null); setErro("");
  };
  const data = new Date(dados.atualizadoEm);
  return (
    <div className="pointer-events-auto rounded-lg bg-white/90 px-3 py-2 shadow-sm dark:bg-slate-900/85">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Andamento da obra</p>
        <div className="flex items-center gap-2">
          {!isNaN(data.getTime()) && <span className="text-[9px] text-slate-400">{dados.fonte === "site" ? "site" : "painel"} · {data.toLocaleDateString("pt-BR")}</span>}
          {dados.podeEditar && !edicao && (
            <button type="button" onClick={() => setEdicao(dados.etapas.map(e => ({ ...e })))} title="Editar o andamento" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><Pencil className="h-3 w-3" /></button>
          )}
          {edicao && (<>
            <button type="button" onClick={salvar} title="Salvar" className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { setEdicao(null); setErro(""); }} title="Cancelar" className="text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
          </>)}
        </div>
      </div>
      <div className="flex gap-1">
        {(edicao ?? dados.etapas).map((e, i) => edicao ? (
          <label key={e.etapa} className="flex w-[64px] flex-col items-center gap-0.5">
            <input type="number" min={0} max={100} value={e.pct}
              onChange={ev => setEdicao(ed => ed!.map((x, k) => k === i ? { ...x, pct: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) } : x))}
              className="h-7 w-12 rounded border border-slate-300 bg-white text-center text-xs font-bold dark:border-slate-600 dark:bg-slate-800" />
            <span className="text-[9px] font-bold uppercase text-slate-600 dark:text-slate-300">{e.etapa}</span>
          </label>
        ) : <Anel key={e.etapa} pct={e.pct} rotulo={e.etapa} />)}
      </div>
      {erro && <p className="mt-1 text-[10px] text-red-600">{erro}</p>}
    </div>
  );
}
