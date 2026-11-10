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
// Sala que não está no Sienge se cadastra aqui ("Adicionar sala"): fica em
// unidades_painel (src/lib/unidades-painel.ts) e conta no estoque igual.
// Abre já só com os apartamentos (Edielson, 10/11/2026); o seletor de tipo
// mostra os demais. "Liberar unidade" põe à venda no painel a unidade que no
// Sienge está reservada ou vendida (apartamento de sócio que voltou a ficar
// disponível): é a situação manual "Disponível", em qualquer empresa.

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
  grupoInicialDoModal, candidatasALiberar, situacaoParaLiberar, liberadaNoPainel,
  ORDEM_GRUPOS, SITUACOES_MANUAIS, type ContextoEstoque, type LinhaEstoque, type SituacaoManual,
} from "@/lib/estoque-resumo";
import {
  unidadesComPainel, precosComPainel, separarDuplicadas, noSienge, chaveDoNome, ehDoPainel, idDoPainel, idNoEstoque,
  SITUACOES_PAINEL, TIPOS_PAINEL, type SituacaoPainel, type UnidadePainel,
} from "@/lib/unidades-painel";
import type { ApiUnit } from "@/lib/comercial-utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, LockOpen, Pencil, Plus, Save, Search, Trash2, Undo2, X } from "lucide-react";

// ── Dados que o estoque usa além das unidades (preços, tabela comercial, situação manual) ──
export interface DadosEstoque {
  precos: Map<number, number>;                       // tabela de preços + preço das unidades do painel (id negativo)
  tabelasComerciais: Map<string, TabelaComercial>;
  situacoesManuais: Map<number, SituacaoManual>;
  autores: Map<number, { por: string; em: string }>;
  unidadesPainel: UnidadePainel[];                   // cadastradas só no painel (fora do Sienge)
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
  const [precosTabela, setPrecosTabela] = useState<Map<number, number>>(new Map());
  const [unidadesPainel, setUnidadesPainel] = useState<UnidadePainel[]>([]);
  const [tabelasComerciais, setTabelasComerciais] = useState<Map<string, TabelaComercial>>(new Map());
  const [situacoesManuais, setSituacoesManuais] = useState<Map<number, SituacaoManual>>(new Map());
  const [autores, setAutores] = useState<Map<number, { por: string; em: string }>>(new Map());
  const [podeEditar, setPodeEditar] = useState(false);

  // Cada leitura falha sozinha: sem preço ou sem situação manual, o Resumo cai
  // na regra de antes (Sienge + estimativa), nunca fica sem número.
  const recarregar = useCallback(async () => {
    const [p, t, s, u] = await Promise.all([
      lerJson<{ podeEditar?: boolean; precos?: { unitId: number; valor: number }[] }>("/api/tabela-precos"),
      lerJson<{ tabelas?: Record<string, Partial<TabelaComercial>> }>("/api/tabela-comercial"),
      lerJson<{ situacoes?: { unitId: number; situacao: string; atualizadoPor: string; atualizadoEm: string }[] }>("/api/situacao-unidades"),
      lerJson<{ unidades?: UnidadePainel[] }>("/api/unidades-painel"),
    ]);
    if (u) setUnidadesPainel(u.unidades || []);
    if (p) {
      setPrecosTabela(new Map((p.precos || []).map(x => [x.unitId, x.valor])));
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

  const precos = useMemo(() => precosComPainel(precosTabela, unidadesPainel), [precosTabela, unidadesPainel]);
  return useMemo(
    () => ({ precos, tabelasComerciais, situacoesManuais, autores, unidadesPainel, podeEditar, recarregar }),
    [precos, tabelasComerciais, situacoesManuais, autores, unidadesPainel, podeEditar, recarregar],
  );
}

// ── Modal ──
export type FiltroEstoque = "estoque" | "disponiveis" | "reservadas" | "fora" | "divergentes" | "painel" | "todas";

const FILTROS: { chave: FiltroEstoque; rotulo: string; dica: string; passa: (l: LinhaEstoque) => boolean }[] = [
  { chave: "estoque", rotulo: "Em estoque", dica: "Disponíveis e reservadas", passa: l => l.situacao === "Disponível" || l.situacao === "Reservado" },
  { chave: "disponiveis", rotulo: "Disponíveis", dica: "Só as disponíveis", passa: l => l.situacao === "Disponível" },
  { chave: "reservadas", rotulo: "Reservadas", dica: "Só as reservadas", passa: l => l.situacao === "Reservado" },
  { chave: "fora", rotulo: "Vendidas e outras", dica: "Vendidas, em proposta, permuta…", passa: l => l.situacao !== "Disponível" && l.situacao !== "Reservado" },
  { chave: "divergentes", rotulo: "Diferem do Sienge", dica: "Situação no painel diferente da do Sienge (ajuste manual ou tabela comercial)", passa: l => l.situacao !== l.situacaoSienge },
  { chave: "painel", rotulo: "Só no painel", dica: "Cadastradas no painel, fora do Sienge", passa: l => ehDoPainel(l.unitId) },
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
// Área digitada: "72,5", "1.234,56" ou "72.5" → número; vazio = 0; null = não dá para ler.
const lerArea = (texto: string): number | null => {
  const t = texto.trim().replace(/\s*m²?$/i, "");
  if (t === "") return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 && n < 100_000 ? Math.round(n * 100) / 100 : null;
};

// Formulário de cadastro/edição de unidade do painel.
interface FormPainel {
  id: number | null;           // null = nova
  empreendimento: string;
  unidade: string;
  tipo: string;
  areaTxt: string;
  situacao: SituacaoPainel;
  precoTxt: string;
}
const dia = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR"); };
// Quantas unidades a lista do "Liberar unidade" mostra antes de pedir o número.
const LIMITE_LIBERAR = 6;
// Como a unidade está hoje, para quem vai liberar: de onde vem a situação e o contrato que a segura.
const comoEsta = (l: LinhaEstoque) =>
  (l.origem === "manual" ? `ajuste manual: ${l.situacao}` : l.origem === "tabela" ? `tabela comercial: ${l.situacao}` : `no Sienge: ${l.situacaoSienge}`)
  + (l.contrato ? ` · contrato ${l.contrato}` : "");
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

export function EstoqueModal({ empresa, filtroInicial = "estoque", tipoInicial, unidades, dados, fator, cub, cubMes, onFechar }: {
  empresa: string;
  filtroInicial?: FiltroEstoque;
  tipoInicial?: string;         // grupo do tipo com que abre ("Sala comercial" ao clicar em Disp. Sala); sem ele, a regra de sempre
  unidades: ApiUnit[];          // todas as unidades carregadas; o modal fica com as da empresa
  dados: DadosEstoque;
  fator: number;                // fator da empresa em Configurações › Empreendimentos
  cub: number;                  // CUB do mês
  cubMes?: string;
  onFechar: () => void;
}) {
  const { podeEditar } = dados;
  // Unidades do Sienge da empresa + as cadastradas só no painel (sem as que já foram para o Sienge).
  const doSienge = useMemo(() => unidades.filter(u => u.companyName === empresa), [unidades, empresa]);
  const painelDaEmpresa = useMemo(() => dados.unidadesPainel.filter(p => p.empresa === empresa), [dados.unidadesPainel, empresa]);
  const daEmpresa = useMemo(() => unidadesComPainel(doSienge, painelDaEmpresa), [doSienge, painelDaEmpresa]);
  const duplicadas = useMemo(() => separarDuplicadas(painelDaEmpresa, doSienge).duplicadas, [painelDaEmpresa, doSienge]);
  const painelPorId = useMemo(() => new Map(painelDaEmpresa.map(p => [idNoEstoque(p.id), p])), [painelDaEmpresa]);
  // Empreendimentos da empresa no Sienge (onde se cadastra a sala do painel); o "COMERCIAL" primeiro.
  const empreendimentos = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const u of doSienge) if (!m.has(u.enterpriseName)) m.set(u.enterpriseName, u.enterpriseId ?? null);
    for (const p of painelDaEmpresa) if (!m.has(p.empreendimento)) m.set(p.empreendimento, p.enterpriseId);
    const comercial = (n: string) => (/COMERCIAL/i.test(n) ? 0 : 1);
    return Array.from(m.entries()).map(([nome, id]) => ({ nome, id }))
      .sort((a, b) => comercial(a.nome) - comercial(b.nome) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [doSienge, painelDaEmpresa]);

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
      const painel = ehDoPainel(l.unitId);
      if (l.unitId === null || (l.enterpriseId === null && !painel)) continue;
      if (precosTxt.has(l.unitId)) {
        const v = precoDigitado(precosTxt.get(l.unitId)!);
        if (v === "invalido") invalidos.push(l);
        else if (v !== l.precoTabela) mudancasPreco.push({ linha: l, valor: v });
      }
      if (sitPend.has(l.unitId)) {
        const p = sitPend.get(l.unitId)!;
        if (painel) {
          // Do painel: a situação é a do cadastro dela (não há "automático").
          if (p !== "auto" && p !== l.situacaoSienge) mudancasSit.push({ linha: l, situacao: p });
        } else {
          const situacao = p === "auto" ? null : p;
          if (situacao !== (dados.situacoesManuais.get(l.unitId) ?? null)) mudancasSit.push({ linha: l, situacao });
        }
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
      let nPrecos = 0, nSit = 0, nPainel = 0;
      const doPainel = (m: { linha: LinhaEstoque }) => ehDoPainel(m.linha.unitId);
      const precosSienge = mudancasPreco.filter(m => !doPainel(m));
      const sitSienge = mudancasSit.filter(m => !doPainel(m));
      if (precosSienge.length > 0) {
        nPrecos = await enviar("/api/tabela-precos", {
          tipo: "manual",
          descricao: `Valor digitado no Estoque do Resumo · ${empresa}`,
          itens: precosSienge.map(m => ({ unitId: m.linha.unitId, enterpriseId: m.linha.enterpriseId, unidade: m.linha.unidade, valor: m.valor })),
        });
      }
      if (sitSienge.length > 0) {
        nSit = await enviar("/api/situacao-unidades", {
          itens: sitSienge.map(m => ({ unitId: m.linha.unitId, enterpriseId: m.linha.enterpriseId, unidade: m.linha.unidade, situacao: m.situacao })),
        });
      }
      // Unidades do painel: preço e situação vão para o cadastro delas.
      const itensPainel = new Map<number, { id: number; preco?: number | null; situacao?: string }>();
      for (const m of mudancasPreco.filter(doPainel)) {
        const id = idDoPainel(m.linha.unitId!);
        itensPainel.set(id, { ...(itensPainel.get(id) ?? { id }), preco: m.valor });
      }
      for (const m of mudancasSit.filter(doPainel)) {
        const id = idDoPainel(m.linha.unitId!);
        itensPainel.set(id, { ...(itensPainel.get(id) ?? { id }), situacao: m.situacao ?? undefined });
      }
      if (itensPainel.size > 0) nPainel = await enviar("/api/unidades-painel", { itens: Array.from(itensPainel.values()) });
      // Recarrega ANTES de limpar o digitado, senão os campos piscam com o valor antigo.
      await dados.recarregar();
      descartar();
      const partes = [nPrecos > 0 ? `${nPrecos} preço(s)` : "", nSit > 0 ? `${nSit} situação(ões)` : "", nPainel > 0 ? `${nPainel} unidade(s) do painel` : ""].filter(Boolean);
      toast.success(partes.length > 0 ? `Salvo: ${partes.join(" e ")}. O Resumo já usa os novos valores.` : "Nada mudou.");
    } catch (e) {
      // Se o preço gravou e a situação não (ou o contrário), o que gravou já aparece como salvo.
      await dados.recarregar();
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  // ── Unidade cadastrada só no painel: cadastrar, editar, tirar ──
  const [form, setForm] = useState<FormPainel | null>(null);
  const [gravandoForm, setGravandoForm] = useState(false);
  const esquecerPendente = (unitId: number) => {
    setPrecosTxt(prev => { if (!prev.has(unitId)) return prev; const m = new Map(prev); m.delete(unitId); return m; });
    setSitPend(prev => { if (!prev.has(unitId)) return prev; const m = new Map(prev); m.delete(unitId); return m; });
  };
  const abrirNova = () => setForm({
    id: null, empreendimento: empreendimentos[0]?.nome ?? "", unidade: "", tipo: "Sala comercial",
    areaTxt: "", situacao: "Disponível", precoTxt: "",
  });
  const abrirEdicao = (p: UnidadePainel) => setForm({
    id: p.id, empreendimento: p.empreendimento, unidade: p.unidade, tipo: p.tipo,
    areaTxt: p.area ? numeroBR(p.area) : "", situacao: p.situacao, precoTxt: p.preco !== null ? numeroBR(p.preco) : "",
  });
  // O que impede gravar o formulário (null = pode gravar).
  const problemaForm = useMemo(() => {
    if (!form) return null;
    if (!form.empreendimento.trim()) return "Escolha o empreendimento.";
    if (!form.unidade.trim()) return "Informe o nome da unidade (ex.: SALA 08).";
    if (lerArea(form.areaTxt) === null) return "Área inválida.";
    if (precoDigitado(form.precoTxt) === "invalido") return "Preço inválido.";
    const enterpriseId = empreendimentos.find(e => e.nome === form.empreendimento)?.id ?? null;
    const noSiengeJa = noSienge({ enterpriseId, empreendimento: form.empreendimento, unidade: form.unidade }, doSienge);
    if (noSiengeJa) return `A ${noSiengeJa.name} já está no Sienge neste empreendimento: ajuste a de lá na lista.`;
    const repetida = painelDaEmpresa.find(p => p.id !== form.id && chaveDoNome(p.empreendimento) === chaveDoNome(form.empreendimento) && chaveDoNome(p.unidade) === chaveDoNome(form.unidade));
    if (repetida) return `A ${repetida.unidade} já está cadastrada no painel neste empreendimento.`;
    return null;
  }, [form, empreendimentos, doSienge, painelDaEmpresa]);

  const gravarForm = async () => {
    if (!form || problemaForm || gravandoForm || !podeEditar) return;
    setGravandoForm(true);
    try {
      const preco = precoDigitado(form.precoTxt);
      const campos = {
        empreendimento: form.empreendimento.trim(),
        enterpriseId: empreendimentos.find(e => e.nome === form.empreendimento)?.id ?? null,
        unidade: form.unidade.replace(/\s+/g, " ").trim().toUpperCase(),
        tipo: form.tipo,
        area: lerArea(form.areaTxt) ?? 0,
        situacao: form.situacao,
        preco: preco === "invalido" ? null : preco,
      };
      const r = form.id === null
        ? await fetch("/api/unidades-painel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa, ...campos }) })
        : await fetch("/api/unidades-painel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: [{ id: form.id, ...campos }] }) });
      const d = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(d.error || "Falha ao gravar a unidade.");
      if (form.id !== null) esquecerPendente(idNoEstoque(form.id));
      await dados.recarregar();
      // A lista abre só com apartamentos: passa a mostrar o tipo da unidade recém-cadastrada.
      if (form.id === null && grupo && grupoDoTipo(campos.tipo) !== grupo) setGrupo(grupoDoTipo(campos.tipo));
      toast.success(form.id === null ? `${campos.unidade} cadastrada no painel. Já conta no estoque do Resumo.` : `${campos.unidade} atualizada.`);
      setForm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar a unidade.");
    } finally {
      setGravandoForm(false);
    }
  };

  const tirar = async (p: UnidadePainel) => {
    if (!podeEditar) return;
    if (!window.confirm(`Tirar a ${p.unidade} (${p.empreendimento}) do painel? Ela deixa de contar no estoque. Dá para cadastrar de novo depois.`)) return;
    try {
      const r = await fetch(`/api/unidades-painel?id=${p.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(d.error || "Falha ao tirar a unidade.");
      esquecerPendente(idNoEstoque(p.id));
      if (form?.id === p.id) setForm(null);
      await dados.recarregar();
      toast.success(`${p.unidade} saiu do painel.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao tirar a unidade.");
    }
  };

  // ── Filtros e ordenação ──
  const [filtro, setFiltro] = useState<FiltroEstoque>(filtroInicial);
  // Tipo: abre só com os apartamentos (Edielson, 10/11/2026). Se a lista com que o
  // modal abre não tem apartamento (o estoque da Tesla é só sala, vaga e box), abre
  // com todos os tipos, senão viria vazia. Decidido uma vez, na abertura.
  // A coluna clicada no Resumo pode pedir o tipo (Disp. Ap., Disp. Sala), se a empresa tiver unidade dele.
  const [grupo, setGrupo] = useState(() =>
    tipoInicial && salvas.some(l => grupoDoTipo(l.tipo) === tipoInicial) ? tipoInicial
      : grupoInicialDoModal(salvas.filter(FILTROS.find(f => f.chave === filtroInicial)!.passa)));
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

  // ── Liberar para venda a unidade que no Sienge não está Disponível ──
  // (reserva técnica, apartamento de sócio que voltou a ficar à venda). Fica
  // pendente como as outras mudanças: Disponível à mão, gravado no "Salvar".
  const [liberando, setLiberando] = useState(false);
  const [buscaLiberar, setBuscaLiberar] = useState("");
  const candidatas = useMemo(
    () => (liberando ? candidatasALiberar(linhas, { grupo, busca: buscaLiberar }) : []),
    [liberando, linhas, grupo, buscaLiberar],
  );
  // Sem busca a lista traz só as reservadas (as mais prováveis); a vendida aparece
  // quando se digita o número — não fica um botão "Liberar" à toa em unidade de cliente.
  const buscandoLiberar = buscaLiberar.trim() !== "";
  const naListaLiberar = useMemo(
    () => (buscandoLiberar ? candidatas : candidatas.filter(l => l.situacao === "Reservado")),
    [buscandoLiberar, candidatas],
  );
  // Liberadas agora e ainda não salvas (dá para desfazer ali mesmo).
  const liberadasAgora = useMemo(
    () => mudancasSit
      .filter(m => !ehDoPainel(m.linha.unitId) && m.linha.situacao !== "Disponível"
        && (m.situacao === "Disponível" || (m.situacao === null && m.linha.situacaoBase === "Disponível")))
      .map(m => m.linha)
      .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true })),
    [mudancasSit],
  );
  const abrirLiberar = () => { setLiberando(true); setBuscaLiberar(""); };
  const liberar = (l: LinhaEstoque) => {
    if (l.unitId === null) return;
    const alvo = situacaoParaLiberar(l);
    setSitPend(prev => new Map(prev).set(l.unitId!, alvo));
    setBusca("");          // a linha liberada tem de aparecer na lista de baixo
    setBuscaLiberar("");
  };
  const desfazerLiberacao = (l: LinhaEstoque) =>
    setSitPend(prev => { const m = new Map(prev); m.delete(l.unitId!); return m; });

  // ── Cartões ──
  // Disponíveis fora da conta (vaga, box…): o Resumo não conta e só somam com preço.
  const outrasDisponiveis = linhas.filter(l => l.situacao === "Disponível" && !l.entraNaContagem);
  // O que a coluna Disp. / Res.Téc. conta: "3 apartamentos · 2 salas comerciais".
  const contadasDisp = linhas.filter(l => l.situacao === "Disponível" && l.entraNaContagem);
  const contadasRes = linhas.filter(l => l.situacao === "Reservado" && l.entraNaContagem);
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
              Preço e situação de cada unidade. O que você ajusta aqui vale no Resumo, no Quadro Espelho e na Tabela de Preços, e não é gravado no Sienge. Sala que não está no Sienge entra por &ldquo;Adicionar sala&rdquo;; unidade reservada ou vendida no Sienge que voltou a ficar à venda, por &ldquo;Liberar unidade&rdquo;.
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
            sub={`${contadasDisp.length > 0 ? composicaoPorTipo(contadasDisp) : "nenhum apartamento ou sala"}${outrasDisponiveis.length > 0 ? ` · fora da conta: ${composicaoPorTipo(outrasDisponiveis)}` : ""}`}
            alerta={totais.qtDisp !== totaisSalvos.qtDisp ? `antes: ${totaisSalvos.qtDisp} · ainda não salvo` : undefined}
          />
          <Cartao
            rotulo="Reservadas" cor="bg-amber-500" valor={String(totais.qtResTec)}
            sub={totais.qtResTec === 0 ? "nenhum apartamento ou sala reservado" : `${composicaoPorTipo(contadasRes)}${totais.valorReservado > 0 ? ` · ${formatCurrency(totais.valorReservado)} em tabela` : ""} · não somam no valor`}
            alerta={totais.qtResTec !== totaisSalvos.qtResTec ? `antes: ${totaisSalvos.qtResTec} · ainda não salvo` : undefined}
          />
          <Cartao
            rotulo="Sem preço" cor={semPreco > 0 ? "bg-rose-500" : "bg-slate-400"} valor={String(semPreco)}
            sub={totais.qtDisp === 0 ? "nenhum apartamento ou sala disponível" : semPreco === 0 ? "todos com preço de tabela" : totais.estimadas > 0 ? `${formatCurrency(totais.valorEstimado)} por estimativa${totais.semValor > 0 ? ` · ${totais.semValor} sem valor nenhum` : ""}` : "sem área ou fator: não somam nada"}
          />
        </div>
        <p className="px-6 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Sem preço, apartamento e sala comercial entram pela estimativa: área privativa × fator ({fator ? fator.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "sem fator"}) × CUB ({cub ? `${formatCurrency(cub)}/m²` : "indisponível"}{cubMes ? `, ${cubMes}` : ""}). O preço digitado entra no lugar dela. Vaga e box só entram no valor com preço.
        </p>
        {duplicadas.length > 0 && (
          <div className="mx-6 mt-2 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {duplicadas.map(d => (
              <p key={d.painel.id}>
                A <b>{d.painel.unidade}</b> cadastrada no painel ({d.painel.empreendimento}) agora existe no Sienge como <b>{d.sienge.name}</b>. O estoque já usa a do Sienge e a do painel não conta mais.
                {podeEditar && <> <button type="button" onClick={() => tirar(d.painel)} className="font-semibold underline underline-offset-2">Tirar a do painel</button></>}
              </p>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          {FILTROS.filter(f => f.chave !== "painel" || filtro === "painel" || linhas.some(l => ehDoPainel(l.unitId))).map(f => (
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
              <Lock className="h-3.5 w-3.5" /> Somente leitura: preço e situação são alterados por administradores e por quem edita a Tabela de Preços.
            </span>
          )}
          {podeEditar && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm" variant="outline" className={`h-7 text-xs ${liberando ? "border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800" : ""}`}
                onClick={() => (liberando ? setLiberando(false) : abrirLiberar())} disabled={form !== null} aria-pressed={liberando}
                title="Pôr à venda no painel uma unidade que no Sienge está reservada ou vendida (ex.: apartamento de sócio que voltou a ficar disponível). O Sienge não muda."
              >
                <LockOpen className="mr-1 h-3.5 w-3.5" />Liberar unidade
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setLiberando(false); abrirNova(); }} disabled={form !== null} title="Cadastrar uma sala que não está no Sienge; ela conta no estoque do Resumo">
                <Plus className="mr-1 h-3.5 w-3.5" />Adicionar sala
              </Button>
            </div>
          )}
        </div>

        {/* Cadastro / edição de unidade só no painel */}
        {form && (
          <div className="mx-6 mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
              {form.id === null ? "Nova unidade só no painel" : `Editar ${painelDaEmpresa.find(x => x.id === form.id)?.unidade ?? "unidade"}`}
              <span className="font-normal text-slate-500 dark:text-slate-400"> · não vai para o Sienge. Quando for vendida, cadastre no Sienge com o mesmo nome e o painel passa a usar a de lá.</span>
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)]">
              <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 col-span-2 lg:col-span-1">Empreendimento
                {empreendimentos.length > 0 ? (
                  <select value={form.empreendimento} onChange={e => setForm({ ...form, empreendimento: e.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {empreendimentos.map(e => <option key={e.nome} value={e.nome}>{e.nome}</option>)}
                  </select>
                ) : (
                  <Input value={form.empreendimento} onChange={e => setForm({ ...form, empreendimento: e.target.value })} placeholder="Nome do empreendimento" className="h-8 bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs md:text-xs" />
                )}
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Unidade
                <Input value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })} onKeyDown={e => { if (e.key === "Enter") gravarForm(); }} placeholder="SALA 08" autoFocus className="h-8 bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs md:text-xs" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Tipo
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {TIPOS_PAINEL.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Área privativa (m²)
                <Input value={form.areaTxt} onChange={e => setForm({ ...form, areaTxt: e.target.value })} onKeyDown={e => { if (e.key === "Enter") gravarForm(); }} inputMode="decimal" placeholder="0,00" className="h-8 bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 text-right text-xs tabular-nums md:text-xs" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Situação
                <select value={form.situacao} onChange={e => setForm({ ...form, situacao: e.target.value as SituacaoPainel })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {SITUACOES_PAINEL.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 col-span-2 lg:col-span-1">Preço de tabela
                <InputReais value={form.precoTxt} onChange={t => setForm({ ...form, precoTxt: t })} onKeyDown={e => { if (e.key === "Enter") gravarForm(); }} placeholder="vazio = estimativa" className="h-8 [&_input]:h-8 [&_input]:text-xs md:[&_input]:text-xs" />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {problemaForm && (form.unidade.trim() !== "" || !problemaForm.startsWith("Informe o nome")) && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300">{problemaForm}</span>
              )}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={gravandoForm}>Cancelar</Button>
                <Button size="sm" onClick={gravarForm} disabled={problemaForm !== null || gravandoForm}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {gravandoForm ? "Gravando..." : form.id === null ? "Cadastrar no painel" : "Salvar unidade"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Liberar para venda a unidade que no Sienge está reservada ou vendida */}
        {liberando && podeEditar && (
          <div className="mx-6 mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <p className="min-w-[16rem] flex-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                Liberar unidade para venda
                <span className="font-normal text-slate-500 dark:text-slate-400"> · para a unidade que no Sienge está reservada ou em nome de sócio e voltou a ficar à venda. Ela passa a contar como Disponível no Resumo, no Quadro Espelho e na Tabela de Preços; o Sienge não muda.</span>
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input value={buscaLiberar} onChange={e => setBuscaLiberar(e.target.value)} placeholder="Número da unidade" aria-label="Buscar unidade para liberar" autoFocus className="h-8 w-48 bg-white pl-7 text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100 md:text-xs" />
              </div>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setLiberando(false)}>Fechar</Button>
            </div>
            {naListaLiberar.length > 0 && (
              <ul className="mt-2 grid gap-1.5 lg:grid-cols-2">
                {naListaLiberar.slice(0, LIMITE_LIBERAR).map(l => (
                  <li key={l.unitId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_SITUACAO[l.situacao] || "#94a3b8" }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-400" title={`${l.unidade} · ${l.empreendimento} · ${comoEsta(l)}`}>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{l.unidade}</span>
                      {` · ${l.tipo}${l.pavimento ? ` · ${l.pavimento}` : ""}${l.area ? ` · ${numeroBR(l.area)} m²` : ""} · ${comoEsta(l)}`}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => liberar(l)} aria-label={`Liberar a unidade ${l.unidade} para venda`}>Liberar</Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {candidatas.length === 0
                ? (buscandoLiberar ? `Nenhuma unidade com “${buscaLiberar.trim()}” para liberar` : "Nenhuma unidade para liberar: todas já estão disponíveis")
                : buscandoLiberar
                  ? (naListaLiberar.length > LIMITE_LIBERAR ? `Aparecem ${LIMITE_LIBERAR} de ${naListaLiberar.length}: digite mais do número` : `${naListaLiberar.length} unidade(s) com “${buscaLiberar.trim()}”`)
                  : `${naListaLiberar.length === 0 ? "Nenhuma reservada no Sienge" : naListaLiberar.length > LIMITE_LIBERAR ? `Aparecem ${LIMITE_LIBERAR} das ${naListaLiberar.length} reservadas no Sienge` : `${naListaLiberar.length} reservada(s) no Sienge`}${
                      candidatas.length > naListaLiberar.length ? ` · outras ${candidatas.length - naListaLiberar.length} vendidas ou em outra situação (ex.: apartamento de sócio): digite o número para achar` : ""}`}
              {grupo ? ` · tipo ${grupo} (para liberar vaga ou sala, troque o tipo no filtro acima)` : ""}.
            </p>
            {liberadasAgora.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                Liberadas agora:
                {liberadasAgora.map(l => (
                  <span key={l.unitId} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 py-0.5 pl-1.5 pr-1 font-semibold tabular-nums dark:border-amber-500/40 dark:bg-amber-500/10">
                    {l.unidade}
                    <button type="button" onClick={() => desfazerLiberacao(l)} aria-label={`Desfazer a liberação da unidade ${l.unidade}`} title="Desfazer" className="rounded p-0.5 transition-colors hover:bg-amber-200 dark:hover:bg-amber-500/30"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <span>· confira o preço na linha de cada uma e clique em Salvar.</span>
              </p>
            )}
          </div>
        )}

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
                  {daEmpresa.length === 0 ? "Nenhuma unidade desta empresa no Sienge nem no painel." : "Nenhuma unidade para os filtros atuais."}
                </td></tr>
              )}
              {visiveis.map((l, i) => {
                const id = l.unitId;
                const doPainel = id !== null ? painelPorId.get(id) : undefined;
                const editavel = podeEditar && id !== null && (l.enterpriseId !== null || doPainel !== undefined);
                const txt = id !== null ? precosTxt.get(id) : undefined;
                const invalido = id !== null && idsInvalidos.has(id);
                const precoMexido = id !== null && idsPreco.has(id);
                const sitMexida = id !== null && idsSit.has(id);
                const escolha: Pendente = (id !== null && sitPend.get(id)) || (doPainel ? doPainel.situacao : (id !== null && dados.situacoesManuais.get(id)) || "auto");
                const autor = id !== null ? dados.autores.get(id) : undefined;
                const disponivel = l.situacao === "Disponível";
                return (
                  <tr key={id ?? `s${i}`} className={`border-t border-slate-100 dark:border-slate-800 ${precoMexido || sitMexida ? "bg-amber-50/60 dark:bg-amber-500/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                    <td className="whitespace-nowrap py-1.5 pl-6 pr-3 font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {doPainel ? (
                        <div className="flex items-center gap-1.5">
                          <span>{l.unidade}</span>
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200" title={`Cadastrada no painel por ${quem(doPainel.criadoPor)} em ${dia(doPainel.criadoEm)}. Não existe no Sienge.`}>só no painel</span>
                          {podeEditar && (
                            <>
                              <button type="button" onClick={() => abrirEdicao(doPainel)} aria-label={`Editar ${l.unidade}`} title="Editar nome, área e tipo" className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => tirar(doPainel)} aria-label={`Tirar ${l.unidade} do painel`} title="Tirar do painel" className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      ) : l.unidade}
                    </td>
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
                            {doPainel ? SITUACOES_PAINEL.map(s => <option key={s} value={s}>{s}</option>) : (
                              <>
                                <option value="auto">{l.situacaoBase !== l.situacaoSienge ? "Tabela comercial" : "Sienge"} · {l.situacaoBase}</option>
                                {SITUACOES_MANUAIS.map(s => <option key={s} value={s}>{s} (manual)</option>)}
                              </>
                            )}
                          </select>
                        ) : (
                          <span className="text-slate-800 dark:text-slate-100">{l.situacao}</span>
                        )}
                      </div>
                      {l.origem !== "sienge" && l.origem !== "painel" && (
                        <p className="mt-0.5 pl-4 text-[10px] text-slate-500 dark:text-slate-400" title={l.origem === "manual" && autor ? `Ajustada por ${quem(autor.por)} em ${dia(autor.em)}` : undefined}>
                          {l.origem === "manual" ? (liberadaNoPainel(l) ? "liberada no painel" : "ajuste manual") : "pela tabela comercial"} · no Sienge: {l.situacaoSienge}
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
                        : <span className="text-amber-700 dark:text-amber-300" title={l.entraNaContagem ? "Sem preço e sem área ou fator para estimar" : "Só apartamento e sala comercial são estimados; este tipo de unidade soma no estoque quando tem preço"}>{l.entraNaContagem ? "sem valor" : "só com preço"}</span>}
                    </td>
                  </tr>
                );
              })}
              {podeEditar && !liberando && form === null && (filtro === "disponiveis" || filtro === "estoque") && (
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td colSpan={colunas} className="px-6 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Falta alguma unidade que está à venda?{" "}
                    <button type="button" onClick={abrirLiberar} className="font-semibold text-slate-700 underline decoration-dotted decoration-slate-400 underline-offset-4 transition-colors hover:text-primary dark:text-slate-200 dark:hover:text-white">Liberar unidade</button>
                    {" "}põe como disponível a que no Sienge está reservada ou vendida.
                  </td>
                </tr>
              )}
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
