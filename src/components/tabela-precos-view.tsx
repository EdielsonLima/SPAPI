"use client";

// Tabela de Preços (Comercial) — preço de tabela das unidades não vendidas.
// Vive no painel, não no Sienge: cadastrar valor dentro de cada unidade no ERP
// é trabalhoso. O Quadro Espelho lê daqui quando o botão "Valores" está ligado.
//
// Fluxo de edição: digitar na coluna Preço acumula alterações pendentes, que
// só vão ao banco em "Salvar". Reajuste em lote (percentual, valor fixo, CUB)
// e preenchimento por R$/m² passam por uma prévia antes de gravar. Toda
// gravação deixa histórico (quem, quando, de quanto para quanto).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { SortableHead, useTableSort } from "@/components/ui/sortable-head";
import { PainelLateral, CabecalhoPainel } from "@/components/painel-detalhe";
import { useComercial } from "@/components/comercial-provider";
import { formatCurrency, formatCompactCurrency } from "@/lib/dashboard-utils";
import { pavimentoDaUnidade, inferUnitTypeFromName } from "@/lib/comercial-utils";
import {
  aplicarReajuste, descreverReajuste, lerDecimalBR, lerValorBR, precoPorM2, semVenda, validarReajuste,
  mascararValorBR, completarCentavosBR, type Reajuste,
} from "@/lib/tabela-precos";
import { normalizarTabelaComercial, aplicarTabelaComercial, tabelaComercialPara, nomeUnidade, TABELA_COMERCIAL_VAZIA, type TabelaComercial } from "@/lib/tabela-comercial";
import { situacaoDaUnidade } from "@/lib/situacao-unidade";

// Situação do Quadro a partir do estoque do Sienge (sem permuta: a tela não tem o contrato).
const situacaoBase = (status: string) => situacaoDaUnidade(status, false);
import { Building2, History, Lock, Percent, Save, Search, Tag, TrendingUp, Undo2, Wand2 } from "lucide-react";

type Linha = {
  unitId: number;
  enterpriseId: number;
  enterprise: string;
  unidade: string;
  tipo: string;
  pavimento: string;
  area: number;
  status: string;
  preco: number | null;
};

type RegistroHistorico = {
  lote: string; unitId: number; unidade: string; valorAnterior: number | null; valorNovo: number | null;
  tipo: string; descricao: string; criadoPor: string; criadoEm: string;
};

type Modo = "percentual" | "fixo" | "cub" | "m2";
type CubMes = { ano: number; mes: number; valor_m2: number };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const rotuloMes = (c: CubMes) => `${MESES[c.mes - 1]}/${c.ano}`;
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const numeroBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quem = (s: string) => s.replace(/\s*<.*>$/, "");

// Campo de valor em reais: "R$" fixo à esquerda, separador de milhar enquanto
// digita e centavos completados ao sair. O cursor fica depois do mesmo dígito
// em que estava — sem isso, cada ponto inserido o jogaria para o fim.
function InputReais({ value, onChange, permitirNegativo = false, className = "", ...resto }: {
  value: string; onChange: (texto: string) => void; permitirNegativo?: boolean; className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
      <Input
        {...resto}
        inputMode="decimal"
        value={value}
        className="h-full w-full pl-8 text-right tabular-nums"
        onChange={e => {
          const el = e.target;
          const cursor = el.selectionStart ?? el.value.length;
          const antes = el.value.slice(0, cursor);
          const digitosAntes = antes.replace(/[^\d,]/g, "").length;
          const novo = mascararValorBR(el.value, permitirNegativo);
          onChange(novo);
          requestAnimationFrame(() => {
            let pos = 0, vistos = 0;
            const inicio = novo.startsWith("-") && antes.trim().startsWith("-") ? 1 : 0;
            pos = inicio;
            while (pos < novo.length && vistos < digitosAntes) { if (/[\d,]/.test(novo[pos])) vistos++; pos++; }
            try { el.setSelectionRange(pos, pos); } catch { /* campo já desmontado */ }
          });
        }}
        onBlur={e => { const c = completarCentavosBR(value, permitirNegativo); if (c !== value) onChange(c); resto.onBlur?.(e); }}
      />
    </div>
  );
}

export function TabelaPrecosView() {
  const { apiUnits, precosTabela, tabelasComerciais, podeEditarPrecos, recarregarPrecos, cubData } = useComercial();

  // ── Filtros ──
  const empreendimentos = useMemo(
    () => Array.from(new Set(apiUnits.filter(u => u.id && u.enterpriseId).map(u => u.enterpriseName))).filter(Boolean).sort(),
    [apiUnits],
  );
  const [empreendimento, setEmpreendimento] = useState("");
  useEffect(() => {
    if (!empreendimento && empreendimentos.length > 0) {
      // Com um só empreendimento (hoje, o LEVEN ONE da SPE) ele já entra escolhido.
      const comMaisUnidades = [...empreendimentos].sort((a, b) =>
        apiUnits.filter(u => u.enterpriseName === b).length - apiUnits.filter(u => u.enterpriseName === a).length)[0];
      setEmpreendimento(comMaisUnidades);
    }
  }, [empreendimentos, empreendimento, apiUnits]);
  const [tipo, setTipo] = useState("Apartamento");
  const [soNaoVendidas, setSoNaoVendidas] = useState(true);
  const [busca, setBusca] = useState("");

  const linhasEmpreendimento: Linha[] = useMemo(() => apiUnits
    .filter(u => u.enterpriseName === empreendimento && u.id && u.enterpriseId)
    .map(u => ({
      unitId: u.id!,
      enterpriseId: u.enterpriseId!,
      enterprise: u.enterpriseName,
      unidade: u.name,
      tipo: u.propertyType || inferUnitTypeFromName(u.name),
      pavimento: pavimentoDaUnidade(u.floor, u.name),
      area: u.privateArea || 0,
      status: u.commercialStock,
      preco: precosTabela.get(u.id!) ?? null,
    })), [apiUnits, empreendimento, precosTabela]);

  const tipos = useMemo(() => Array.from(new Set(linhasEmpreendimento.map(l => l.tipo))).sort(), [linhasEmpreendimento]);
  useEffect(() => { if (tipos.length > 0 && tipo && !tipos.includes(tipo)) setTipo(""); }, [tipos, tipo]);

  // ── Tabela comercial manual (do diretor comercial) do empreendimento ──
  const { chave: chaveEmp, tabela: tcSalva } = useMemo(() => tabelaComercialPara(empreendimento, tabelasComerciais), [empreendimento, tabelasComerciais]);
  const [tc, setTc] = useState<TabelaComercial>(TABELA_COMERCIAL_VAZIA);
  const [historicoVersao, setHistoricoVersao] = useState(0); // "Aplicar preços" recarrega o histórico, definido mais abaixo
  const [tcPrecosTxt, setTcPrecosTxt] = useState<Map<string, string>>(new Map());
  useEffect(() => { setTc(tcSalva ?? TABELA_COMERCIAL_VAZIA); setTcPrecosTxt(new Map()); }, [tcSalva, empreendimento]);
  const tcEfetiva = useMemo(() => {
    const precos = { ...tc.precos };
    tcPrecosTxt.forEach((txt, unidade) => { const v = lerValorBR(txt.trim()); if (txt.trim() === "") delete precos[unidade]; else if (v !== null && v > 0) precos[unidade] = v; });
    return normalizarTabelaComercial({ ...tc, precos });
  }, [tc, tcPrecosTxt]);
  const tcAlterada = JSON.stringify(tcEfetiva) !== JSON.stringify(tcSalva ?? TABELA_COMERCIAL_VAZIA);
  const tcExiste = !!tcSalva || tcAlterada;
  const [salvandoTc, setSalvandoTc] = useState(false);
  const alternarDisponivel = (unidade: string) => setTc(t => {
    const u = nomeUnidade(unidade);
    const disponiveis = t.disponiveis.includes(u) ? t.disponiveis.filter(x => x !== u) : [...t.disponiveis, u];
    return { ...t, disponiveis };
  });
  const salvarTc = async () => {
    setSalvandoTc(true);
    try {
      const r = await fetch("/api/tabela-comercial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: chaveEmp, dados: tcEfetiva }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha ao salvar a tabela comercial.");
      toast.success("Tabela comercial salva. O Quadro e o 3D já usam esta lista.");
      await recarregarPrecos();
      setTcPrecosTxt(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally { setSalvandoTc(false); }
  };
  // Leva os preços da tabela comercial para a tabela de preços do painel (com histórico).
  const aplicarPrecosTc = async () => {
    const itens = linhasEmpreendimento
      .filter(l => tcEfetiva.precos[nomeUnidade(l.unidade)] > 0 && tcEfetiva.precos[nomeUnidade(l.unidade)] !== l.preco)
      .map(l => ({ unitId: l.unitId, enterpriseId: l.enterpriseId, unidade: l.unidade, valor: tcEfetiva.precos[nomeUnidade(l.unidade)] }));
    if (itens.length === 0) { toast.message("A tabela de preços já tem os valores da tabela comercial."); return; }
    setSalvandoTc(true);
    try {
      const r = await fetch("/api/tabela-precos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "manual", descricao: `Tabela comercial: ${tcEfetiva.referencia || "manual"}`, itens }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha ao aplicar.");
      toast.success(`${d.alteradas} preço(s) levados da tabela comercial para a tabela de preços.`);
      await recarregarPrecos();
      setHistoricoVersao(v => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar.");
    } finally { setSalvandoTc(false); }
  };

  const linhas = useMemo(() => linhasEmpreendimento.filter(l => {
    if (tipo && l.tipo !== tipo) return false;
    if (soNaoVendidas && !semVenda(l.status) && !tcEfetiva.disponiveis.includes(nomeUnidade(l.unidade))) return false;
    if (busca && !l.unidade.toLowerCase().includes(busca.toLowerCase().trim())) return false;
    return true;
  }), [linhasEmpreendimento, tipo, soNaoVendidas, busca, tcEfetiva]);

  // ── Edição inline (pendente até salvar) ──
  const [pendentes, setPendentes] = useState<Map<number, string>>(new Map());
  const [salvando, setSalvando] = useState(false);
  const valorEfetivo = (l: Linha): number | null => {
    if (!pendentes.has(l.unitId)) return l.preco;
    const t = pendentes.get(l.unitId)!.trim();
    return t === "" ? null : lerValorBR(t);
  };
  const pendenteInvalido = (l: Linha) => {
    if (!pendentes.has(l.unitId)) return false;
    const t = pendentes.get(l.unitId)!.trim();
    if (t === "") return false;
    const v = lerValorBR(t);
    return v === null || !(v > 0);
  };
  const mudancasReais = linhasEmpreendimento.filter(l => pendentes.has(l.unitId) && valorEfetivo(l) !== l.preco);
  const temInvalido = linhasEmpreendimento.some(pendenteInvalido);

  const salvarPendentes = async () => {
    if (mudancasReais.length === 0 || temInvalido) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/tabela-precos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "manual",
          itens: mudancasReais.map(l => ({ unitId: l.unitId, enterpriseId: l.enterpriseId, unidade: l.unidade, valor: valorEfetivo(l) })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha ao salvar.");
      toast.success(`${d.alteradas} preço(s) gravado(s).`);
      // Recarrega ANTES de limpar o digitado: ao contrário, o campo pisca
      // vazio até a resposta chegar.
      await recarregarPrecos();
      setPendentes(new Map());
      carregarHistorico();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  // ── Seleção ──
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  useEffect(() => { setSelecionadas(new Set()); setPendentes(new Map()); }, [empreendimento]);
  const todasVisiveisMarcadas = linhas.length > 0 && linhas.every(l => selecionadas.has(l.unitId));
  const alternarTodas = () => setSelecionadas(prev => {
    const n = new Set(prev);
    if (todasVisiveisMarcadas) linhas.forEach(l => n.delete(l.unitId));
    else linhas.forEach(l => n.add(l.unitId));
    return n;
  });
  const alternar = (id: number) => setSelecionadas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const linhasSelecionadas = linhasEmpreendimento
    .filter(l => selecionadas.has(l.unitId))
    .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true }));

  // ── Ordenação ──
  type Coluna = "unidade" | "tipo" | "pavimento" | "area" | "status" | "preco" | "m2";
  const { sorted, sortProps } = useTableSort<Linha, Coluna>(linhas, {
    unidade: l => l.unidade,
    tipo: l => l.tipo,
    pavimento: l => parseInt(l.pavimento, 10) || l.pavimento,
    area: l => l.area,
    status: l => l.status,
    preco: l => valorEfetivo(l) ?? undefined,
    m2: l => { const v = valorEfetivo(l); return v && l.area ? v / l.area : undefined; },
  }, "unidade");

  // ── Indicadores ──
  const naoVendidas = linhasEmpreendimento.filter(l => (tcExiste ? aplicarTabelaComercial(situacaoBase(l.status), l.unidade, tcEfetiva) === "Disponível" || (semVenda(l.status) && !tcExiste) : semVenda(l.status)) && (!tipo || l.tipo === tipo));
  const comPreco = naoVendidas.filter(l => l.preco !== null);
  const disponiveisComPreco = comPreco.filter(l => (tcExiste ? aplicarTabelaComercial(situacaoBase(l.status), l.unidade, tcEfetiva) : situacaoBase(l.status)) === "Disponível");
  const somaDisponiveis = disponiveisComPreco.reduce((s, l) => s + (l.preco || 0), 0);
  const areaComPreco = comPreco.reduce((s, l) => s + l.area, 0);
  const m2Medio = areaComPreco ? comPreco.reduce((s, l) => s + (l.preco || 0), 0) / areaComPreco : 0;

  // ── Histórico ──
  const [historico, setHistorico] = useState<RegistroHistorico[]>([]);
  const carregarHistorico = useCallback(() => {
    fetch("/api/tabela-precos/historico").then(r => r.ok ? r.json() : null)
      .then(d => setHistorico(d?.historico || [])).catch(() => {});
  }, []);
  useEffect(() => { carregarHistorico(); }, [carregarHistorico, historicoVersao]);
  const idsDoEmpreendimento = useMemo(() => new Set(linhasEmpreendimento.map(l => l.unitId)), [linhasEmpreendimento]);
  const lotes = useMemo(() => {
    const m = new Map<string, RegistroHistorico[]>();
    historico.filter(h => idsDoEmpreendimento.has(h.unitId)).forEach(h => {
      if (!m.has(h.lote)) m.set(h.lote, []);
      m.get(h.lote)!.push(h);
    });
    return Array.from(m.values()).slice(0, 15);
  }, [historico, idsDoEmpreendimento]);
  const [historicoUnidade, setHistoricoUnidade] = useState<Linha | null>(null);

  // ── Reajuste / preenchimento em lote ──
  const [dialogo, setDialogo] = useState(false);
  const [modo, setModo] = useState<Modo>("percentual");
  const [entrada, setEntrada] = useState("");
  const [cubMeses, setCubMeses] = useState<CubMes[]>([]);
  const [cubBaseTxt, setCubBaseTxt] = useState("");
  const [cubNovoTxt, setCubNovoTxt] = useState("");
  const [cubRotulo, setCubRotulo] = useState("");
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!dialogo || modo !== "cub" || cubMeses.length > 0) return;
    fetch("/api/indicadores").then(r => r.ok ? r.json() : null).then(d => {
      const rows: CubMes[] = (d?.cub?.rows || []).filter((c: CubMes) => c.valor_m2 > 0);
      setCubMeses(rows);
      if (rows.length >= 2 && !cubBaseTxt && !cubNovoTxt) {
        const a = rows[rows.length - 2], b = rows[rows.length - 1];
        setCubBaseTxt(numeroBR(a.valor_m2)); setCubNovoTxt(numeroBR(b.valor_m2));
        setCubRotulo(`${rotuloMes(a)} → ${rotuloMes(b)}`);
      } else if (rows.length < 2 && !cubNovoTxt && cubData?.currentValue) {
        // Sem série histórica: ao menos o CUB atual (o mesmo do painel) já vem como "novo".
        setCubNovoTxt(numeroBR(cubData.currentValue));
      }
    }).catch(() => {});
  }, [dialogo, modo, cubMeses.length, cubBaseTxt, cubNovoTxt, cubData]);

  const reajuste: Reajuste | null = useMemo(() => {
    if (modo === "percentual") { const p = lerDecimalBR(entrada); return p === null ? null : { tipo: "percentual", percentual: p }; }
    if (modo === "fixo") { const v = lerValorBR(entrada); return v === null ? null : { tipo: "fixo", valor: v }; }
    if (modo === "cub") {
      const b = lerValorBR(cubBaseTxt), n = lerValorBR(cubNovoTxt);
      return b === null || n === null ? null : { tipo: "cub", cubBase: b, cubNovo: n, rotulo: cubRotulo || undefined };
    }
    return null;
  }, [modo, entrada, cubBaseTxt, cubNovoTxt, cubRotulo]);
  const valorM2 = modo === "m2" ? lerValorBR(entrada) : null;

  // Prévia: reajuste só vale para quem já tem preço; R$/m² vale para quem tem área.
  const previa = useMemo(() => linhasSelecionadas.map(l => {
    let novo: number | null = null;
    if (modo === "m2") novo = valorM2 && valorM2 > 0 ? precoPorM2(l.area, valorM2) : null;
    else if (reajuste && !validarReajuste(reajuste) && l.preco !== null) novo = aplicarReajuste(l.preco, reajuste);
    return { ...l, novo };
  }), [linhasSelecionadas, modo, valorM2, reajuste]);
  const afetadas = previa.filter(p => p.novo !== null && p.novo !== p.preco);
  const ignoradas = previa.length - previa.filter(p => p.novo !== null).length;
  const erroPrevia = modo === "m2"
    ? (valorM2 === null || !(valorM2 > 0) ? "Informe o valor do m²." : null)
    : validarReajuste(reajuste);
  const negativa = afetadas.find(p => !(p.novo! > 0));
  const totalAntes = afetadas.reduce((s, p) => s + (p.preco || 0), 0);
  const totalDepois = afetadas.reduce((s, p) => s + (p.novo || 0), 0);

  const abrirDialogo = (m: Modo) => { setModo(m); setEntrada(""); setDialogo(true); };

  const confirmar = async () => {
    if (erroPrevia || negativa || afetadas.length === 0) return;
    setAplicando(true);
    try {
      const r = modo === "m2"
        ? await fetch("/api/tabela-precos", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: "m2", descricao: `Preenchimento por R$ ${numeroBR(valorM2!)}/m²`,
              itens: afetadas.map(p => ({ unitId: p.unitId, enterpriseId: p.enterpriseId, unidade: p.unidade, valor: p.novo })),
            }),
          })
        : await fetch("/api/tabela-precos/reajuste", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unitIds: afetadas.map(p => p.unitId), reajuste }),
          });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha ao aplicar.");
      toast.success(`${d.alteradas} unidade(s) atualizada(s).`);
      setDialogo(false);
      // Recarrega ANTES de limpar o digitado: ao contrário, o campo pisca
      // vazio até a resposta chegar.
      await recarregarPrecos();
      setPendentes(new Map());
      carregarHistorico();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar.");
    } finally {
      setAplicando(false);
    }
  };

  if (empreendimentos.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma unidade carregada do Sienge.</CardContent>
      </Card>
    );
  }

  const Kpi = ({ rotulo, valor, apoio }: { rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode }) => (
    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</div>
      <div className="mt-1 font-marca text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{valor}</div>
      {apoio && <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{apoio}</div>}
    </div>
  );

  const MODOS: { m: Modo; rotulo: string; icone: React.ReactNode }[] = [
    { m: "percentual", rotulo: "Percentual", icone: <Percent className="h-3.5 w-3.5" /> },
    { m: "fixo", rotulo: "Valor fixo", icone: <Tag className="h-3.5 w-3.5" /> },
    { m: "cub", rotulo: "Variação do CUB", icone: <TrendingUp className="h-3.5 w-3.5" /> },
    { m: "m2", rotulo: "Preencher por m²", icone: <Wand2 className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <select value={empreendimento} onChange={e => setEmpreendimento(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {empreendimentos.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Tipo de imóvel">
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={soNaoVendidas} onCheckedChange={v => setSoNaoVendidas(v === true)} />
          Só não vendidas
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar unidade" className="h-9 w-44 pl-8" />
        </div>
      </div>

      {!podeEditarPrecos && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Lock className="h-3.5 w-3.5" /> Somente leitura. Alterar preços é restrito aos usuários autorizados do comercial.
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Não vendidas" valor={naoVendidas.length} apoio={tipo ? tipo : "todos os tipos"} />
        <Kpi rotulo="Com preço" valor={`${comPreco.length}`} apoio={naoVendidas.length - comPreco.length > 0 ? `${naoVendidas.length - comPreco.length} sem preço` : "todas com preço"} />
        <Kpi rotulo="Disponíveis a preço de tabela" valor={formatCompactCurrency(somaDisponiveis)} apoio={`${disponiveisComPreco.length} unidade(s)`} />
        <Kpi rotulo="R$/m² médio" valor={m2Medio ? formatCompactCurrency(m2Medio) : "—"} apoio="unidades com preço" />
      </div>

      {/* Tabela comercial manual: a do diretor comercial, por cima do Sienge */}
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800/80 dark:text-amber-300/80">Tabela comercial (manual, por cima do Sienge)</div>
            {podeEditarPrecos ? (
              <Input value={tc.referencia} onChange={e => setTc(t => ({ ...t, referencia: e.target.value }))} placeholder="Referência (ex.: Tabela comercial · outubro/2026)" className="mt-1 h-8 max-w-md bg-white dark:bg-slate-900" aria-label="Referência da tabela comercial" />
            ) : (
              <div className="mt-0.5 text-sm font-semibold">{tcSalva?.referencia || "Nenhuma tabela comercial cadastrada"}</div>
            )}
            <div className="mt-1 text-[11px] text-muted-foreground">
              {tcExiste
                ? `${tcEfetiva.disponiveis.length} unidade(s) à venda pela tabela · ${Object.keys(tcEfetiva.precos).length} com preço · as demais contam como vendidas no Quadro e no 3D.`
                : "Marque na coluna \"Tabela comercial\" as unidades à venda e o preço de cada uma; o Quadro e o 3D passam a seguir essa lista."}
              {tcSalva?.entrega ? ` Entrega: ${tcSalva.entrega.split("-").reverse().join("/")}.` : ""}
            </div>
          </div>
          {podeEditarPrecos && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={salvandoTc || Object.keys(tcEfetiva.precos).length === 0} onClick={aplicarPrecosTc} title="Grava na tabela de preços do painel os valores da tabela comercial (fica no histórico)">
                Aplicar preços à tabela de preços
              </Button>
              <Button size="sm" disabled={!tcAlterada || salvandoTc} onClick={salvarTc}>
                <Save className="mr-1.5 h-3.5 w-3.5" />{salvandoTc ? "Salvando..." : "Salvar tabela comercial"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Ações */}
      {podeEditarPrecos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{selecionadas.size > 0 ? `${selecionadas.size} selecionada(s)` : "Selecione unidades para reajustar em lote"}</span>
          {MODOS.map(({ m, rotulo, icone }) => (
            <Button key={m} size="sm" variant="outline" disabled={selecionadas.size === 0} onClick={() => abrirDialogo(m)}>
              {icone}<span className="ml-1.5">{rotulo}</span>
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {pendentes.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setPendentes(new Map())}><Undo2 className="mr-1.5 h-3.5 w-3.5" />Descartar</Button>
            )}
            <Button size="sm" disabled={mudancasReais.length === 0 || temInvalido || salvando} onClick={salvarPendentes}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {salvando ? "Salvando..." : mudancasReais.length > 0 ? `Salvar ${mudancasReais.length} alteração(ões)` : "Salvar"}
            </Button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {podeEditarPrecos && (
                  <TableHead className="w-10"><Checkbox checked={todasVisiveisMarcadas} onCheckedChange={alternarTodas} aria-label="Selecionar todas" /></TableHead>
                )}
                <SortableHead campo="unidade" {...sortProps}>Unidade</SortableHead>
                <SortableHead campo="tipo" {...sortProps}>Tipo</SortableHead>
                <SortableHead campo="pavimento" {...sortProps}>Pavimento</SortableHead>
                <SortableHead campo="area" {...sortProps} className="text-right">Área</SortableHead>
                <SortableHead campo="status" {...sortProps}>Status</SortableHead>
                <TableHead>Tabela comercial</TableHead>
                <SortableHead campo="preco" {...sortProps} className="text-right">Preço de tabela</SortableHead>
                <SortableHead campo="m2" {...sortProps} className="text-right">R$/m²</SortableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">Nenhuma unidade para os filtros atuais.</TableCell></TableRow>
              )}
              {sorted.map(l => {
                const v = valorEfetivo(l);
                const editada = pendentes.has(l.unitId) && v !== l.preco;
                const invalido = pendenteInvalido(l);
                return (
                  <TableRow key={l.unitId} className={selecionadas.has(l.unitId) ? "bg-primary/5" : undefined}>
                    {podeEditarPrecos && (
                      <TableCell><Checkbox checked={selecionadas.has(l.unitId)} onCheckedChange={() => alternar(l.unitId)} aria-label={`Selecionar ${l.unidade}`} /></TableCell>
                    )}
                    <TableCell className="font-semibold tabular-nums">{l.unidade}</TableCell>
                    <TableCell className="text-muted-foreground">{l.tipo}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{l.pavimento || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.area ? `${numeroBR(l.area)} m²` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.status}
                      {tcExiste && (() => { const sit = aplicarTabelaComercial(situacaoBase(l.status), l.unidade, tcEfetiva); return sit !== situacaoBase(l.status) ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" title="Pela tabela comercial">{sit} (tabela)</span> : null; })()}
                    </TableCell>
                    <TableCell>
                      {podeEditarPrecos ? (
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs" title="À venda pela tabela comercial">
                            <Checkbox checked={tcEfetiva.disponiveis.includes(nomeUnidade(l.unidade))} onCheckedChange={() => alternarDisponivel(l.unidade)} aria-label={`${l.unidade} à venda pela tabela comercial`} />
                            à venda
                          </label>
                          <InputReais
                            value={tcPrecosTxt.has(nomeUnidade(l.unidade)) ? tcPrecosTxt.get(nomeUnidade(l.unidade))! : tc.precos[nomeUnidade(l.unidade)] ? numeroBR(tc.precos[nomeUnidade(l.unidade)]) : ""}
                            placeholder="preço da tabela"
                            onChange={t => setTcPrecosTxt(prev => new Map(prev).set(nomeUnidade(l.unidade), t))}
                            aria-label={`Preço da tabela comercial da unidade ${l.unidade}`}
                            className="h-8 w-36 [&_input]:h-8"
                          />
                        </div>
                      ) : (
                        <span className="text-xs tabular-nums">
                          {tcEfetiva.disponiveis.includes(nomeUnidade(l.unidade)) ? "à venda" : tcExiste ? "—" : ""}
                          {tcEfetiva.precos[nomeUnidade(l.unidade)] ? ` · ${formatCurrency(tcEfetiva.precos[nomeUnidade(l.unidade)])}` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {podeEditarPrecos ? (
                        <InputReais
                          value={pendentes.has(l.unitId) ? pendentes.get(l.unitId)! : l.preco !== null ? numeroBR(l.preco) : ""}
                          placeholder="sem preço"
                          onChange={t => setPendentes(prev => new Map(prev).set(l.unitId, t))}
                          onKeyDown={e => { if (e.key === "Enter") salvarPendentes(); }}
                          aria-label={`Preço da unidade ${l.unidade}`}
                          aria-invalid={invalido}
                          className={`ml-auto h-8 w-40 [&_input]:h-8 ${invalido ? "[&_input]:border-red-400" : editada ? "[&_input]:border-amber-400 [&_input]:bg-amber-50 dark:[&_input]:bg-amber-500/10" : ""}`}
                        />
                      ) : (
                        <span className="tabular-nums">{l.preco !== null ? formatCurrency(l.preco) : <span className="text-muted-foreground">sem preço</span>}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{v && l.area ? formatCurrency(v / l.area) : "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setHistoricoUnidade(l)} title="Histórico de preços" aria-label={`Histórico de preços da unidade ${l.unidade}`}>
                        <History className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Últimas alterações */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-muted-foreground" />Últimas alterações</div>
          {lotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda neste empreendimento.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lotes.map(regs => {
                const r0 = regs[0];
                const antes = regs.reduce((s, r) => s + (r.valorAnterior || 0), 0);
                const depois = regs.reduce((s, r) => s + (r.valorNovo || 0), 0);
                return (
                  <li key={r0.lote} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{r0.descricao}</span>
                      <span className="text-muted-foreground"> · {regs.length === 1 ? `unidade ${r0.unidade}` : `${regs.length} unidades`}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {antes > 0 && depois > 0 && `${formatCompactCurrency(antes)} → ${formatCompactCurrency(depois)} · `}
                      {quem(r0.criadoPor)} · {dataHora(r0.criadoEm)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de reajuste / preenchimento */}
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{MODOS.find(x => x.m === modo)?.rotulo} · {selecionadas.size} unidade(s)</DialogTitle>
            <DialogDescription>
              {modo === "m2"
                ? "Define o preço de cada unidade selecionada como R$/m² × área privativa. Substitui o preço atual."
                : "Aplica sobre o preço atual de cada unidade selecionada. Unidades sem preço ficam de fora."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {MODOS.map(({ m, rotulo, icone }) => (
              <Button key={m} size="sm" variant={m === modo ? "default" : "outline"} onClick={() => { setModo(m); setEntrada(""); }}>
                {icone}<span className="ml-1.5">{rotulo}</span>
              </Button>
            ))}
          </div>

          {modo === "percentual" && (
            <label className="block text-sm">Percentual (use negativo para reduzir)
              <Input autoFocus value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="ex.: 3,5" className="mt-1 w-40" />
            </label>
          )}
          {modo === "fixo" && (
            <label className="block text-sm">Valor em reais por unidade (negativo para desconto)
              <InputReais autoFocus permitirNegativo value={entrada} onChange={setEntrada} placeholder="ex.: 5.000,00" className="mt-1 h-9 w-52" />
            </label>
          )}
          {modo === "m2" && (
            <label className="block text-sm">Valor do m² (R$)
              <InputReais autoFocus value={entrada} onChange={setEntrada} placeholder="ex.: 15.000,00" className="mt-1 h-9 w-52" />
            </label>
          )}
          {modo === "cub" && (
            <div className="space-y-2 text-sm">
              {cubMeses.length >= 2 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Do mês</span>
                  <select className="h-9 rounded-md border border-input bg-background px-2" onChange={e => {
                    const c = cubMeses[Number(e.target.value)]; if (!c) return;
                    setCubBaseTxt(numeroBR(c.valor_m2)); setCubRotulo(prev => `${rotuloMes(c)} → ${prev.split(" → ")[1] || ""}`);
                  }} defaultValue={cubMeses.length - 2}>
                    {cubMeses.map((c, i) => <option key={i} value={i}>{rotuloMes(c)} · {numeroBR(c.valor_m2)}</option>)}
                  </select>
                  <span className="text-muted-foreground">para</span>
                  <select className="h-9 rounded-md border border-input bg-background px-2" onChange={e => {
                    const c = cubMeses[Number(e.target.value)]; if (!c) return;
                    setCubNovoTxt(numeroBR(c.valor_m2)); setCubRotulo(prev => `${prev.split(" → ")[0] || ""} → ${rotuloMes(c)}`);
                  }} defaultValue={cubMeses.length - 1}>
                    {cubMeses.map((c, i) => <option key={i} value={i}>{rotuloMes(c)} · {numeroBR(c.valor_m2)}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <label>CUB base (R$/m²)<InputReais value={cubBaseTxt} onChange={t => { if (t !== cubBaseTxt) { setCubBaseTxt(t); setCubRotulo(""); } }} placeholder="CUB da última tabela" className="mt-1 h-9 w-48" /></label>
                <label>CUB novo (R$/m²){cubData?.currentMonth && cubMeses.length < 2 ? <span className="ml-1 text-xs text-muted-foreground">({cubData.currentMonth})</span> : null}<InputReais value={cubNovoTxt} onChange={t => { if (t !== cubNovoTxt) { setCubNovoTxt(t); setCubRotulo(""); } }} placeholder="ex.: 3.012,45" className="mt-1 h-9 w-48" /></label>
              </div>
              {reajuste && !validarReajuste(reajuste) && <p className="text-xs text-muted-foreground">{descreverReajuste(reajuste)}</p>}
            </div>
          )}

          {/* Prévia */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
              <span className="font-semibold">Prévia</span>
              <span className="tabular-nums text-muted-foreground">
                {afetadas.length} alterada(s){ignoradas > 0 ? ` · ${ignoradas} ${modo === "m2" ? "sem área" : "sem preço"}, fora` : ""}
                {afetadas.length > 0 && ` · ${formatCurrency(totalAntes)} → ${formatCurrency(totalDepois)}`}
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previa.map(p => (
                    <tr key={p.unitId}>
                      <td className="px-3 py-1.5 font-medium tabular-nums">{p.unidade}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{p.preco !== null ? formatCurrency(p.preco) : "sem preço"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{p.novo !== null ? formatCurrency(p.novo) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {(erroPrevia || negativa) && entrada + cubBaseTxt + cubNovoTxt !== "" && (
            <p className="text-xs text-red-600 dark:text-red-300/80">{negativa ? `A unidade ${negativa.unidade} ficaria sem valor positivo.` : erroPrevia}</p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogo(false)}>Cancelar</Button>
            <Button disabled={Boolean(erroPrevia) || Boolean(negativa) || afetadas.length === 0 || aplicando} onClick={confirmar}>
              {aplicando ? "Aplicando..." : `Aplicar em ${afetadas.length} unidade(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico da unidade */}
      <PainelLateral aberto={Boolean(historicoUnidade)} onFechar={() => setHistoricoUnidade(null)}>
        {historicoUnidade && (
          <>
            <CabecalhoPainel
              rotulo="Histórico de preços"
              titulo={`Unidade ${historicoUnidade.unidade}`}
              subtitulo={`${historicoUnidade.enterprise} · preço atual ${historicoUnidade.preco !== null ? formatCurrency(historicoUnidade.preco) : "não definido"}`}
              onFechar={() => setHistoricoUnidade(null)}
            />
            <div className="px-6 py-4">
              {historico.filter(h => h.unitId === historicoUnidade.unitId).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma alteração registrada para esta unidade.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                    <tr><th className="py-1.5 text-left">Quando</th><th className="py-1.5 text-left">O quê</th><th className="py-1.5 text-right">De</th><th className="py-1.5 text-right">Para</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {historico.filter(h => h.unitId === historicoUnidade.unitId).map((h, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3 align-top text-xs tabular-nums text-muted-foreground">{dataHora(h.criadoEm)}<div>{quem(h.criadoPor)}</div></td>
                        <td className="py-2 pr-3 align-top">{h.descricao}</td>
                        <td className="py-2 text-right align-top tabular-nums text-muted-foreground">{h.valorAnterior !== null ? formatCurrency(h.valorAnterior) : "—"}</td>
                        <td className="py-2 text-right align-top tabular-nums font-semibold">{h.valorNovo !== null ? formatCurrency(h.valorNovo) : "removido"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </PainelLateral>
    </div>
  );
}
