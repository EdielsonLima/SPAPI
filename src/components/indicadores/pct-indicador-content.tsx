"use client";

import { useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, mesAno, pct } from "@/lib/indicadores/fmt";
import type { PctIndicadorRow } from "@/lib/db";
import { KpiCard } from "./kpi-card";
import { IndicadorSimplesChart } from "./indicador-simples-chart";

export type PctKpis = {
  mensal: number | null;
  acumuladoAno: number | null;
  acumulado12m: number | null;
  ultimoMesLabel: { ano: number; mes: number } | null;
};

export function PctIndicadorContent({
  nome,
  slug,
  descricaoFonte,
  urlFonte,
  labelValor,
  color,
  rows,
  kpis,
  atualizadoEm,
  onSynced,
}: {
  nome: string;
  slug: "cdi" | "ipca" | "igpm";
  descricaoFonte: string;
  urlFonte: string;
  labelValor: string;
  color: string;
  rows: PctIndicadorRow[];
  kpis: PctKpis;
  atualizadoEm: string | null;
  onSynced: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  const chartData = rows.map((r) => ({
    label: mesAno(r.ano, r.mes),
    value: r.variacao_pct,
  }));

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/indicadores/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicador: slug }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`${nome} sincronizado — ${data.inseridos} meses (último: ${data.ultimo}).`);
        onSynced();
      } else {
        toast.error(`Falha ao sincronizar ${nome}: ${data.error ?? "erro desconhecido"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(`Falha ao sincronizar ${nome}: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Fonte:{" "}
          <a
            href={urlFonte}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {descricaoFonte}
          </a>
          {" · "}sincronizado em {formatDateTime(atualizadoEm)}
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Atualizar {nome}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          tone={kpis.mensal !== null && kpis.mensal < 0 ? "danger" : "accent"}
          label={labelValor}
          value={kpis.mensal !== null ? pct(kpis.mensal, true) : "—"}
          hint={kpis.ultimoMesLabel ? mesAno(kpis.ultimoMesLabel.ano, kpis.ultimoMesLabel.mes) : undefined}
        />
        <KpiCard
          tone={kpis.acumuladoAno !== null && kpis.acumuladoAno < 0 ? "danger" : "success"}
          label="Acumulado no ano"
          value={kpis.acumuladoAno !== null ? pct(kpis.acumuladoAno, true) : "—"}
        />
        <KpiCard
          tone={kpis.acumulado12m !== null && kpis.acumulado12m < 0 ? "danger" : "warning"}
          label="Últimos 12 meses"
          value={kpis.acumulado12m !== null ? pct(kpis.acumulado12m, true) : "—"}
        />
      </div>

      <Card className="border-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900">
        <CardContent className="p-4">
          <IndicadorSimplesChart data={chartData} format="pct" color={color} height={320} />
        </CardContent>
      </Card>
    </div>
  );
}
