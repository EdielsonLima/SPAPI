"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CubIndicadorRow, PctIndicadorRow, ValorM2Row } from "@/lib/db";
import { CubContent, type CubKpis } from "./cub-content";
import { PctIndicadorContent, type PctKpis } from "./pct-indicador-content";
import { ValorM2Content, type ValorM2Kpis } from "./valor-m2-content";
import { CompararContent } from "./comparar-content";

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

type SubTab = "cub" | "cdi" | "ipca" | "igpm" | "incc" | "valorm2" | "comparar";

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

  const TABS: { value: SubTab; label: string }[] = [
    { value: "cub", label: "CUB" },
    { value: "cdi", label: "CDI" },
    { value: "ipca", label: "IPCA" },
    { value: "igpm", label: "IGP-M" },
    { value: "incc", label: "INCC" },
    { value: "valorm2", label: "Valor m²" },
    { value: "comparar", label: "Comparar" },
  ];
  // Mesmas pílulas das sub-abas do Painel Executivo: ativa em carmim, sem cor por indicador.
  const subTabClass =
    "gap-1.5 px-3.5 h-7 rounded-full text-xs font-medium text-slate-500 dark:text-slate-400 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-primary dark:data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:font-semibold transition-all";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Indicadores de Mercado
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Índices de referência do setor imobiliário e da economia.
        </p>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as SubTab)}>
        <TabsList className="h-auto min-h-[2.25rem] flex-wrap justify-start bg-slate-100 dark:bg-slate-800 rounded-full p-1 gap-0.5">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={subTabClass}>
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
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm text-red-600 dark:text-red-300/80">
          <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-red-500" />
          <span>Erro ao carregar indicadores: {error}</span>
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
      {data && active === "comparar" && (
        <CompararContent
          cub={data.cub.rows}
          cdi={data.cdi.rows}
          ipca={data.ipca.rows}
          igpm={data.igpm.rows}
          incc={data.incc.rows}
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
