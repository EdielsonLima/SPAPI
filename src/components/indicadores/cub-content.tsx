"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, PenLine, Plus, RefreshCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, formatDateTime, mesAno, pct } from "@/lib/indicadores/fmt";
import type { CubIndicadorRow } from "@/lib/db";
import type { CubManualInfo } from "@/lib/indicadores/cub-serie";
import { MESES_CUB, manualMaisNovo } from "@/lib/indicadores/cub-manual";
import { KpiCard } from "./kpi-card";
import { IndicadorSimplesChart } from "./indicador-simples-chart";

function addMeses(ano: number, mes: number, delta: number) {
  const total = (ano * 12 + (mes - 1)) + delta;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

function ymKey(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function parseYm(s: string): { ano: number; mes: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { ano: Number(m[1]), mes: Number(m[2]) };
}

export type CubKpis = {
  valorAtual: number | null;
  variacaoMensal: number | null;
  variacaoAcumuladaAno: number | null;
  variacaoAnual: number | null;
  ultimoMesLabel: { ano: number; mes: number } | null;
};

/** "3.182,95" ou "3182.95" → 3182.95 */
function lerValor(s: string): number {
  const t = s.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
}

export function CubContent({
  rows,
  kpis,
  atualizadoEm,
  manual,
  onSynced,
}: {
  rows: CubIndicadorRow[];
  kpis: CubKpis;
  atualizadoEm: string | null;
  /** CUB lançado à mão (vale só enquanto o site não publica o mês). */
  manual: CubManualInfo | null;
  onSynced: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  // ── CUB manual (reserva para quando o site atrasa) ──
  // Último mês AUTOMÁTICO: com o manual em uso, ele é a última linha da série.
  const ultimoAuto = useMemo(() => {
    const auto = manual?.emUso ? rows.slice(0, -1) : rows;
    const u = auto[auto.length - 1];
    return u ? { ano: u.ano, mes: u.mes } : null;
  }, [rows, manual]);
  const sugerido = useMemo(() => {
    if (manual?.emUso) return { ano: manual.ano, mes: manual.mes };
    if (ultimoAuto) return addMeses(ultimoAuto.ano, ultimoAuto.mes, 1);
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  }, [manual, ultimoAuto]);
  const [abrirManual, setAbrirManual] = useState(false);
  const [mManual, setMManual] = useState(String(sugerido.mes));
  const [aManual, setAManual] = useState(String(sugerido.ano));
  const [vManual, setVManual] = useState("");
  const [salvandoManual, setSalvandoManual] = useState(false);

  const abrirLancamento = () => {
    setMManual(String(sugerido.mes));
    setAManual(String(sugerido.ano));
    setVManual(manual?.emUso ? String(manual.valor_m2).replace(".", ",") : "");
    setAbrirManual(true);
  };

  const salvarManual = async () => {
    const mes = Number(mManual);
    const ano = Number(aManual);
    const valor = lerValor(vManual);
    if (!mes || !ano || ano < 2000 || ano > 2100) {
      toast.error("Informe o mês e o ano do CUB.");
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe o valor do CUB em R$/m² (ex.: 3.182,95).");
      return;
    }
    if (ultimoAuto && !manualMaisNovo({ ano, mes }, ultimoAuto)) {
      toast.error(
        `O site já publicou ${mesAno(ultimoAuto.ano, ultimoAuto.mes)} — o CUB automático já vale. O manual é só para um mês que ainda não saiu.`
      );
      return;
    }
    setSalvandoManual(true);
    try {
      const rotulo = `${MESES_CUB[mes - 1]}/${ano}`;
      const res = await fetch("/api/cub/override", {
        method: "PUT",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ value: valor, monthLabel: rotulo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`CUB de ${rotulo} lançado: ${brl(valor)}. Vale até o Sinduscon publicar o mês.`);
      setAbrirManual(false);
      onSynced();
    } catch (err) {
      toast.error(`Falha ao lançar o CUB: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    } finally {
      setSalvandoManual(false);
    }
  };

  const removerManual = async () => {
    try {
      const res = await fetch("/api/cub/override", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("CUB manual removido. Vale só o automático.");
      setAbrirManual(false);
      onSynced();
    } catch (err) {
      toast.error(`Falha ao remover o CUB manual: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }
  };

  const allKeys = useMemo(() => rows.map((r) => ymKey(r.ano, r.mes)), [rows]);
  const minKey = allKeys[0] ?? null;
  const maxKey = allKeys[allKeys.length - 1] ?? null;

  const defaultInicial = useMemo(() => {
    if (!maxKey) return "";
    const m = parseYm(maxKey);
    if (!m) return "";
    const start = addMeses(m.ano, m.mes, -23);
    return ymKey(start.ano, start.mes);
  }, [maxKey]);

  const [mesInicial, setMesInicial] = useState<string>(defaultInicial);
  const [qtdMeses, setQtdMeses] = useState<number>(24);

  const sortedKeyToRow = useMemo(() => {
    const map: Record<string, CubIndicadorRow> = {};
    rows.forEach((r) => {
      map[ymKey(r.ano, r.mes)] = r;
    });
    return map;
  }, [rows]);

  const janela = useMemo(() => {
    const ini = parseYm(mesInicial) ?? (minKey ? parseYm(minKey) : null);
    if (!ini) return [];
    const out: CubIndicadorRow[] = [];
    for (let i = 0; i < qtdMeses; i++) {
      const { ano, mes } = addMeses(ini.ano, ini.mes, i);
      const r = sortedKeyToRow[ymKey(ano, mes)];
      if (r) out.push(r);
    }
    return out;
  }, [mesInicial, qtdMeses, minKey, sortedKeyToRow]);

  const chartData = janela.map((r) => ({
    label: mesAno(r.ano, r.mes),
    value: r.valor_m2,
  }));

  const opcoesMesInicial = useMemo(() => {
    return allKeys.map((k) => {
      const m = parseYm(k)!;
      return { value: k, label: mesAno(m.ano, m.mes) };
    });
  }, [allKeys]);

  const handlePrev = () => {
    const cur = parseYm(mesInicial);
    if (!cur || !minKey) return;
    const novo = addMeses(cur.ano, cur.mes, -1);
    const novoKey = ymKey(novo.ano, novo.mes);
    if (novoKey < minKey) return;
    setMesInicial(novoKey);
  };

  const handleNext = () => {
    const cur = parseYm(mesInicial);
    if (!cur || !maxKey) return;
    const max = parseYm(maxKey)!;
    const novo = addMeses(cur.ano, cur.mes, 1);
    const limite = addMeses(max.ano, max.mes, -(qtdMeses - 1));
    const novoKey = ymKey(novo.ano, novo.mes);
    if (novoKey > ymKey(limite.ano, limite.mes)) return;
    setMesInicial(novoKey);
  };

  const aplicarAtalho = (n: number | "all") => {
    if (!maxKey) return;
    const max = parseYm(maxKey)!;
    const usar = n === "all" ? rows.length : Math.min(n, rows.length);
    setQtdMeses(usar);
    const ini = addMeses(max.ano, max.mes, -(usar - 1));
    setMesInicial(ymKey(ini.ano, ini.mes));
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/indicadores/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicador: "cub" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`CUB sincronizado — ${data.inseridos} meses (último: ${data.ultimo}).`);
        onSynced();
      } else {
        toast.error(`Falha ao sincronizar CUB: ${data.error ?? "erro desconhecido"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(`Falha ao sincronizar CUB: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const finalMes = janela.length > 0 ? mesAno(janela[janela.length - 1].ano, janela[janela.length - 1].mes) : "—";
  const inicioMes = janela.length > 0 ? mesAno(janela[0].ano, janela[0].mes) : "—";
  const baseInicio = minKey ? mesAno(parseYm(minKey)!.ano, parseYm(minKey)!.mes) : "—";
  const baseFim = maxKey ? mesAno(parseYm(maxKey)!.ano, parseYm(maxKey)!.mes) : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Fonte:{" "}
          <a
            href="https://sinduscon-fpolis.org.br/servico/cub-mensal/"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Sinduscon-SC
          </a>
          {" "}(mês atual) e{" "}
          <a
            href="https://myside.com.br/guia-balneario-camboriu/cub-sc"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            myside.com.br
          </a>
          {" "}(série)
          {" · "}sincronizado em {formatDateTime(atualizadoEm)}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (abrirManual ? setAbrirManual(false) : abrirLancamento())}
            className="gap-2"
            title="Para quando o Sinduscon ainda não publicou o mês"
          >
            <PenLine className="h-3.5 w-3.5" />
            Lançar CUB manual
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            Atualizar CUB
          </Button>
        </div>
      </div>

      {manual && !abrirManual && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex items-start gap-2 min-w-0 flex-1">
            <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${manual.emUso ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"}`} />
            {manual.emUso ? (
              <span>
                CUB de <strong>{mesAno(manual.ano, manual.mes)}</strong> lançado à mão ({brl(manual.valor_m2)}) — vale
                até o Sinduscon publicar esse mês; aí o automático entra sozinho.
              </span>
            ) : (
              <span>
                O CUB manual de <strong>{mesAno(manual.ano, manual.mes)}</strong> não é mais usado: o site já publicou
                esse mês.
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 ml-auto">
            {manual.emUso && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={abrirLancamento}>
                Editar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 dark:text-red-300/80"
              onClick={removerManual}
            >
              Remover
            </Button>
          </span>
        </div>
      )}

      {abrirManual && (
        <Card className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Lançar CUB manual</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                  Use quando o Sinduscon ainda não publicou o mês
                  {ultimoAuto ? <> (o automático está em <strong>{mesAno(ultimoAuto.ano, ultimoAuto.mes)}</strong>)</> : null}.
                  A variação do mês, o acumulado no ano e os 12 meses são calculados pela série. Quando o site
                  publicar o mesmo mês, o valor automático passa a valer sozinho.
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setAbrirManual(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Mês
                </span>
                <Select value={mManual} onValueChange={setMManual}>
                  <SelectTrigger className="w-24 h-9">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES_CUB.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Ano
                </span>
                <Input
                  type="number"
                  value={aManual}
                  onChange={(e) => setAManual(e.target.value)}
                  className="w-24 h-9"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Valor (R$/m²)
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="3.182,95"
                  value={vManual}
                  onChange={(e) => setVManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salvarManual();
                  }}
                  className="w-36 h-9"
                />
              </div>
              <Button size="sm" className="h-9 gap-2" onClick={salvarManual} disabled={salvandoManual}>
                {salvandoManual && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
              {manual && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-red-600 hover:text-red-700 dark:text-red-300/80"
                  onClick={removerManual}
                >
                  Remover o manual
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          tone="accent"
          label="CUB-SC R$/m²"
          value={kpis.valorAtual !== null ? brl(kpis.valorAtual) : "—"}
          hint={
            kpis.ultimoMesLabel
              ? `${mesAno(kpis.ultimoMesLabel.ano, kpis.ultimoMesLabel.mes)}${manual?.emUso ? " · lançado à mão" : ""}`
              : undefined
          }
        />
        <KpiCard
          tone={kpis.variacaoMensal !== null && kpis.variacaoMensal < 0 ? "danger" : "default"}
          label="Variação mensal"
          value={kpis.variacaoMensal !== null ? pct(kpis.variacaoMensal, true) : "—"}
        />
        <KpiCard
          tone={kpis.variacaoAcumuladaAno !== null && kpis.variacaoAcumuladaAno < 0 ? "danger" : "success"}
          label="Acumulado no ano"
          value={kpis.variacaoAcumuladaAno !== null ? pct(kpis.variacaoAcumuladaAno, true) : "—"}
        />
        <KpiCard
          tone={kpis.variacaoAnual !== null && kpis.variacaoAnual < 0 ? "danger" : "warning"}
          label="Últimos 12 meses"
          value={kpis.variacaoAnual !== null ? pct(kpis.variacaoAnual, true) : "—"}
        />
      </div>

      <Card className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Mês inicial
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrev} disabled={!minKey}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={mesInicial} onValueChange={setMesInicial}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesMesInicial.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleNext} disabled={!maxKey}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Janela (meses)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setQtdMeses((q) => Math.max(2, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="number"
                  value={qtdMeses}
                  min={2}
                  max={Math.max(rows.length, 2)}
                  onChange={(e) => {
                    const n = Math.max(2, Math.min(rows.length, Number(e.target.value) || 2));
                    setQtdMeses(n);
                  }}
                  className="h-9 w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setQtdMeses((q) => Math.min(rows.length, q + 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Atalhos
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  { n: 12, label: "12m" },
                  { n: 24, label: "24m" },
                  { n: 36, label: "36m" },
                  { n: 60, label: "60m" },
                ].map((a) => (
                  <Button key={a.n} variant="outline" size="sm" className="h-8 px-2" onClick={() => aplicarAtalho(a.n)}>
                    {a.label}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => aplicarAtalho("all")}>
                  Tudo
                </Button>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>Base: <strong>{baseInicio}</strong> → <strong>{baseFim}</strong> ({rows.length}m)</span>
            <span>Janela: <strong>{inicioMes}</strong> → <strong>{finalMes}</strong></span>
          </div>

          <IndicadorSimplesChart data={chartData} format="brl" color="#2563eb" height={320} />
        </CardContent>
      </Card>
    </div>
  );
}
