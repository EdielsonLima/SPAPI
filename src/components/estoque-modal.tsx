"use client";

// Estoque da empresa (Painel › Resumo): abre ao clicar em Valor Estoque, Disp.
// ou Res.Téc. Lista as unidades da empresa com o tipo do Sienge, a situação e
// o preço de cada uma, e deixa ajustar os dois ali mesmo:
//  - preço      → tabela de preços do painel (a mesma de Comercial › Tabela de
//                 Preços, com histórico);
//  - situação   → situação manual (situacao_manual_unidades), por cima do
//                 Sienge e da tabela comercial.
// Nada é gravado no Sienge. As contas são as de src/lib/estoque-resumo.ts — as
// mesmas da tabela do Resumo, então o total daqui é o número da coluna.
// O que se digita fica pendente (e já simulado nos cartões) até "Salvar".

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputReais } from "@/components/input-reais";
import { formatCurrency } from "@/lib/dashboard-utils";
import { lerValorBR } from "@/lib/tabela-precos";
import { normalizarTabelaComercial, type TabelaComercial } from "@/lib/tabela-comercial";
import { COR_SITUACAO } from "@/lib/situacao-unidade";
import {
  linhasDeEstoque, totaisDoEstoque, composicaoPorTipo, grupoDoTipo, ehSituacaoManual,
  ORDEM_GRUPOS, SITUACOES_MANUAIS, type ContextoEstoque, type LinhaEstoque, type SituacaoManual,
} from "@/lib/estoque-resumo";
import type { ApiUnit } from "@/lib/comercial-utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, Save, Search, Undo2, X } from "lucide-react";

// ── Dados que o estoque usa além das unidades (preços, tabela comercial, situação manual) ──
export interface DadosEstoque {
  precos: Map<number, number>;
  tabelasComerciais: Map<string, TabelaComercial>;
  situacoesManuais: Map<number, SituacaoManual>;
  autores: Map<number, { por: string; em: string }>;
  podeEditar: boolean;
  recarregar: () => Promise<void>;
}

async function lerJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? (await r.json() as T) : null;
  } catch { return null; }
}

export function useDadosEstoque(): DadosEstoque {
  const [precos, setPrecos] = useState<Map<number, number>>(new Map());
  const [tabelasComerciais, setTabelasComerciais] = useState<Map<string, TabelaComercial>>(new Map());
  const [situacoesManuais, setSituacoesManuais] = useState<Map<number, SituacaoManual>>(new Map());
  const [autores, setAutores] = useState<Map<number, { por: string; em: string }>>(new Map());
  const [podeEditar, setPodeEditar] = useState(false);

  // Cada leitura falha sozinha: sem preço ou sem situação manual, o Resumo cai
  // na regra de antes (Sienge + estimativa), nunca fica sem número.
  const recarregar = useCallback(async () => {
    const [p, t, s] = await Promise.all([
      lerJson<{ podeEditar?: boolean; precos?: { unitId: number; valor: number }[] }>("/api/tabela-precos"),
      lerJson<{ tabelas?: Record<string, Partial<TabelaComercial>> }>("/api/tabela-comercial"),
      lerJson<{ situacoes?: { unitId: number; situacao: string; atualizadoPor: string; atualizadoEm: string }[] }>("/api/situacao-unidades"),
    ]);
    if (p) {
      setPrecos(new Map((p.precos || []).map(x => [x.unitId, x.valor])));
      setPodeEditar(Boolean(p.podeEditar));
    }
    if (t) setTabelasComerciais(new Map(Object.entries(t.tabelas || {}).map(([k, v]) => [k, normalizarTabelaComercial(v)])));
    if (s) {
      const validas = (s.situacoes || []).filter(x => ehSituacaoManual(x.situacao));
      setSituacoesManuais(new Map(validas.map(x => [x.unitId, x.situacao as SituacaoManual])));
      setAutores(new Map(validas.map(x => [x.unitId, { por: x.atualizadoPor, em: x.atualizadoEm }])));
    }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  return useMemo(
    () => ({ precos, tabelasComerciais, situacoesManuais, autores, podeEditar, recarregar }),
    [precos, tabelasComerciais, situacoesManuais, autores, podeEditar, recarregar],
  );
}

// ── Modal ──
export type FiltroEstoque = "estoque" | "disponiveis" | "reservadas" | "fora" | "divergentes" | "todas";

const FILTROS: { chave: FiltroEstoque; rotulo: string; dica: string; passa: (l: LinhaEstoque) => boolean }[] = [
  { chave: "estoque", rotulo: "Em estoque", dica: "Disponíveis e reservadas", passa: l => l.situacao === "Disponível" || l.situacao === "Reservado" },
  { chave: "disponiveis", rotulo: "Disponíveis", dica: "Só as disponíveis", passa: l => l.situacao === "Disponível" },
  { chave: "reservadas", rotulo: "Reservadas", dica: "Só as reservadas", passa: l => l.situacao === "Reservado" },
  { chave: "fora", rotulo: "Vendidas e outras", dica: "Vendidas, em proposta, permuta…", passa: l => l.situacao !== "Disponível" && l.situacao !== "Reservado" },
  { chave: "divergentes", rotulo: "Diferem do Sienge", dica: "Situação no painel diferente da do Sienge (ajuste manual ou tabela comercial)", passa: l => l.situacao !== l.situacaoSienge },
  { chave: "todas", rotulo: "Todas", dica: "Todas as unidades da empresa", passa: () => true },
];

type Coluna = "padrao" | "unidade" | "empreendimento" | "tipo" | "pavimento" | "area" | "situacao" | "preco" | "m2" | "valor";
type Pendente = SituacaoManual | "auto";

// Texto do campo → valor: null = sem preço (campo vazio); "invalido" = não dá para ler.
const precoDigitado = (texto: string): number | null | "invalido" => {
  const t = texto.trim();
  if (t === "") return null;
  const v = lerValorBR(t);
  return v !== null && v > 0 ? Math.round(v * 100) / 100 : "invalido";
};
const numeroBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quem = (s: string) => s.replace(/\s*<.*>$/, "");
const dia = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR"); };
const chip = (ativo: boolean) =>
  `h-7 px-2.5 rounded-lg border text-xs font-medium tabular-nums transition-colors select-none ${
    ativo ? "chip-ativo" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500"
  }`;

function Cartao({ rotulo, valor, sub, cor, alerta }: { rotulo: string; valor: string; sub?: string; cor: string; alerta?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cor}`} />
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{rotulo}</p>
      </div>
      <p className="mt-1.5 whitespace-nowrap text-[clamp(1rem,1.15vw,1.5rem)] font-semibold leading-tight tabular-nums text-slate-900 dark:text-slate-50">{valor}</p>
      {alerta
        ? <p className="mt-1 truncate text-[11px] font-medium tabular-nums text-amber-700 dark:text-amber-300" title={alerta}>{alerta}</p>
        : sub && <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={sub}>{sub}</p>}
    </div>
  );
}

export function EstoqueModal({ empresa, filtroInicial = "estoque", unidades, dados, fator, cub, cubMes, onFechar }: {
  empresa: string;
  filtroInicial?: FiltroEstoque;
  unidades: ApiUnit[];          // todas as unidades carregadas; o modal fica com as da empresa
  dados: DadosEstoque;
  fator: number;                // fator da empresa em Configurações › Empreendimentos
  cub: number;                  // CUB do mês
  cubMes?: string;
  onFechar: () => void;
}) {
  const { podeEditar } = dados;
  const daEmpresa = useMemo(() => unidades.filter(u => u.companyName === empresa), [unidades, empresa]);

  // ── O que foi digitado e ainda não foi salvo ──
  const [precosTxt, setPrecosTxt] = useState<Map<number, string>>(new Map());
  const [sitPend, setSitPend] = useState<Map<number, Pendente>>(new Map());
  const [salvando, setSalvando] = useState(false);

  const ctxSalvo: ContextoEstoque = useMemo(() => ({
    precos: dados.precos, tabelasComerciais: dados.tabelasComerciais, situacoesManuais: dados.situacoesManuais,
    fator: () => fator, cub,
  }), [dados.precos, dados.tabelasComerciais, dados.situacoesManuais, fator, cub]);
  const salvas = useMemo(() => linhasDeEstoque(daEmpresa, ctxSalvo), [daEmpresa, ctxSalvo]);

  // Simulação: o salvo com o digitado por cima (preço inválido não entra).
  const linhas = useMemo(() => {
    if (precosTxt.size === 0 && sitPend.size === 0) return salvas;
    const precos = new Map(dados.precos);
    precosTxt.forEach((txt, id) => {
      const t = txt.trim();
      if (t === "") { precos.delete(id); return; }
      const v = lerValorBR(t);
      if (v !== null && v > 0) precos.set(id, v);
    });
    const situacoesManuais = new Map(dados.situacoesManuais);
    sitPend.forEach((s, id) => { if (s === "auto") situacoesManuais.delete(id); else situacoesManuais.set(id, s); });
    return linhasDeEstoque(daEmpresa, { ...ctxSalvo, precos, situacoesManuais });
  }, [salvas, precosTxt, sitPend, dados.precos, dados.situacoesManuais, daEmpresa, ctxSalvo]);

  const totais = useMemo(() => totaisDoEstoque(linhas), [linhas]);
  const totaisSalvos = useMemo(() => totaisDoEstoque(salvas), [salvas]);

  // ── Mudanças de verdade (digitar o mesmo valor não conta) ──
  const { mudancasPreco, invalidos, mudancasSit, idsPreco, idsSit, idsInvalidos } = useMemo(() => {
    const mudancasPreco: { linha: LinhaEstoque; valor: number | null }[] = [];
    const invalidos: LinhaEstoque[] = [];
    const mudancasSit: { linha: LinhaEstoque; situacao: SituacaoManual | null }[] = [];
    for (const l of salvas) {
      if (l.unitId === null || l.enterpriseId === null) continue;
      if (precosTxt.has(l.unitId)) {
        const v = precoDigitado(precosTxt.get(l.unitId)!);
        if (v === "invalido") invalidos.push(l);
        else if (v !== l.precoTabela) mudancasPreco.push({ linha: l, valor: v });
      }
      if (sitPend.has(l.unitId)) {
        const p = sitPend.get(l.unitId)!;
        const situacao = p === "auto" ? null : p;
        if (situacao !== (dados.situacoesManuais.get(l.unitId) ?? null)) mudancasSit.push({ linha: l, situacao });
      }
    }
    return {
      mudancasPreco, invalidos, mudancasSit,
      idsPreco: new Set(mudancasPreco.map(m => m.linha.unitId!)),
      idsSit: new Set(mudancasSit.map(m => m.linha.unitId!)),
      idsInvalidos: new Set(invalidos.map(l => l.unitId!)),
    };
  }, [salvas, precosTxt, sitPend, dados.situacoesManuais]);
  const nMudancas = mudancasPreco.length + mudancasSit.length;

  const descartar = () => { setPrecosTxt(new Map()); setSitPend(new Map()); };
  const fechar = () => {
    if (salvando) return;
    if (nMudancas > 0 && !window.confirm("Há alterações que ainda não foram salvas. Fechar mesmo assim?")) return;
    onFechar();
  };

  const salvar = async () => {
    if (nMudancas === 0 || invalidos.length > 0 || salvando || !podeEditar) return;
    setSalvando(true);
    try {
      const enviar = async (url: string, corpo: object) => {
        const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({})) as { error?: string; alteradas?: number };
        if (!r.ok) throw new Error(d.error || "Falha ao salvar.");
        return d.alteradas ?? 0;
      };
      let nPrecos = 0, nSit = 0;
      if (mudancasPreco.length > 0) {
        nPrecos = await enviar("/api/tabela-precos", {
          tipo: "manual",
          descricao: `Valor digitado no Estoque do Resumo · ${empresa}`,
          itens: mudancasPreco.map(m => ({ unitId: m.linha.unitId, enterpriseId: m.linha.enterpriseId, unidade: m.linha.unidade, valor: m.valor })),
        });
      }
      if (mudancasSit.length > 0) {
        nSit = await enviar("/api/situacao-unidades", {
          itens: mudancasSit.map(m => ({ unitId: m.linha.unitId, enterpriseId: m.linha.enterpriseId, unidade: m.linha.unidade, situacao: m.situacao })),
        });
      }
      // Recarrega ANTES de limpar o digitado, senão os campos piscam com o valor antigo.
      await dados.recarregar();
      descartar();
      const partes = [nPrecos > 0 ? `${nPrecos} preço(s)` : "", nSit > 0 ? `${nSit} situação(ões)` : ""].filter(Boolean);
      toast.success(partes.length > 0 ? `Salvo: ${partes.join(" e ")}. O Resumo já usa os novos valores.` : "Nada mudou.");
    } catch (e) {
      // Se o preço gravou e a situação não (ou o contrário), o que gravou já aparece como salvo.
      await dados.recarregar();
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  // ── Filtros e ordenação ──
  const [filtro, setFiltro] = useState<FiltroEstoque>(filtroInicial);
  const [grupo, setGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ coluna: Coluna; dir: "asc" | "desc" }>({ coluna: "padrao", dir: "asc" });

  const grupos = useMemo(() => ORDEM_GRUPOS.filter(g => linhas.some(l => grupoDoTipo(l.tipo) === g)), [linhas]);
  const variosEmpreendimentos = useMemo(() => new Set(linhas.map(l => l.empreendimento)).size > 1, [linhas]);
  const passaNoResto = useCallback((l: LinhaEstoque) =>
    (!grupo || grupoDoTipo(l.tipo) === grupo) && (!busca.trim() || l.unidade.toLowerCase().includes(busca.toLowerCase().trim())),
  [grupo, busca]);

  const visiveis = useMemo(() => {
    const passa = FILTROS.find(f => f.chave === filtro)!.passa;
    // Linha mexida fica na lista até salvar, mesmo que a nova situação a tire do filtro.
    const mexida = (l: LinhaEstoque) => l.unitId !== null && (idsPreco.has(l.unitId) || idsSit.has(l.unitId) || idsInvalidos.has(l.unitId));
    const lista = linhas.filter(l => passaNoResto(l) && (passa(l) || mexida(l)));
    const m2 = (l: LinhaEstoque) => (l.preco && l.area ? l.preco / l.area : null);
    const chave: Record<Exclude<Coluna, "padrao">, (l: LinhaEstoque) => string | number | null> = {
      unidade: l => l.unidade, empreendimento: l => l.empreendimento, tipo: l => l.tipo,
      pavimento: l => parseInt(l.pavimento, 10) || l.pavimento || null, area: l => l.area || null,
      situacao: l => l.situacao, preco: l => l.preco, m2, valor: l => (l.situacao === "Disponível" ? l.valorEstoque : null),
    };
    const txt = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });
    return [...lista].sort((a, b) => {
      if (ordem.coluna === "padrao") {
        return ORDEM_GRUPOS.indexOf(grupoDoTipo(a.tipo)) - ORDEM_GRUPOS.indexOf(grupoDoTipo(b.tipo))
          || txt(a.empreendimento, b.empreendimento) || txt(a.unidade, b.unidade);
      }
      const va = chave[ordem.coluna](a), vb = chave[ordem.coluna](b);
      if (va === null && vb === null) return txt(a.unidade, b.unidade);
      if (va === null) return 1;   // vazio sempre por último
      if (vb === null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : txt(String(va), String(vb));
      return (ordem.dir === "asc" ? c : -c) || txt(a.unidade, b.unidade);
    });
  }, [linhas, filtro, passaNoResto, ordem, idsPreco, idsSit, idsInvalidos]);

  const ordenarPor = (coluna: Coluna) => setOrdem(o => o.coluna === coluna ? { coluna, dir: o.dir === "asc" ? "desc" : "asc" } : { coluna, dir: coluna === "preco" || coluna === "valor" || coluna === "m2" ? "desc" : "asc" });
  const th = (coluna: Coluna, rotulo: string, className = "") => (
    <th key={coluna} scope="col" className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${className}`}>
      <button type="button" onClick={() => ordenarPor(coluna)} className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-800 dark:hover:text-slate-200 ${className.includes("text-right") ? "flex-row-reverse" : ""}`}>
        {rotulo}
        {ordem.coluna === coluna ? (ordem.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
  );

  // ── Cartões ──
  const disponiveisContadas = linhas.filter(l => l.situacao === "Disponível" && l.entraNaContagem);
  const reservadasContadas = linhas.filter(l => l.situacao === "Reservado" && l.entraNaContagem);
  // Disponíveis que o Resumo não conta (sala, loja, box pelo nome): explicam a diferença para o filtro "Disponíveis".
  const foraDaContagem = linhas.filter(l => l.situacao === "Disponível" && !l.entraNaContagem).length;
  const semPreco = totais.estimadas + totais.semValor;
  const mudou = (a: number, b: number) => Math.abs(a - b) > 0.004;
  const totalVisivel = visiveis.reduce((s, l) => s + l.valorEstoque, 0);
  const colunas = 8 + (variosEmpreendimentos ? 1 : 0);

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) fechar(); }}>
      <DialogContent
        semFechar
        onOpenAutoFocus={e => e.preventDefault()}
        className="flex h-[92vh] max-h-[92vh] max-w-[min(1320px,96vw)] flex-col gap-0 overflow-hidden border-slate-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl"
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Estoque</p>
            <DialogTitle className="mt-0.5 truncate text-lg font-semibold tracking-[-0.02em] text-slate-900 dark:text-slate-50">{empresa}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Preço e situação de cada unidade. O que você ajusta aqui vale no Resumo, no Quadro Espelho e na Tabela de Preços, e não é gravado no Sienge.
            </DialogDescription>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cartões: os mesmos números da linha do Resumo, já com o que foi digitado */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">
          <Cartao
            rotulo="Valor do estoque" cor="bg-emerald-500" valor={formatCurrency(totais.valorEstoque)}
            sub={totais.comPreco + totais.estimadas === 0 ? "nenhuma unidade disponível com valor" : `${totais.comPreco} a preço de tabela${totais.estimadas > 0 ? ` · ${totais.estimadas} por estimativa` : ""}`}
            alerta={mudou(totais.valorEstoque, totaisSalvos.valorEstoque) ? `antes: ${formatCurrency(totaisSalvos.valorEstoque)} · ainda não salvo` : undefined}
          />
          <Cartao
            rotulo="Disponíveis" cor="bg-blue-500" valor={String(totais.qtDisp)}
            sub={(composicaoPorTipo(disponiveisContadas) || "nenhuma") + (foraDaContagem > 0 ? ` · +${foraDaContagem} só com preço` : "")}
            alerta={totais.qtDisp !== totaisSalvos.qtDisp ? `antes: ${totaisSalvos.qtDisp} · ainda não salvo` : undefined}
          />
          <Cartao
            rotulo="Reservadas" cor="bg-amber-500" valor={String(totais.qtResTec)}
            sub={totais.qtResTec === 0 ? "nenhuma" : `${composicaoPorTipo(reservadasContadas)}${totais.valorReservado > 0 ? ` · ${formatCurrency(totais.valorReservado)} em tabela` : ""} · não somam no valor`}
            alerta={totais.qtResTec !== totaisSalvos.qtResTec ? `antes: ${totaisSalvos.qtResTec} · ainda não salvo` : undefined}
          />
          <Cartao
            rotulo="Disponíveis sem preço" cor={semPreco > 0 ? "bg-rose-500" : "bg-slate-400"} valor={String(semPreco)}
            sub={semPreco === 0 ? "todas com preço de tabela" : totais.estimadas > 0 ? `${formatCurrency(totais.valorEstimado)} por estimativa${totais.semValor > 0 ? ` · ${totais.semValor} sem valor nenhum` : ""}` : "sem área ou fator: não somam nada"}
          />
        </div>
        <p className="px-6 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Sem preço, a unidade entra pela estimativa de sempre: área privativa × fator ({fator ? fator.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "sem fator"}) × CUB ({cub ? `${formatCurrency(cub)}/m²` : "indisponível"}{cubMes ? `, ${cubMes}` : ""}). O preço digitado entra no lugar dela.
        </p>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          {FILTROS.map(f => (
            <button key={f.chave} type="button" onClick={() => setFiltro(f.chave)} className={chip(filtro === f.chave)} title={f.dica}>
              {f.rotulo} <span className="font-normal">{linhas.filter(l => passaNoResto(l) && f.passa(l)).length}</span>
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <select value={grupo} onChange={e => setGrupo(e.target.value)} aria-label="Tipo de unidade" className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="">Todos os tipos</option>
            {grupos.map(g => <option key={g} value={g}>{g} ({linhas.filter(l => grupoDoTipo(l.tipo) === g).length})</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar unidade" aria-label="Buscar unidade" className="h-7 w-40 rounded-lg pl-7 text-xs md:text-xs" />
          </div>
          {!podeEditar && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Lock className="h-3.5 w-3.5" /> Somente leitura: alterar preço e situação é restrito a quem edita a Tabela de Preços.
            </span>
          )}
        </div>

        {/* Tabela */}
        <div className="min-h-0 flex-1 overflow-auto border-y border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr>
                {th("unidade", "Unidade", "pl-6 text-left")}
                {variosEmpreendimentos && th("empreendimento", "Empreendimento", "text-left")}
                {th("tipo", "Tipo", "text-left")}
                {th("pavimento", "Pav.", "text-left")}
                {th("area", "Área", "text-right")}
                {th("situacao", "Situação", "text-left")}
                {th("preco", "Preço de tabela", "text-right")}
                {th("m2", "R$/m²", "text-right")}
                {th("valor", "No estoque", "pr-6 text-right")}
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr><td colSpan={colunas} className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {daEmpresa.length === 0 ? "Nenhuma unidade desta empresa no cadastro do Sienge." : "Nenhuma unidade para os filtros atuais."}
                </td></tr>
              )}
              {visiveis.map((l, i) => {
                const id = l.unitId;
                const editavel = podeEditar && id !== null && l.enterpriseId !== null;
                const txt = id !== null ? precosTxt.get(id) : undefined;
                const invalido = id !== null && idsInvalidos.has(id);
                const precoMexido = id !== null && idsPreco.has(id);
                const sitMexida = id !== null && idsSit.has(id);
                const escolha: Pendente = (id !== null && sitPend.get(id)) || (id !== null && dados.situacoesManuais.get(id)) || "auto";
                const autor = id !== null ? dados.autores.get(id) : undefined;
                const disponivel = l.situacao === "Disponível";
                return (
                  <tr key={id ?? `s${i}`} className={`border-t border-slate-100 dark:border-slate-800 ${precoMexido || sitMexida ? "bg-amber-50/60 dark:bg-amber-500/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                    <td className="whitespace-nowrap py-1.5 pl-6 pr-3 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{l.unidade}</td>
                    {variosEmpreendimentos && <td className="max-w-[220px] truncate px-3 py-1.5 text-slate-600 dark:text-slate-400" title={l.empreendimento}>{l.empreendimento}</td>}
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 dark:text-slate-400">{l.tipo}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600 dark:text-slate-400">{l.pavimento || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{l.area ? `${numeroBR(l.area)} m²` : "—"}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_SITUACAO[l.situacao] || "#94a3b8" }} aria-hidden />
                        {editavel ? (
                          <select
                            value={escolha}
                            onChange={e => { const v = e.target.value as Pendente; setSitPend(prev => new Map(prev).set(id!, v)); }}
                            aria-label={`Situação da unidade ${l.unidade}`}
                            className={`h-8 min-w-[11.5rem] rounded-md border bg-white px-2 text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100 ${sitMexida ? "border-amber-400" : "border-slate-200 dark:border-slate-700"}`}
                          >
                            <option value="auto">{l.situacaoBase !== l.situacaoSienge ? "Tabela comercial" : "Sienge"} · {l.situacaoBase}</option>
                            {SITUACOES_MANUAIS.map(s => <option key={s} value={s}>{s} (manual)</option>)}
                          </select>
                        ) : (
                          <span className="text-slate-800 dark:text-slate-100">{l.situacao}</span>
                        )}
                      </div>
                      {l.origem !== "sienge" && (
                        <p className="mt-0.5 pl-4 text-[10px] text-slate-500 dark:text-slate-400" title={l.origem === "manual" && autor ? `Ajustada por ${quem(autor.por)} em ${dia(autor.em)}` : undefined}>
                          {l.origem === "manual" ? "ajuste manual" : "pela tabela comercial"} · no Sienge: {l.situacaoSienge}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {editavel ? (
                        <>
                          <InputReais
                            value={txt ?? (l.preco !== null ? numeroBR(l.preco) : "")}
                            placeholder="sem preço"
                            onChange={t => setPrecosTxt(prev => new Map(prev).set(id!, t))}
                            onKeyDown={e => { if (e.key === "Enter") salvar(); }}
                            aria-label={`Preço da unidade ${l.unidade}`}
                            aria-invalid={invalido}
                            className={`ml-auto h-8 w-40 [&_input]:h-8 [&_input]:text-xs md:[&_input]:text-xs ${invalido ? "[&_input]:border-red-400" : precoMexido ? "[&_input]:border-amber-400 [&_input]:bg-amber-50 dark:[&_input]:bg-amber-500/10" : ""}`}
                          />
                          {txt === undefined && l.origemPreco === "tabela-comercial" && <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">da tabela comercial</p>}
                          {invalido && <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-300/80">valor inválido</p>}
                        </>
                      ) : (
                        <span className="tabular-nums text-slate-800 dark:text-slate-100">{l.preco !== null ? formatCurrency(l.preco) : <span className="text-slate-500 dark:text-slate-400">sem preço</span>}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{l.preco && l.area ? formatCurrency(l.preco / l.area) : "—"}</td>
                    <td className="whitespace-nowrap py-1.5 pl-3 pr-6 text-right tabular-nums">
                      {!disponivel ? <span className="text-slate-400 dark:text-slate-500">—</span>
                        : l.preco !== null ? <span className="font-semibold text-slate-900 dark:text-slate-50">{formatCurrency(l.valorEstoque)}</span>
                        : l.estimado ? <span className="text-slate-600 dark:text-slate-400" title="Estimativa: área privativa × fator × CUB">≈ {formatCurrency(l.valorEstoque)}</span>
                        : <span className="text-amber-700 dark:text-amber-300" title={l.entraNaContagem ? "Sem preço e sem área ou fator para estimar" : "Este tipo de unidade só soma no estoque quando tem preço"}>{l.entraNaContagem ? "sem valor" : "só com preço"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          <p className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {visiveis.length} de {linhas.length} unidade(s) · na lista: <span className="font-semibold text-slate-900 dark:text-slate-50">{formatCurrency(totalVisivel)}</span> em estoque
          </p>
          <Link href="/comercial/tabela-precos" className="text-xs font-medium text-slate-700 underline decoration-dotted decoration-slate-400 underline-offset-4 transition-colors hover:text-primary dark:text-slate-300 dark:hover:text-white">Reajuste em lote e histórico de preços</Link>
          {podeEditar && (
            <div className="ml-auto flex items-center gap-2">
              {invalidos.length > 0 && <span className="text-xs text-red-600 dark:text-red-300/80">{invalidos.length} valor(es) inválido(s)</span>}
              {(precosTxt.size > 0 || sitPend.size > 0) && (
                <Button size="sm" variant="ghost" onClick={descartar} disabled={salvando}><Undo2 className="mr-1.5 h-3.5 w-3.5" />Descartar</Button>
              )}
              <Button size="sm" onClick={salvar} disabled={nMudancas === 0 || invalidos.length > 0 || salvando}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {salvando ? "Salvando..." : nMudancas > 0 ? `Salvar ${nMudancas} alteração(ões)` : "Salvar"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
