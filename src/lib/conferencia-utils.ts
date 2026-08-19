/**
 * Conferencia de titulos — mutirao CP/CR com o financeiro.
 *
 * Monta a lista do que esta vencido (a pagar) e inadimplente (a receber),
 * agrupado por credor/cliente, para conferencia titulo a titulo.
 *
 * Reaproveita de proposito as formulas de saldo ja validadas em dashboard-utils
 * (`effectiveOpenAmount`) — esta tela precisa mostrar exatamente os mesmos
 * numeros das telas de Contas Vencidas e Inadimplentes, senao a conferencia
 * discute valores que nao batem com o resto do sistema.
 */

import { SiengeIncome, SiengeOutcome } from "@/types/sienge";
import { effectiveOpenAmount, normalizeFilterText } from "@/lib/dashboard-utils";
import type { ConferenciaStatus } from "@/lib/db";

export type TipoConferencia = "cp" | "cr";

export const STATUS_CONFERENCIA: {
  id: ConferenciaStatus;
  rotulo: string;
  descricao: string;
}[] = [
  { id: "real", rotulo: "Real", descricao: "Divida existe — cobranca/pagamento em andamento" },
  { id: "pago", rotulo: "Ja pago", descricao: "Foi quitado, falta dar baixa no Sienge" },
  { id: "corrigir", rotulo: "Corrigir", descricao: "Existe mas o valor ou o titulo esta errado" },
  { id: "excluir", rotulo: "Nao existe", descricao: "Distrato, permuta ou duplicidade — sai do sistema" },
];

export interface ParcelaConferencia {
  chave: string;
  tipo: TipoConferencia;
  companyId: number;
  companyName: string;
  billId: number;
  installmentId: number;
  contraparte: string;
  documento: string;
  dueDate: string;
  diasVencido: number;
  valor: number;
}

export interface GrupoConferencia {
  contraparte: string;
  tipo: TipoConferencia;
  parcelas: ParcelaConferencia[];
  total: number;
  maisAntiga: string;
  maiorAtraso: number;
  conferidas: number;
}

/** Chave estavel de uma parcela — usada no banco e no estado da tela. */
export function chaveParcela(
  tipo: TipoConferencia, companyId: number, billId: number, installmentId: number
): string {
  return `${tipo}:${companyId}:${billId}:${installmentId}`;
}

function diasDesde(dataISO: string, hoje: string): number {
  return Math.round(
    (new Date(`${hoje}T12:00:00`).getTime() - new Date(`${dataISO}T12:00:00`).getTime()) / 86_400_000
  );
}

/**
 * Previsoes ficam de fora dos dois lados. Titulo de previsao nao e divida a
 * cobrar nem a pagar — entraria na lista so para ser descartado 600 vezes.
 */
function ehPrevisao(nomeDoc: string | null | undefined, forecast?: string | null): boolean {
  return forecast === "S" || normalizeFilterText(nomeDoc).startsWith("PREVISAO");
}

/** Parcelas vencidas a pagar (mesma regra da tela Contas Vencidas). */
export function parcelasAPagar(
  itens: SiengeOutcome[], hoje: string, incluiEmpresa: (nome: string) => boolean
): ParcelaConferencia[] {
  const out: ParcelaConferencia[] = [];
  for (const i of itens) {
    if (!incluiEmpresa(i.companyName)) continue;
    if (ehPrevisao(i.documentIdentificationName, i.forecastDocument)) continue;
    const venc = (i.dueDate || "").slice(0, 10);
    if (!venc || venc >= hoje) continue;
    const valor = effectiveOpenAmount(i, false);
    if (valor <= 0.005) continue;
    out.push({
      chave: chaveParcela("cp", i.companyId, i.billId, i.installmentId),
      tipo: "cp",
      companyId: i.companyId,
      companyName: i.companyName,
      billId: i.billId,
      installmentId: i.installmentId,
      contraparte: (i.creditorName || "").trim() || "(sem credor)",
      documento: i.documentIdentificationName || "",
      dueDate: venc,
      diasVencido: diasDesde(venc, hoje),
      valor,
    });
  }
  return out;
}

/** Parcelas inadimplentes a receber (mesma regra da tela Inadimplentes). */
export function parcelasAReceber(
  itens: SiengeIncome[],
  hoje: string,
  incluiEmpresa: (nome: string) => boolean,
  excluidos: Set<string>
): ParcelaConferencia[] {
  const out: ParcelaConferencia[] = [];
  for (const i of itens) {
    if (!incluiEmpresa(i.companyName)) continue;
    if (ehPrevisao(i.documentIdentificationName, i.forecastDocument)) continue;
    if (excluidos.has(`${i.companyId}-${i.billId}`)) continue;
    const venc = (i.dueDate || "").slice(0, 10);
    if (!venc || venc >= hoje) continue;
    const valor = effectiveOpenAmount(i, true);
    if (valor <= 0.005) continue;
    out.push({
      chave: chaveParcela("cr", i.companyId, i.billId, i.installmentId),
      tipo: "cr",
      companyId: i.companyId,
      companyName: i.companyName,
      billId: i.billId,
      installmentId: i.installmentId,
      contraparte: (i.clientName || "").trim() || "(sem cliente)",
      documento: i.documentIdentificationName || "",
      dueDate: venc,
      diasVencido: diasDesde(venc, hoje),
      valor,
    });
  }
  return out;
}

/**
 * Agrupa por credor/cliente e ordena por valor. A conversa no WhatsApp e por
 * pessoa, nao por parcela — e a concentracao e alta (os 20 maiores respondem
 * por ~2/3 do valor dos dois lados), entao atacar por valor rende muito mais
 * que atacar por data.
 */
export function agruparPorContraparte(
  parcelas: ParcelaConferencia[],
  decidida: (chave: string) => boolean
): GrupoConferencia[] {
  const mapa = new Map<string, ParcelaConferencia[]>();
  for (const p of parcelas) {
    if (!mapa.has(p.contraparte)) mapa.set(p.contraparte, []);
    mapa.get(p.contraparte)!.push(p);
  }
  const grupos: GrupoConferencia[] = [];
  for (const [contraparte, lista] of mapa) {
    lista.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    grupos.push({
      contraparte,
      tipo: lista[0].tipo,
      parcelas: lista,
      total: lista.reduce((s, p) => s + p.valor, 0),
      maisAntiga: lista[0].dueDate,
      maiorAtraso: Math.max(...lista.map((p) => p.diasVencido)),
      conferidas: lista.filter((p) => decidida(p.chave)).length,
    });
  }
  return grupos.sort((a, b) => b.total - a.total);
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Texto do lote para colar no grupo do WhatsApp. Uma pessoa por bloco, com as
 * parcelas listadas — e o formato em que a conversa realmente acontece.
 */
export function textoDoLote(
  grupos: GrupoConferencia[], tipo: TipoConferencia, numeroDoLote: number
): string {
  const quem = tipo === "cp" ? "credor" : "cliente";
  const titulo = tipo === "cp" ? "CONTAS VENCIDAS (a pagar)" : "INADIMPLENCIA (a receber)";
  const total = grupos.reduce((s, g) => s + g.total, 0);

  const linhas: string[] = [
    `*LOTE ${numeroDoLote} — ${titulo}*`,
    `${grupos.length} ${quem}${grupos.length === 1 ? "" : "es"} · ${brl(total)}`,
    "",
    "Para cada item, responder com: *REAL* / *JA PAGO* / *CORRIGIR* / *NAO EXISTE*",
    "",
  ];

  grupos.forEach((g, idx) => {
    linhas.push(`*${idx + 1}. ${g.contraparte}* — ${brl(g.total)}`);
    for (const p of g.parcelas) {
      linhas.push(
        `   • ${dataBR(p.dueDate)} (${p.diasVencido}d) · ${brl(p.valor)} · titulo ${p.billId}/${p.installmentId}`
      );
    }
    linhas.push("");
  });

  return linhas.join("\n").trim();
}
