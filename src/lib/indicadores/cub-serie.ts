// Série do CUB-SC como as telas mostram: a automática (tabela indices_cub,
// Sinduscon-SC + myside) e, no fim, o mês lançado à mão quando o site ainda
// não publicou (regra em cub-manual.ts). Usada pela aba Indicadores e pelo
// resumo do MCP; o Orçamento/Comercial (/api/cub) aplica a mesma regra.
import { getCubOverride, getIndicadoresCub, type CubIndicadorRow } from "@/lib/db";
import { linhaManual, manualMaisNovo } from "./cub-manual";

export type CubManualInfo = {
  ano: number;
  mes: number;
  valor_m2: number;
  atualizadoEm: string;
  /** false = o site já publicou esse mês (ou um mais novo); o manual não é usado. */
  emUso: boolean;
};

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

export async function getSerieCub(): Promise<{
  /** Só a série automática (para saber se precisa buscar de novo). */
  auto: CubIndicadorRow[];
  /** Automática + mês manual em uso. */
  rows: CubIndicadorRow[];
  manual: CubManualInfo | null;
}> {
  const [auto, override] = await Promise.all([
    getIndicadoresCub(),
    getCubOverride().catch(() => null),
  ]);
  const linha = linhaManual(auto, override);
  if (!override || !linha) return { auto, rows: auto, manual: null };
  const emUso = manualMaisNovo(linha, auto[auto.length - 1]);
  const atualizadoEm = iso(override.updatedAt);
  return {
    auto,
    rows: emUso ? [...auto, { ...linha, atualizado_em: atualizadoEm }] : auto,
    manual: { ano: linha.ano, mes: linha.mes, valor_m2: linha.valor_m2, atualizadoEm, emUso },
  };
}
