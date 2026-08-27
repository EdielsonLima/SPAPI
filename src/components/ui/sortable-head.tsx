"use client";

/**
 * Ordenacao de tabela reaproveitavel — hook + cabecalho clicavel.
 *
 * Existe porque as telas de Cadastros/Suprimentos repetiam a mesma tabela
 * simples sem ordenacao nenhuma. As tabelas grandes (contas-table.tsx,
 * executive-dashboard.tsx) tem estado de ordenacao proprio, entrelacado com
 * paginacao e filtros, e continuam como estao.
 *
 * Uso:
 *   const { sorted, sortProps } = useTableSort(itens, {
 *     id: (i) => i.id,
 *     nome: (i) => i.name,
 *   });
 *   ...
 *   <SortableHead campo="nome" {...sortProps}>Nome</SortableHead>
 *   {sorted.map(...)}
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

/** Valor comparavel extraido de uma linha. null/undefined/"" vao pro fim. */
type Chave<T> = (item: T) => string | number | boolean | null | undefined;

export interface SortProps<C extends string> {
  campoAtivo: C | null;
  dir: SortDir;
  onSort: (campo: C) => void;
}

export function useTableSort<T, C extends string>(
  itens: T[],
  chaves: Record<C, Chave<T>>,
  campoInicial: C | null = null,
  dirInicial: SortDir = "asc"
) {
  const [campoAtivo, setCampoAtivo] = useState<C | null>(campoInicial);
  const [dir, setDir] = useState<SortDir>(dirInicial);

  const onSort = (novo: C) => {
    if (novo === campoAtivo) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setCampoAtivo(novo);
      setDir("asc");
    }
  };

  const sorted = useMemo(() => {
    if (!campoAtivo) return itens;
    const extrair = chaves[campoAtivo];
    if (!extrair) return itens;
    return [...itens].sort((a, b) => {
      const va = extrair(a);
      const vb = extrair(b);
      // Vazio sempre por ultimo, independente da direcao — linha sem dado no
      // topo so atrapalha quem esta procurando o maior/menor.
      const vazioA = va === null || va === undefined || va === "";
      const vazioB = vb === null || vb === undefined || vb === "";
      if (vazioA && vazioB) return 0;
      if (vazioA) return 1;
      if (vazioB) return -1;

      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else if (typeof va === "boolean" && typeof vb === "boolean") cmp = Number(va) - Number(vb);
      // numeric:true faz "10" vir depois de "9" em codigos alfanumericos
      else cmp = String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
    // `chaves` e um literal recriado a cada render; as funcoes sao puras, entao
    // depender de campo/dir/itens basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, campoAtivo, dir]);

  return { sorted, sortProps: { campoAtivo, dir, onSort } as SortProps<C> };
}

export function SortableHead<C extends string>({
  campo,
  campoAtivo,
  dir,
  onSort,
  children,
  className,
}: SortProps<C> & {
  campo: C;
  children: React.ReactNode;
  className?: string;
}) {
  const ativo = campoAtivo === campo;
  const cls = className || "";
  return (
    <TableHead className={cls}>
      <button
        type="button"
        onClick={() => onSort(campo)}
        className={cn(
          // hover branco: os consumidores deste componente (Cadastros e
          // Suprimentos) tem cabecalho escuro. O cabecalho claro e o da
          // contas-table, que usa um SortableHead local, nao este.
          "flex items-center gap-1 w-full transition-colors hover:text-white",
          cls.includes("text-right") && "justify-end",
          cls.includes("text-center") && "justify-center"
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
    </TableHead>
  );
}
