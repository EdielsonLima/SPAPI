"use client";

/**
 * Painel lateral de detalhe do titulo.
 *
 * Substitui a linha expandida das tabelas de contas. A expansao abria uma
 * SEGUNDA tabela, com cabecalho proprio, dentro da primeira — dois grids
 * empilhados cujas colunas nao alinhavam, e era facil confundir as parcelas do
 * titulo aberto com as linhas dos titulos vizinhos.
 *
 * Painel lateral em vez de modal centralizado: a lista continua visivel ao
 * lado, o que importa quando se confere varios titulos em sequencia.
 *
 * As duas tabelas internas sao ordenaveis em TODAS as colunas, pelo mesmo
 * useTableSort das demais telas.
 */

import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTableSort, type SortProps } from "@/components/ui/sortable-head";
import { formatCurrency, formatDate, effectiveOpenAmount } from "@/lib/dashboard-utils";
import { cn } from "@/lib/utils";
import type { SiengeIncome, SiengeOutcome } from "@/types/sienge";

type ContasItem = SiengeOutcome | SiengeIncome;

function nomeContraparte(item: ContasItem): string {
  return (
    ("creditorName" in item ? item.creditorName : (item as SiengeIncome).clientName) || "—"
  );
}

function diasAtraso(vencimento: string, hoje: Date): number {
  const d = new Date(`${(vencimento || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.round((hoje.getTime() - d.getTime()) / 86_400_000);
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{children}</p>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100 tabular-nums">{children}</p>
    </div>
  );
}

function Secao({
  titulo,
  extra,
  children,
}: {
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

/**
 * Cabecalho ordenavel das tabelas internas.
 *
 * Nao usa o SortableHead de ui/, porque aquele renderiza um <TableHead> com o
 * estilo das tabelas grandes. Aqui as tabelas sao <th> simples e menores. A
 * logica de ordenacao e a mesma (useTableSort).
 */
function Th<C extends string>({
  campo,
  campoAtivo,
  dir,
  onSort,
  alinhamento = "left",
  children,
}: SortProps<C> & {
  campo: C;
  alinhamento?: "left" | "right";
  children: React.ReactNode;
}) {
  const ativo = campoAtivo === campo;
  return (
    <th
      className={cn(
        "py-1.5 font-semibold",
        alinhamento === "right" ? "text-right pl-2" : "text-left pr-3"
      )}
    >
      <button
        type="button"
        onClick={() => onSort(campo)}
        title="Ordenar por esta coluna"
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-slate-700 dark:hover:text-slate-200",
          alinhamento === "right" && "flex-row-reverse",
          ativo && "text-slate-700 dark:text-slate-200"
        )}
      >
        {children}
        {!ativo ? (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        ) : dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )}
      </button>
    </th>
  );
}

const CABECALHO_TABELA =
  "text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800";

type CampoPagamento = "data" | "operacao" | "liquido" | "juros" | "multa" | "desconto";
type CampoParcela = "parcela" | "vencimento" | "emissao" | "valor" | "saldo" | "status";

/** Conteudo do painel. Separado para os hooks nao ficarem sob condicional. */
function Conteudo({
  item,
  parcelas,
  observacao,
  carregandoObs,
  isIncome,
  onFechar,
}: {
  item: ContasItem;
  parcelas: ContasItem[];
  observacao?: string | null;
  carregandoObs?: boolean;
  isIncome: boolean;
  onFechar: () => void;
}) {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);

  const pagamentos = (item.payments || []).filter((p) => (p.netAmount || 0) !== 0);

  const { sorted: pagamentosOrdenados, sortProps: sortPag } = useTableSort<
    (typeof pagamentos)[number],
    CampoPagamento
  >(
    pagamentos,
    {
      data: (p) => p.paymentDate,
      operacao: (p) => p.operationTypeName,
      liquido: (p) => p.netAmount || 0,
      juros: (p) => p.interestAmount || 0,
      multa: (p) => p.fineAmount || 0,
      desconto: (p) => p.discountAmount || 0,
    },
    "data"
  );

  const { sorted: parcelasOrdenadas, sortProps: sortParc } = useTableSort<ContasItem, CampoParcela>(
    parcelas,
    {
      parcela: (p) => p.installmentId,
      vencimento: (p) => p.dueDate,
      emissao: (p) => p.issueDate,
      valor: (p) => p.originalAmount || 0,
      saldo: (p) => Math.max(0, effectiveOpenAmount(p, isIncome)),
      // ordena por saldo em aberto para "Aberto" e "Quitado" agruparem
      status: (p) => (effectiveOpenAmount(p, isIncome) > 0.005 ? 1 : 0),
    },
    "vencimento"
  );

  const totalPago = pagamentos.reduce((s, p) => s + (p.netAmount || 0), 0);
  const totalParcelas = parcelas.reduce((s, p) => s + (p.originalAmount || 0), 0);
  const totalAberto = parcelas.reduce((s, p) => s + Math.max(0, effectiveOpenAmount(p, isIncome)), 0);
  const atraso = diasAtraso(item.dueDate, hoje);
  const emAberto = effectiveOpenAmount(item, isIncome) > 0.005;

  return (
    <>
      {/* Cabecalho fixo: de qual linha veio, sempre a vista */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Rotulo>{isIncome ? "Cliente" : "Credor"}</Rotulo>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50 leading-tight">
              {nomeContraparte(item)}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Titulo {item.billId} · {item.companyName}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onFechar} className="shrink-0 -mt-1">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.documentIdentificationId?.trim() && (
            <Badge variant="outline" className="text-[10px]">
              {item.documentIdentificationId.trim()}
            </Badge>
          )}
          {emAberto && atraso > 0 && (
            <Badge variant="destructive" className="text-[10px] tabular-nums">
              {atraso} dias em atraso
            </Badge>
          )}
          {!emAberto && (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Quitado
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {parcelas.length} {parcelas.length === 1 ? "parcela" : "parcelas"}
          </Badge>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        <Secao titulo="Titulo">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <Campo rotulo="Vencimento">{formatDate(item.dueDate)}</Campo>
            <Campo rotulo="Emissao">{formatDate(item.issueDate)}</Campo>
            <Campo rotulo="Valor original">{formatCurrency(item.originalAmount || 0)}</Campo>
            <Campo rotulo="Saldo em aberto">
              {formatCurrency(Math.max(0, effectiveOpenAmount(item, isIncome)))}
            </Campo>
            <Campo rotulo="Desconto">{formatCurrency(item.discountAmount || 0)}</Campo>
            {!isIncome && <Campo rotulo="Imposto retido">{formatCurrency(item.taxAmount || 0)}</Campo>}
          </div>
        </Secao>

        {(carregandoObs || observacao) && (
          <Secao titulo="Observacao">
            {carregandoObs ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">{observacao}</p>
            )}
          </Secao>
        )}

        {pagamentos.length > 0 && (
          <Secao
            titulo={isIncome ? "Recebimentos" : "Pagamentos"}
            extra={
              <span className="text-xs text-slate-500 tabular-nums ml-auto">
                Total {formatCurrency(totalPago)}
              </span>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={CABECALHO_TABELA}>
                    <Th campo="data" {...sortPag}>Data</Th>
                    <Th campo="operacao" {...sortPag}>Operacao</Th>
                    <Th campo="liquido" alinhamento="right" {...sortPag}>Liquido</Th>
                    <Th campo="juros" alinhamento="right" {...sortPag}>Juros</Th>
                    <Th campo="multa" alinhamento="right" {...sortPag}>Multa</Th>
                    <Th campo="desconto" alinhamento="right" {...sortPag}>Desconto</Th>
                  </tr>
                </thead>
                <tbody>
                  {pagamentosOrdenados.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800/60">
                      <td className="py-1.5 pr-3 tabular-nums">{formatDate(p.paymentDate)}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{p.operationTypeName || "—"}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums font-medium text-emerald-600">
                        {formatCurrency(p.netAmount || 0)}
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{formatCurrency(p.interestAmount || 0)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{formatCurrency(p.fineAmount || 0)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{formatCurrency(p.discountAmount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        )}

        {parcelas.length > 0 && (
          <Secao
            titulo="Parcelas do titulo"
            extra={
              <span className="text-xs text-slate-500 tabular-nums ml-auto">
                {formatCurrency(totalParcelas)} · em aberto {formatCurrency(totalAberto)}
              </span>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={CABECALHO_TABELA}>
                    <Th campo="parcela" {...sortParc}>Parc.</Th>
                    <Th campo="vencimento" {...sortParc}>Vencimento</Th>
                    <Th campo="emissao" {...sortParc}>Emissao</Th>
                    <Th campo="valor" alinhamento="right" {...sortParc}>Valor</Th>
                    <Th campo="saldo" alinhamento="right" {...sortParc}>Saldo</Th>
                    <Th campo="status" {...sortParc}>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {parcelasOrdenadas.map((p) => {
                    const saldo = Math.max(0, effectiveOpenAmount(p, isIncome));
                    const aberta = saldo > 0.005;
                    const dias = diasAtraso(p.dueDate, hoje);
                    const atual = p.installmentId === item.installmentId;
                    return (
                      <tr
                        key={`${p.billId}-${p.installmentId}`}
                        className={
                          atual
                            ? "bg-slate-100 dark:bg-slate-800/60 font-semibold"
                            : "border-b border-slate-50 dark:border-slate-800/60"
                        }
                      >
                        <td className="py-1.5 pr-3 tabular-nums">{p.installmentId}</td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {formatDate(p.dueDate)}
                          {aberta && dias > 0 && (
                            <span className="ml-1.5 text-[10px] text-red-600 dark:text-red-300/80 tabular-nums">
                              {dias}d
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums text-slate-500">{formatDate(p.issueDate)}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">{formatCurrency(p.originalAmount || 0)}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">{formatCurrency(saldo)}</td>
                        <td className="py-1.5 pr-3">
                          <span
                            className={
                              aberta
                                ? "text-[10px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                : "text-[10px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }
                          >
                            {aberta ? "Aberto" : "Quitado"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">
              A linha destacada e a parcela que voce clicou na lista.
            </p>
          </Secao>
        )}
      </div>
    </>
  );
}

export function TituloDetalheSheet({
  aberto,
  onFechar,
  item,
  parcelas,
  observacao,
  carregandoObs,
  isIncome,
}: {
  aberto: boolean;
  onFechar: () => void;
  item: ContasItem | null;
  /** Todas as parcelas do mesmo titulo (billId). */
  parcelas: ContasItem[];
  observacao?: string | null;
  carregandoObs?: boolean;
  isIncome: boolean;
}) {
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[min(46rem,92vw)] overflow-y-auto p-0 gap-0"
      >
        {item && (
          <Conteudo
            item={item}
            parcelas={parcelas}
            observacao={observacao}
            carregandoObs={carregandoObs}
            isIncome={isIncome}
            onFechar={onFechar}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
