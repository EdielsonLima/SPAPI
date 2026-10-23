"use client";

/**
 * Vocabulário do painel lateral de detalhe.
 *
 * O padrão do sistema é: linha de tabela NÃO expande. Clicar abre um painel
 * lateral, com a lista continuando visível ao lado — o que importa quando se
 * confere vários registros em sequência. A linha expandida abria uma segunda
 * tabela dentro da primeira, com cabeçalho próprio, e era fácil confundir o
 * conteúdo aberto com as linhas vizinhas.
 *
 * Estas peças ficam aqui para que todo painel novo saia igual: mesma largura,
 * mesmo cabeçalho fixo, mesma tipografia de rótulo, mesmas tabelas internas
 * ordenáveis em todas as colunas.
 *
 * Consumidores: `titulo-detalhe-sheet.tsx` (detalhe de um título),
 * `detalhamento-sheet.tsx` (parcelas de um credor/cliente).
 */

import { useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTableSort, type SortProps } from "@/components/ui/sortable-head";
import { cn } from "@/lib/utils";
import type { SiengeIncome, SiengeOutcome } from "@/types/sienge";

export type ItemDetalhe = SiengeOutcome | SiengeIncome;

export interface ColunaDetalhe {
  label: string;
  align?: "left" | "center" | "right";
  render: (item: ItemDetalhe) => React.ReactNode;
  /**
   * Valor usado para ordenar a coluna. Sem ele a coluna nao ordena — nao da
   * para ordenar pelo texto renderizado, porque "R$ 9.000,00" viria depois de
   * "R$ 100.000,00" na comparacao alfabetica.
   */
  sortValue?: (item: ItemDetalhe) => string | number | null | undefined;
}

/** Casca do painel: lado direito, largura e rolagem padronizadas. */
export function PainelLateral({
  aberto,
  onFechar,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[min(46rem,92vw)] overflow-y-auto p-0 gap-0"
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Cabeçalho fixo do painel: diz de qual linha o conteúdo veio e não sai da
 * vista enquanto se rola o corpo.
 */
export function CabecalhoPainel({
  rotulo,
  titulo,
  subtitulo,
  badges,
  acoes,
  onFechar,
}: {
  rotulo: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  badges?: React.ReactNode;
  /** Botoes de acao do painel (ex.: gerar o extrato em PDF). */
  acoes?: React.ReactNode;
  onFechar: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Rotulo>{rotulo}</Rotulo>
          {/* SheetTitle/SheetDescription no lugar de <h2>/<p> soltos: o Radix
              exige um titulo no dialogo para o leitor de tela anunciar de onde
              o painel veio (sem isso ele reclama no console). */}
          <SheetTitle className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50 font-marca leading-tight">
            {titulo}
          </SheetTitle>
          {subtitulo && (
            <SheetDescription className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {subtitulo}
            </SheetDescription>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 -mt-1">
          {acoes}
          <Button variant="ghost" size="sm" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {badges && <div className="mt-3 flex flex-wrap items-center gap-1.5">{badges}</div>}
    </div>
  );
}

export function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{children}</p>
  );
}

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100 tabular-nums">{children}</p>
    </div>
  );
}

export function Secao({
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-marca">
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export const CABECALHO_TABELA =
  "text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800";

/**
 * Cabeçalho ordenável das tabelas internas do painel.
 *
 * Não usa o SortableHead de ui/, porque aquele renderiza um <TableHead> com o
 * estilo das tabelas grandes. Aqui as tabelas são <th> simples e menores. A
 * lógica de ordenação é a mesma (useTableSort).
 */
export function ThOrdenavel<C extends string>({
  campo,
  campoAtivo,
  dir,
  onSort,
  alinhamento = "left",
  children,
}: SortProps<C> & {
  campo: C;
  alinhamento?: "left" | "center" | "right";
  children: React.ReactNode;
}) {
  const ativo = campoAtivo === campo;
  return (
    <th
      className={cn(
        "py-1.5 font-semibold",
        alinhamento === "right" && "text-right pl-2",
        alinhamento === "center" && "text-center px-2",
        alinhamento === "left" && "text-left pr-3"
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

const CLASSE_CELULA = {
  left: "py-1.5 pr-3 text-left",
  center: "py-1.5 px-2 text-center",
  right: "py-1.5 pl-2 text-right tabular-nums",
} as const;

const alinhamentoDe = (a?: string): "left" | "center" | "right" =>
  a === "right" ? "right" : a === "center" ? "center" : "left";

/**
 * Tabela interna do painel. Os dois paineis (detalhe do titulo e detalhe do
 * credor/cliente) passam por aqui, entao a mesma lista de colunas rende o mesmo
 * grid nos dois — era divergir aqui que fazia um lugar ter Status e o outro nao.
 */
export function TabelaDetalhe({
  itens,
  colunas,
  ordemPadrao,
  destacar,
  rodape,
}: {
  itens: ItemDetalhe[];
  colunas: ColunaDetalhe[];
  /** Ordem inicial, antes de o usuario clicar em alguma coluna. */
  ordemPadrao?: (a: ItemDetalhe, b: ItemDetalhe) => number;
  /** Linha em destaque (a parcela de onde o painel foi aberto). */
  destacar?: (item: ItemDetalhe) => boolean;
  rodape?: React.ReactNode;
}) {
  const base = useMemo(
    () => (ordemPadrao ? [...itens].sort(ordemPadrao) : itens),
    [itens, ordemPadrao]
  );

  // Chaves de ordenacao derivadas das colunas: "c0", "c1"… Coluna sem
  // `sortValue` entra com uma chave neutra e o cabecalho dela nao vira botao.
  const chaves = useMemo(() => {
    const map: Record<string, (i: ItemDetalhe) => string | number | null | undefined> = {};
    colunas.forEach((c, i) => {
      map[`c${i}`] = c.sortValue ?? (() => null);
    });
    return map;
  }, [colunas]);

  const { sorted, sortProps } = useTableSort<ItemDetalhe, string>(base, chaves);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-marca">
        <thead>
          <tr className={CABECALHO_TABELA}>
            {colunas.map((c, i) => {
              const al = alinhamentoDe(c.align);
              if (!c.sortValue) {
                return (
                  <th
                    key={i}
                    className={cn(
                      "py-1.5 font-semibold",
                      al === "right" && "text-right pl-2",
                      al === "center" && "text-center px-2",
                      al === "left" && "text-left pr-3"
                    )}
                  >
                    {c.label}
                  </th>
                );
              }
              return (
                <ThOrdenavel key={i} campo={`c${i}`} alinhamento={al} {...sortProps}>
                  {c.label}
                </ThOrdenavel>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => (
            <tr
              key={`${item.billId}-${item.installmentId}-${idx}`}
              className={
                destacar?.(item)
                  ? "bg-slate-100 dark:bg-slate-800/60 font-semibold"
                  : "border-b border-slate-50 dark:border-slate-800/60"
              }
            >
              {colunas.map((c, i) => (
                <td key={i} className={CLASSE_CELULA[alinhamentoDe(c.align)]}>
                  {c.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rodape}
    </div>
  );
}
