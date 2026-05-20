"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CubIndicadorRow, PctIndicadorRow, ValorM2Row } from "@/lib/db";
import { CubContent, type CubKpis } from "./cub-content";
import { PctIndicadorContent, type PctKpis } from "./pct-indicador-content";
import { ValorM2Content, type ValorM2Kpis } from "./valor-m2-content";

type ApiResponse = {
  cub: {
    rows: CubIndicadorRow[];
    kpis: CubKpis;
    atualizadoEm: string | null;
    stale: boolean;
  };
  cdi: {
    rows: PctIndicadorRow[];
    kpis: PctKpis;
    atualizadoEm: string | null;
    stale: boolean;
  };
  ipca: {
    rows: PctIndicadorRow[];
    kpis: PctKpis;
    atualizadoEm: string | null;
    stale: boolean;
  };
  igpm: {
    rows: PctIndicadorRow[];
    kpis: PctKpis;
    atualizadoEm: string | null;
    stale: boolean;
  };
  incc: {
    rows: PctIndicadorRow[];
    kpis: PctKpis;
    atualizadoEm: string | null;
    stale: boolean;
  };
  valorM2: {
    rows: ValorM2Row[];
    kpis: ValorM2Kpis;
    atualizadoEm: string | null;
    stale: boolean;
  };
};

type SubTab = "cub" | "cdi" | "ipca" | "igpm" | "incc" | "valorm2";

export function IndicadoresTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<SubTab>("cub");
  const autoSyncRan = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/indicadores", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json);
      setError(null);
      return json;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data || autoSyncRan.current) return;
    autoSyncRan.current = true;

    const targets: SubTab[] = [];
    if (data.cub.stale) targets.push("cub");
    if (data.cdi.stale) targets.push("cdi");
    if (data.ipca.stale) targets.push("ipca");
    if (data.igpm.stale) targets.push("igpm");
    if (data.incc.stale) targets.push("incc");
    if (data.valorM2.stale) targets.push("valorm2");
    if (targets.length === 0) return;

    Promise.allSettled(
      targets.map((slug) =>
        fetch("/api/indicadores/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ indicador: slug }),
        })
      )
    ).then(() => {
      load();
    });
  }, [data, load]);

  const TABS: { value: SubTab; label: string; color: string }[] = [
    { value: "cub", label: "CUB", color: "border-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30" },
    { value: "cdi", label: "CDI", color: "border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" },
    { value: "ipca", label: "IPCA", color: "border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" },
    { value: "igpm", label: "IGP-M", color: "border-violet-500 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30" },
    { value: "incc", label: "INCC", color: "border-orange-500 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30" },
    { value: "valorm2", label: "Valor m²", color: "border-rose-500 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Indicadores de Mercado
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Índices de referência do setor imobiliário e da economia.
        </p>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as SubTab)}>
        <TabsList className="h-11 bg-transparent p-0 gap-1 border-b border-slate-200 dark:border-slate-700 w-full justify-start rounded-none">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={`gap-2 px-4 h-10 rounded-t-lg rounded-b-none border-b-[3px] transition-all ${
                active === t.value
                  ? `${t.color} font-semibold`
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Carregando indicadores…</span>
        </div>
      )}

      {error && !data && (
        <div className="rounded-2xl border border-rose-300 dark:border-rose-700/60 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300">
          Erro ao carregar indicadores: {error}
        </div>
      )}

      {data && active === "cub" && (
        <CubContent
          rows={data.cub.rows}
          kpis={data.cub.kpis}
          atualizadoEm={data.cub.atualizadoEm}
          onSynced={load}
        />
      )}
      {data && active === "cdi" && (
        <PctIndicadorContent
          nome="CDI"
          slug="cdi"
          descricaoFonte="debit.com.br"
          urlFonte="https://debit.com.br/tabelas/tabela-completa.php?indice=cdi"
          labelValor="CDI mensal"
          color="#10b981"
          rows={data.cdi.rows}
          kpis={data.cdi.kpis}
          atualizadoEm={data.cdi.atualizadoEm}
          onSynced={load}
        />
      )}
      {data && active === "ipca" && (
        <PctIndicadorContent
          nome="IPCA"
          slug="ipca"
          descricaoFonte="debit.com.br"
          urlFonte="https://debit.com.br/tabelas/tabela-completa.php?indice=ipca"
          labelValor="IPCA mensal"
          color="#f59e0b"
          rows={data.ipca.rows}
          kpis={data.ipca.kpis}
          atualizadoEm={data.ipca.atualizadoEm}
          onSynced={load}
        />
      )}
      {data && active === "igpm" && (
        <PctIndicadorContent
          nome="IGP-M"
          slug="igpm"
          descricaoFonte="debit.com.br"
          urlFonte="https://debit.com.br/tabelas/tabela-completa.php?indice=igpm"
          labelValor="IGP-M mensal"
          color="#8b5cf6"
          rows={data.igpm.rows}
          kpis={data.igpm.kpis}
          atualizadoEm={data.igpm.atualizadoEm}
          onSynced={load}
        />
      )}
      {data && active === "incc" && (
        <PctIndicadorContent
          nome="INCC"
          slug="incc"
          descricaoFonte="debit.com.br"
          urlFonte="https://debit.com.br/tabelas/tabela-completa.php?indice=incc"
          labelValor="INCC mensal"
          color="#f97316"
          rows={data.incc.rows}
          kpis={data.incc.kpis}
          atualizadoEm={data.incc.atualizadoEm}
          onSynced={load}
        />
      )}
      {data && active === "valorm2" && (
        <ValorM2Content
          rows={data.valorM2.rows}
          kpis={data.valorM2.kpis}
          atualizadoEm={data.valorM2.atualizadoEm}
          onSynced={load}
        />
      )}
    </div>
  );
}
