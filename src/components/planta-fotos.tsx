"use client";

// Aba "Fotos" do "Ver planta": galeria das fotos do empreendimento guardadas no
// banco (plantas_fotos), com envio, título, ordem e exclusão feitos na tela.

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface Foto { id: number; titulo: string; ordem: number; tamanho: number; mime: string }

export default function PlantaFotos({ chave }: { chave: string }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [sel, setSel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/plantas/fotos?chave=${encodeURIComponent(chave)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setFotos(await r.json()); setErro(null);
    } catch (e) {
      setErro("Não consegui carregar as fotos (" + (e instanceof Error ? e.message : "erro") + ").");
      setFotos([]);
    }
  }, [chave]);
  useEffect(() => { carregar(); }, [carregar]);

  const f = fotos && fotos.length ? fotos[Math.min(sel, fotos.length - 1)] : null;
  useEffect(() => { setTitulo(f?.titulo ?? ""); setConfirmando(null); }, [f?.id, f?.titulo]);

  const enviar = async (lista: FileList | null) => {
    if (!lista || !lista.length) return;
    setEnviando(true); setAviso(null);
    const form = new FormData();
    form.append("chave", chave);
    Array.from(lista).forEach(a => form.append("fotos", a));
    try {
      const r = await fetch("/api/plantas/fotos", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (j.recusadas?.length) setAviso("Não entrou: " + j.recusadas.join("; "));
      await carregar();
      if (j.salvas?.length) setSel(Number.MAX_SAFE_INTEGER); // vai para a última (a recém-enviada)
    } catch (e) {
      setAviso("Falha no envio: " + (e instanceof Error ? e.message : "erro"));
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  };
  const apagar = async (id: number) => {
    const r = await fetch(`/api/plantas/fotos/${id}`, { method: "DELETE" });
    if (!r.ok) { setAviso("Não consegui apagar a foto."); return; }
    setConfirmando(null); setSel(s => Math.max(0, s - (sel >= (fotos?.length ?? 1) - 1 ? 1 : 0)));
    await carregar();
  };
  const mover = async (id: number, dir: "antes" | "depois") => {
    const r = await fetch(`/api/plantas/fotos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mover: dir }) });
    if (!r.ok) { setAviso("Não consegui mover a foto."); return; }
    setSel(s => s + (dir === "antes" ? -1 : 1));
    await carregar();
  };
  const salvarTitulo = async () => {
    if (!f || titulo.trim() === f.titulo) return;
    const r = await fetch(`/api/plantas/fotos/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo }) });
    if (!r.ok) { setAviso("Não consegui salvar o título."); return; }
    await carregar();
  };

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
  const idx = f ? fotos!.indexOf(f) : -1;
  return (
    <div className="flex flex-col gap-2">
      {fotos === null && <div className="flex h-[40vh] items-center justify-center text-xs text-slate-500">Carregando as fotos…</div>}
      {erro && <p className="text-xs text-amber-700 dark:text-amber-300">{erro}</p>}
      {fotos && !fotos.length && !erro && (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-600">
          <span>Nenhuma foto deste empreendimento ainda.</span>
        </div>
      )}
      {f && (
        <>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/plantas/fotos/${f.id}`} alt={f.titulo} className="max-h-[56vh] w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800" />
            {fotos!.length > 1 && (<>
              <button type="button" onClick={() => setSel((idx - 1 + fotos!.length) % fotos!.length)} aria-label="Foto anterior" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/65"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setSel((idx + 1) % fotos!.length)} aria-label="Próxima foto" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/65"><ChevronRight className="h-4 w-4" /></button>
            </>)}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input value={titulo} onChange={e => setTitulo(e.target.value)} onBlur={salvarTitulo} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Título da foto" className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-semibold hover:border-slate-300 focus:border-slate-400 focus:outline-none dark:hover:border-slate-600" />
            <span className="tabular-nums text-slate-500">{idx + 1} / {fotos!.length}</span>
            <button type="button" onClick={() => mover(f.id, "antes")} disabled={idx === 0} className={btn} title="Mover para antes"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => mover(f.id, "depois")} disabled={idx === fotos!.length - 1} className={btn} title="Mover para depois"><ChevronRight className="h-3.5 w-3.5" /></button>
            {confirmando === f.id ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-600 dark:text-slate-300">Apagar esta foto?</span>
                <button type="button" onClick={() => apagar(f.id)} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">Apagar</button>
                <button type="button" onClick={() => setConfirmando(null)} className={btn}>Cancelar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmando(f.id)} className={btn}><Trash2 className="h-3.5 w-3.5" /> Apagar</button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fotos!.map((x, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={x.id} src={`/api/plantas/fotos/${x.id}`} alt={x.titulo} title={x.titulo} onClick={() => setSel(i)} className={`h-14 w-20 shrink-0 cursor-pointer rounded-md object-cover ${x.id === f.id ? "ring-2 ring-amber-500" : "opacity-70 hover:opacity-100"}`} />
            ))}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
        <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" id={`fotos-${chave}`} onChange={e => enviar(e.target.files)} />
        <button type="button" disabled={enviando} onClick={() => arquivo.current?.click()} className={btn}><Upload className="h-3.5 w-3.5" /> {enviando ? "Enviando…" : "Enviar fotos"}</button>
        <span className="text-slate-500">JPG, PNG ou WebP, até 8 MB cada. As fotos ficam no banco do painel e valem para todas as unidades deste empreendimento.</span>
      </div>
      {aviso && <p className="text-xs text-amber-700 dark:text-amber-300">{aviso}</p>}
    </div>
  );
}
