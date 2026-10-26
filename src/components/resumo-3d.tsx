"use client";

// Cards de resumo do empreendimento no topo do Quadro Espelho 3D (botão
// "Resumo", também na tela cheia): unidades, vendidas, disponíveis, permuta,
// VGV só das vendas, ticket médio e R$/m². Números em src/lib/resumo-vendas.ts.
// Clicar em Vendidas/Disponíveis/Permuta liga o filtro da legenda no 3D.

import { useEffect, useRef, useState } from "react";
import { formatCurrency, formatCompactCurrency } from "@/lib/dashboard-utils";
import { COR_SITUACAO } from "@/lib/situacao-unidade";
import type { ResumoVendas } from "@/lib/resumo-vendas";

interface Props {
  r: ResumoVendas;
  filtro: string[];                       // situações ativas no filtro da legenda
  onFiltrar: (situacao: string) => void;  // alterna uma situação no filtro
  compacto?: boolean;                     // tela estreita: menos texto
}

// Número que sobe do zero até o valor quando o card aparece (e quando muda).
function useContador(alvo: number, ms = 900) {
  const [v, setV] = useState(0);
  const de = useRef(0);
  useEffect(() => {
    const reduzido = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) { setV(alvo); de.current = alvo; return; }
    const inicio = de.current, t0 = performance.now();
    let raf = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const atual = inicio + (alvo - inicio) * e;
      setV(atual);
      if (k < 1) raf = requestAnimationFrame(passo); else de.current = alvo;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return v;
}

function Card({ rotulo, valor, apoio, cor, ativo, onClick, destaque }: {
  rotulo: string; valor: string; apoio?: string; cor?: string; ativo?: boolean; onClick?: () => void; destaque?: boolean;
}) {
  const base = "group relative min-w-[118px] rounded-xl border px-3 py-2 text-left shadow-lg backdrop-blur-md transition-all duration-300 motion-reduce:transition-none";
  const tema = ativo
    ? "border-blue-300 bg-blue-50/95 dark:border-blue-500/60 dark:bg-blue-950/80"
    : "border-white/60 bg-white/90 hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:hover:bg-slate-900";
  const conteudo = (
    <>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {cor && <span className="h-2 w-2 rounded-full" style={{ background: cor }} />}{rotulo}
      </div>
      <div className={`mt-0.5 font-black tabular-nums leading-none text-slate-900 dark:text-white ${destaque ? "text-[22px]" : "text-xl"}`}>{valor}</div>
      {apoio && <div className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-400">{apoio}</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!ativo} title={ativo ? "Tirar este filtro do 3D" : "Ver só estas unidades no 3D"} className={`${base} ${tema} cursor-pointer hover:-translate-y-0.5`}>{conteudo}</button>
    : <div className={`${base} ${tema}`}>{conteudo}</div>;
}

export default function Resumo3D({ r, filtro, onFiltrar, compacto }: Props) {
  const total = useContador(r.total), vendidas = useContador(r.vendidas), disponiveis = useContador(r.disponiveis), permuta = useContador(r.permuta);
  const vgv = useContador(r.vgv), ticket = useContador(r.ticket), m2 = useContador(r.m2Vendido);
  const n = (v: number) => Math.round(v).toLocaleString("pt-BR");
  const [visivel, setVisivel] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setVisivel(true)); return () => cancelAnimationFrame(t); }, []);
  const terceiros = r.terceiros > 0 ? ` · ${r.terceiros} por terceiros` : "";
  return (
    <div className={`flex flex-wrap justify-center gap-2 transition-all duration-500 motion-reduce:transition-none ${visivel ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`} role="region" aria-label="Resumo do empreendimento">
      <Card rotulo="Unidades" valor={n(total)} apoio={`${r.pctVendido.toLocaleString("pt-BR")}% comercializadas${r.reservadas ? ` · ${r.reservadas} reservada(s)` : ""}`} />
      <Card rotulo="Vendidas" valor={n(vendidas)} cor={COR_SITUACAO["Vendido"]} ativo={filtro.includes("Vendido")} onClick={() => onFiltrar("Vendido")}
        apoio={compacto ? undefined : `${r.vendidasComValor} com contrato${terceiros}`} />
      <Card rotulo="Disponíveis" valor={n(disponiveis)} cor={COR_SITUACAO["Disponível"]} ativo={filtro.includes("Disponível")} onClick={() => onFiltrar("Disponível")}
        apoio={compacto ? undefined : r.disponiveisComPreco ? `${formatCompactCurrency(r.estoqueTabela)} à tabela${r.disponiveisComPreco < r.disponiveis ? ` (${r.disponiveisComPreco} com preço)` : ""}` : "sem preço de tabela"} />
      {r.permuta > 0 && (
        <Card rotulo="Permuta" valor={n(permuta)} cor={COR_SITUACAO["Permutante"]} ativo={filtro.includes("Permutante")} onClick={() => onFiltrar("Permutante")}
          apoio={compacto ? undefined : "fora do VGV"} />
      )}
      <Card rotulo="VGV vendido" valor={formatCompactCurrency(vgv)} destaque
        apoio={compacto ? undefined : r.vendidasComValor ? `${r.vendidasComValor} venda(s) com contrato · sem permuta` : "nenhuma venda com valor"} />
      <Card rotulo="Ticket médio" valor={r.ticket ? formatCompactCurrency(ticket) : "—"} apoio={compacto ? undefined : r.ticket ? "por venda, só contratos de venda" : undefined} />
      <Card rotulo="R$/m² vendido" valor={r.m2Vendido ? formatCurrency(m2) : "—"}
        apoio={compacto ? undefined : r.m2Tabela ? `à tabela: ${formatCurrency(r.m2Tabela)}` : r.m2Vendido ? `${r.areaVendida.toLocaleString("pt-BR")} m² vendidos` : undefined} />
    </div>
  );
}
