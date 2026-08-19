"use client";

/**
 * Conferencia de Titulos — mutirao CP/CR com o financeiro.
 *
 * Uma tela so para os dois lados: as abas mudam o lado (a pagar / a receber),
 * mas o fluxo, o vocabulario de decisao e o gerador de lote sao os mesmos.
 * Respeita o modo de empresa como as demais telas: em Holding aparece so a
 * administradora, em Silva Packer todas menos ela.
 *
 * Nada aqui altera o Sienge. A tela registra a DECISAO sobre cada parcela para
 * a conversa nao recomecar do zero na proxima auditoria.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyMode } from "@/lib/company-context";
import { formatCurrency, formatDate } from "@/lib/dashboard-utils";
import {
  STATUS_CONFERENCIA,
  agruparPorContraparte,
  parcelasAPagar,
  parcelasAReceber,
  textoDoLote,
  type GrupoConferencia,
  type ParcelaConferencia,
  type TipoConferencia,
} from "@/lib/conferencia-utils";
import type { ConferenciaStatus } from "@/lib/db";
import { SiengeIncome, SiengeOutcome } from "@/types/sienge";
import { cn } from "@/lib/utils";

interface Decisao {
  status: ConferenciaStatus;
  observacao: string;
  atualizadoPor: string;
  atualizadoEm: string;
}

const ESTILO_STATUS: Record<ConferenciaStatus, string> = {
  real: "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900",
  pago: "bg-emerald-600 text-white",
  corrigir: "bg-amber-500 text-white",
  excluir: "bg-red-600 text-white",
};

const ESTILO_BADGE: Record<ConferenciaStatus, string> = {
  real: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  pago: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  corrigir: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  excluir: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300/80",
};

const TAMANHO_LOTE = 10;

export function ConferenciaView() {
  const { isHolding, holdingName, label } = useCompanyMode();
  const hoje = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [outcome, setOutcome] = useState<SiengeOutcome[]>([]);
  const [income, setIncome] = useState<SiengeIncome[]>([]);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [decisoes, setDecisoes] = useState<Map<string, Decisao>>(new Map());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoConferencia>("cp");
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [lote, setLote] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const anoAtual = new Date().getFullYear();

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // Mesmos intervalos das telas de Vencidas/Inadimplentes — reaproveita o cache.
      const inicio = `${anoAtual - 10}-01-01`;
      const [ro, ri, rc, re] = await Promise.all([
        fetch(`/api/sienge/outcome?startDate=${inicio}&endDate=${anoAtual + 5}-12-31`),
        fetch(`/api/sienge/income?startDate=${inicio}&endDate=${anoAtual + 15}-12-31`),
        fetch("/api/conferencia"),
        fetch("/api/bill-exclusions"),
      ]);
      const [jo, ji, jc, je] = await Promise.all([ro.json(), ri.json(), rc.json(), re.json()]);
      setOutcome(jo.data || []);
      setIncome(ji.data || []);
      setExcluidos(
        new Set(
          (je.data || []).map(
            (x: { companyId: number; billId: number }) => `${x.companyId}-${x.billId}`
          )
        )
      );
      const mapa = new Map<string, Decisao>();
      for (const r of jc.data || []) {
        mapa.set(`${r.tipo}:${r.companyId}:${r.billId}:${r.installmentId}`, {
          status: r.status,
          observacao: r.observacao || "",
          atualizadoPor: r.atualizadoPor || "",
          atualizadoEm: r.atualizadoEm || "",
        });
      }
      setDecisoes(mapa);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [anoAtual]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setAberto(null);
    setLote(null);
  }, [tipo]);

  /** Escopo de empresa — igual ao resto do sistema. */
  const incluiEmpresa = useCallback(
    (nome: string) => (isHolding ? nome === holdingName : nome !== holdingName),
    [isHolding, holdingName]
  );

  const parcelas = useMemo(
    () =>
      tipo === "cp"
        ? parcelasAPagar(outcome, hoje, incluiEmpresa)
        : parcelasAReceber(income, hoje, incluiEmpresa, excluidos),
    [tipo, outcome, income, hoje, incluiEmpresa, excluidos]
  );

  const decidida = useCallback((chave: string) => decisoes.has(chave), [decisoes]);

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let lista = agruparPorContraparte(parcelas, decidida);
    if (termo) lista = lista.filter((g) => g.contraparte.toLowerCase().includes(termo));
    if (somentePendentes) lista = lista.filter((g) => g.conferidas < g.parcelas.length);
    return lista;
  }, [parcelas, decidida, busca, somentePendentes]);

  const resumo = useMemo(() => {
    const total = parcelas.reduce((s, p) => s + p.valor, 0);
    const confs = parcelas.filter((p) => decisoes.has(p.chave));
    const porStatus = (st: ConferenciaStatus) => {
      const g = confs.filter((p) => decisoes.get(p.chave)!.status === st);
      return { n: g.length, valor: g.reduce((s, p) => s + p.valor, 0) };
    };
    return {
      total,
      qtd: parcelas.length,
      contrapartes: new Set(parcelas.map((p) => p.contraparte)).size,
      conferidasQtd: confs.length,
      conferidasValor: confs.reduce((s, p) => s + p.valor, 0),
      pago: porStatus("pago"),
      excluir: porStatus("excluir"),
      corrigir: porStatus("corrigir"),
    };
  }, [parcelas, decisoes]);

  const pctConferido = resumo.qtd ? Math.round((resumo.conferidasQtd / resumo.qtd) * 100) : 0;
  const loteNumero = Math.floor(resumo.conferidasQtd / TAMANHO_LOTE) + 1;

  const decidir = async (p: ParcelaConferencia, status: ConferenciaStatus | null, obs?: string) => {
    setSalvando(p.chave);
    try {
      if (status === null) {
        await fetch(
          `/api/conferencia?tipo=${p.tipo}&companyId=${p.companyId}&billId=${p.billId}&installmentId=${p.installmentId}`,
          { method: "DELETE" }
        );
        setDecisoes((m) => {
          const n = new Map(m);
          n.delete(p.chave);
          return n;
        });
      } else {
        const observacao = obs ?? decisoes.get(p.chave)?.observacao ?? "";
        const res = await fetch("/api/conferencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: p.tipo,
            companyId: p.companyId,
            billId: p.billId,
            installmentId: p.installmentId,
            status,
            observacao,
            companyName: p.companyName,
            contraparte: p.contraparte,
            dueDate: p.dueDate,
            valor: p.valor,
          }),
        });
        if (!res.ok) throw new Error("falha ao salvar");
        setDecisoes((m) => {
          const n = new Map(m);
          n.set(p.chave, {
            status,
            observacao,
            atualizadoPor: m.get(p.chave)?.atualizadoPor || "",
            atualizadoEm: new Date().toISOString(),
          });
          return n;
        });
      }
    } catch {
      setErro("Nao consegui salvar a decisao. Tente de novo.");
    } finally {
      setSalvando(null);
    }
  };

  const gerarLote = () => {
    const pendentes = grupos.filter((g) => g.conferidas < g.parcelas.length).slice(0, TAMANHO_LOTE);
    setLote(pendentes.length ? textoDoLote(pendentes, tipo, loteNumero) : null);
    setCopiado(false);
  };

  const copiar = async () => {
    if (!lote) return;
    try {
      await navigator.clipboard.writeText(lote);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Nao consegui copiar — selecione o texto e copie manualmente.");
    }
  };

  const rotuloContraparte = tipo === "cp" ? "Credor" : "Cliente";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Conferencia de Titulos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vencidos e inadimplentes de {label}, para conferir titulo a titulo com o financeiro.
            Previsoes ficam de fora.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-2", loading && "animate-spin")} />
          Recarregar
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {(
          [
            { id: "cp" as const, label: "A Pagar (vencidas)", cor: "red" },
            { id: "cr" as const, label: "A Receber (inadimplencia)", cor: "orange" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTipo(t.id)}
            className={cn(
              "flex items-center gap-2 px-5 h-10 rounded-t-lg border-b-[3px] text-sm transition-all",
              tipo === t.id
                ? t.cor === "red"
                  ? "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300/80 font-semibold"
                  : "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {erro && (
        <Card className="border-0 shadow-sm p-3 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {erro}
        </Card>
      )}

      {loading ? (
        <Card className="border-0 shadow-sm p-16 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-3 text-sm text-slate-500">Carregando titulos...</span>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              titulo="A conferir"
              valor={formatCurrency(resumo.total - resumo.conferidasValor)}
              sub={`${resumo.qtd - resumo.conferidasQtd} de ${resumo.qtd} parcelas · ${resumo.contrapartes} ${tipo === "cp" ? "credores" : "clientes"}`}
              icone={TriangleAlert}
              cor="red"
            />
            <Kpi
              titulo="Ja conferido"
              valor={`${pctConferido}%`}
              sub={`${resumo.conferidasQtd} parcelas · ${formatCurrency(resumo.conferidasValor)}`}
              icone={ListChecks}
              cor="slate"
            />
            <Kpi
              titulo="Ja pago, falta baixa"
              valor={formatCurrency(resumo.pago.valor)}
              sub={`${resumo.pago.n} parcelas para dar baixa no Sienge`}
              icone={CheckCircle2}
              cor="emerald"
            />
            <Kpi
              titulo="Nao existe / corrigir"
              valor={formatCurrency(resumo.excluir.valor + resumo.corrigir.valor)}
              sub={`${resumo.excluir.n} a excluir · ${resumo.corrigir.n} a corrigir`}
              icone={TriangleAlert}
              cor="amber"
            />
          </div>

          <Card className="border-0 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${pctConferido}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {resumo.conferidasQtd}/{resumo.qtd}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={`Buscar ${rotuloContraparte.toLowerCase()}...`}
                  className="pl-9 h-9"
                />
              </div>
              <button
                onClick={() => setSomentePendentes((v) => !v)}
                className={cn(
                  "px-3 h-8 rounded-md text-xs font-medium transition-colors",
                  somentePendentes
                    ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                )}
              >
                {somentePendentes ? "Somente pendentes" : "Todos"}
              </button>
              <Button size="sm" onClick={gerarLote} className="ml-auto">
                <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
                Gerar lote {loteNumero} ({TAMANHO_LOTE} maiores)
              </Button>
            </div>

            {lote && (
              <div className="space-y-2 pt-1">
                <textarea
                  readOnly
                  value={lote}
                  rows={12}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-xs font-mono text-slate-700 dark:text-slate-200"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={copiar}>
                    {copiado ? "Copiado!" : "Copiar para o WhatsApp"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLote(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="w-8" />
                    <th className="text-left font-semibold px-4 py-2.5">{rotuloContraparte}</th>
                    <th className="text-right font-semibold px-4 py-2.5">Parcelas</th>
                    <th className="text-left font-semibold px-4 py-2.5">Mais antiga</th>
                    <th className="text-right font-semibold px-4 py-2.5">Maior atraso</th>
                    <th className="text-left font-semibold px-4 py-2.5">Conferencia</th>
                    <th className="text-right font-semibold px-4 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                        {somentePendentes
                          ? "Nada pendente aqui — tudo conferido."
                          : "Nenhum titulo encontrado."}
                      </td>
                    </tr>
                  )}
                  {grupos.map((g) => (
                    <Fragment key={g.contraparte}>
                      <tr
                        onClick={() => setAberto(aberto === g.contraparte ? null : g.contraparte)}
                        className={cn(
                          "border-b border-slate-100 dark:border-slate-800/70 cursor-pointer transition-colors",
                          aberto === g.contraparte
                            ? "bg-slate-100 dark:bg-slate-800/60"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        )}
                      >
                        <td className="pl-3 text-slate-400">
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 transition-transform",
                              aberto === g.contraparte && "rotate-90"
                            )}
                          />
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                          {g.contraparte}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {g.parcelas.length}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                          {formatDate(g.maisAntiga)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-300/80">
                          {g.maiorAtraso}d
                        </td>
                        <td className="px-4 py-2.5">
                          <ProgressoGrupo grupo={g} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                          {formatCurrency(g.total)}
                        </td>
                      </tr>
                      {aberto === g.contraparte && (
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <td colSpan={7} className="p-0">
                            <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 space-y-2">
                              {g.parcelas.map((p) => (
                                <LinhaParcela
                                  key={p.chave}
                                  parcela={p}
                                  decisao={decisoes.get(p.chave)}
                                  salvando={salvando === p.chave}
                                  onDecidir={decidir}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                {grupos.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-900/60 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr className="font-bold text-slate-900 dark:text-slate-50">
                      <td className="px-4 py-3" colSpan={6}>
                        {grupos.length} {tipo === "cp" ? "credores" : "clientes"} listados
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(grupos.reduce((s, g) => s + g.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ProgressoGrupo({ grupo }: { grupo: GrupoConferencia }) {
  if (grupo.conferidas === 0) {
    return <span className="text-xs text-slate-400">a conferir</span>;
  }
  if (grupo.conferidas === grupo.parcelas.length) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> conferido
      </span>
    );
  }
  return (
    <span className="text-xs text-amber-600 dark:text-amber-400">
      {grupo.conferidas} de {grupo.parcelas.length}
    </span>
  );
}

function LinhaParcela({
  parcela,
  decisao,
  salvando,
  onDecidir,
}: {
  parcela: ParcelaConferencia;
  decisao?: Decisao;
  salvando: boolean;
  onDecidir: (p: ParcelaConferencia, s: ConferenciaStatus | null, obs?: string) => void;
}) {
  const [obs, setObs] = useState(decisao?.observacao || "");

  useEffect(() => {
    setObs(decisao?.observacao || "");
  }, [decisao?.observacao]);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="tabular-nums text-sm text-slate-700 dark:text-slate-200">
          {formatDate(parcela.dueDate)}
        </span>
        <span className="text-xs text-red-600 dark:text-red-300/80">{parcela.diasVencido}d</span>
        <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {formatCurrency(parcela.valor)}
        </span>
        <span className="text-[11px] text-slate-400">
          titulo {parcela.billId}/{parcela.installmentId} · {parcela.companyName}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          {STATUS_CONFERENCIA.map((s) => (
            <button
              key={s.id}
              title={s.descricao}
              onClick={() => onDecidir(parcela, decisao?.status === s.id ? null : s.id, obs)}
              className={cn(
                "px-2.5 h-7 rounded-md text-xs font-medium transition-colors",
                decisao?.status === s.id
                  ? ESTILO_STATUS[s.id]
                  : "bg-slate-100 dark:bg-slate-700/60 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
      </div>

      {decisao && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              ESTILO_BADGE[decisao.status]
            )}
          >
            {STATUS_CONFERENCIA.find((s) => s.id === decisao.status)?.rotulo}
          </span>
          <Input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => {
              if (obs !== (decisao.observacao || "")) onDecidir(parcela, decisao.status, obs);
            }}
            placeholder="Observacao (ex: pago em 12/03 pelo Bradesco, comprovante no grupo)"
            className="h-8 flex-1 min-w-[240px] text-xs"
          />
          {decisao.atualizadoPor && (
            <span className="text-[11px] text-slate-400">por {decisao.atualizadoPor}</span>
          )}
        </div>
      )}
    </div>
  );
}

const CORES_KPI = {
  slate: "text-slate-500 bg-slate-100 dark:bg-slate-800",
  red: "text-red-600 bg-red-50 dark:bg-red-950/40",
  amber: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
} as const;

function Kpi({
  titulo,
  valor,
  sub,
  icone: Icone,
  cor,
}: {
  titulo: string;
  valor: string;
  sub: string;
  icone: React.ComponentType<{ className?: string }>;
  cor: keyof typeof CORES_KPI;
}) {
  return (
    <Card className="border-0 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{titulo}</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50 truncate">{valor}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
        </div>
        <div className={cn("shrink-0 rounded-lg p-2", CORES_KPI[cor])}>
          <Icone className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
