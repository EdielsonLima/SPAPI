// Saldo diário recalculado, lado do servidor (18/11/2026): busca no Sienge os movimentos
// bancários do mês e o saldo nas últimas datas com movimento de cada empresa, e devolve o
// saldo de cada conta em cada dia no formato que o gráfico Evolução do Saldo já lia.
// Regras em `saldos-diarios.ts`; as buscas são as do Fechamento de Caixa.
//
// Memória: o último resultado de cada mês fica guardado e, com menos de 2 minutos, volta
// direto. Mais velho: mês que já fechou volta na hora e é refeito em segundo plano; período
// que inclui hoje espera a consulta nova (1 a 2 s), porque dele saem o saldo de hoje do
// cartão Saldo Total e o último ponto do gráfico, que têm de ser o mesmo número.
import { expectedDimBancoKeys } from "@/lib/dimBanco";
import { buscarMovimentos, buscarSaldos, fotoGravada } from "@/lib/fechamento-caixa-servidor";
import type { SaldosPorData } from "@/lib/fechamento-caixa";
import { datasDeAncora, saldosDiarios, type SaldosDiarios } from "@/lib/saldos-diarios";
import { hojeEmBrasilia, somarDias } from "@/lib/dias-uteis";

/** Movimentos desde tantos dias antes do período, para achar a última data com movimento de cada empresa. */
const DIAS_PARA_TRAS = 15;
const NOVO_MS = 120_000;
const MAX_GUARDADOS = 12;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RespostaSaldosDiarios {
  dailyBalances: SaldosDiarios;
  /** ISO do instante em que o servidor buscou no Sienge. */
  geradoEm: string;
}

/** "AAAA-MM" ou "last7" → primeiro e último dia (o mês corrente vai só até hoje). null se inválido ou futuro. */
export function periodoDoMes(mes: string, hoje: string): { de: string; ate: string } | null {
  if (mes === "last7") return { de: somarDias(hoje, -6), ate: hoje };
  if (!MES.test(mes)) return null;
  const de = `${mes}-01`;
  if (de > hoje) return null;
  const [ano, m] = mes.split("-").map(Number);
  const proximo = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
  const fim = somarDias(proximo, -1);
  return { de, ate: fim < hoje ? fim : hoje };
}

async function montar(de: string, ate: string): Promise<RespostaSaldosDiarios> {
  const t0 = Date.now();
  const movimentos = await buscarMovimentos(somarDias(de, -DIAS_PARA_TRAS), ate);
  const saldos: SaldosPorData = {};
  await Promise.all(
    datasDeAncora(movimentos, ate).map(async (data) => {
      saldos[data] = await buscarSaldos(data);
    })
  );
  // Contas da relação cuja empresa não se moveu na janela: o saldo não mudou, vale a foto.
  const semSaldo = expectedDimBancoKeys().filter((conta) => !Object.values(saldos).some((mapa) => conta in mapa));
  const fotos = semSaldo.length > 0 ? await fotoGravada(ate, semSaldo) : undefined;
  const dailyBalances = saldosDiarios({ movimentos, saldos, fotos, de, ate });
  console.log(`[saldos-diarios] ${de}..${ate}: ${movimentos.length} movimentos, saldos de ${Object.keys(saldos).length} datas, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { dailyBalances, geradoEm: new Date().toISOString() };
}

// No globalThis pelo mesmo motivo do gzip do Painel: instrumentation e rotas são pacotes separados.
const memoria = globalThis as typeof globalThis & {
  __saldosDiarios?: { guardados: Map<string, { dados: RespostaSaldosDiarios; em: number }>; emAndamento: Map<string, Promise<RespostaSaldosDiarios>> };
};
const estado = (memoria.__saldosDiarios ??= { guardados: new Map(), emAndamento: new Map() });

function buscar(chave: string, de: string, ate: string): Promise<RespostaSaldosDiarios> {
  const andando = estado.emAndamento.get(chave);
  if (andando) return andando;
  const busca = montar(de, ate)
    .then((dados) => {
      estado.guardados.delete(chave);
      estado.guardados.set(chave, { dados, em: Date.now() });
      while (estado.guardados.size > MAX_GUARDADOS) estado.guardados.delete(estado.guardados.keys().next().value as string);
      return dados;
    })
    .finally(() => estado.emAndamento.delete(chave));
  estado.emAndamento.set(chave, busca);
  return busca;
}

/** Saldo diário do mês ("AAAA-MM" ou "last7"); null se o mês for inválido ou futuro. */
export async function obterSaldosDiarios(mes: string): Promise<RespostaSaldosDiarios | null> {
  const hoje = hojeEmBrasilia();
  const periodo = periodoDoMes(mes, hoje);
  if (!periodo) return null;
  const chave = `${periodo.de}|${periodo.ate}`;
  const guardado = estado.guardados.get(chave);
  if (!guardado) return buscar(chave, periodo.de, periodo.ate);
  if (Date.now() - guardado.em <= NOVO_MS) return guardado.dados;
  if (periodo.ate < hoje) {
    buscar(chave, periodo.de, periodo.ate).catch((e) => console.error("[saldos-diarios] renovação falhou:", e instanceof Error ? e.message : e));
    return guardado.dados;
  }
  try {
    return await buscar(chave, periodo.de, periodo.ate);
  } catch (e) {
    console.error("[saldos-diarios] Sienge não respondeu; fica o último resultado:", e instanceof Error ? e.message : e);
    return guardado.dados;
  }
}

/**
 * Saldo de hoje de cada conta, atualizado: { "empresa:conta": saldo }. É o último dia do
 * saldo diário do mês corrente, o mesmo dado do gráfico. null se o Sienge não responder.
 */
export async function saldosAtualizadosDeHoje(): Promise<Map<string, number> | null> {
  const hoje = hojeEmBrasilia();
  try {
    const dados = await obterSaldosDiarios(hoje.slice(0, 7));
    const doDia = dados?.dailyBalances[hoje];
    if (!doDia || doDia.length === 0) return null;
    return new Map(doDia.map((c) => [c.accountId, c.amount]));
  } catch (e) {
    console.error("[saldos-diarios] saldo de hoje indisponível:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Deixa pronto o mês corrente, que é o que o gráfico abre. */
export async function aquecerSaldosDiarios(motivo: string): Promise<void> {
  const hoje = hojeEmBrasilia();
  const periodo = periodoDoMes(hoje.slice(0, 7), hoje);
  if (!periodo) return;
  try {
    await buscar(`${periodo.de}|${periodo.ate}`, periodo.de, periodo.ate);
    console.log(`[saldos-diarios] pronto (${motivo}): ${periodo.de}..${periodo.ate}`);
  } catch (e) {
    console.error(`[saldos-diarios] preparo falhou (${motivo}):`, e instanceof Error ? e.message : e);
  }
}
