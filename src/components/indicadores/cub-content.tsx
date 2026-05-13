"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, formatDateTime, mesAno, pct } from "@/lib/indicadores/fmt";
import type { CubIndicadorRow } from "@/lib/db";
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

export function CubContent({
  rows,
  kpis,
  atualizadoEm,
  onSynced,
}: {
  rows: CubIndicadorRow[];
  kpis: CubKpis;
  atualizadoEm: string | null;
  onSynced: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

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
          Fonte: Sinduscon-SC via{" "}
          <a
            href="https://myside.com.br/guia-balneario-camboriu/cub-sc"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            myside.com.br
          </a>
          {" · "}sincronizado em {formatDateTime(atualizadoEm)}
        </div>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          tone="accent"
          label="CUB-SC R$/m²"
          value={kpis.valorAtual !== null ? brl(kpis.valorAtual) : "—"}
          hint={kpis.ultimoMesLabel ? mesAno(kpis.ultimoMesLabel.ano, kpis.ultimoMesLabel.mes) : undefined}
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

      <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
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
              <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
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
              <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
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
