// Fechamento de Caixa, lado do servidor (Edielson, 18/11/2026): busca no Sienge, na
// hora, os movimentos bancários e os saldos de que as regras de `fechamento-caixa.ts`
// precisam, e guarda o último resultado de cada período na memória.
//
// Por que ao vivo e não do cache do Painel: o fechamento de ontem só fica certo depois
// que a caixa lança, de manhã, o que falta de ontem (tarifas, extrato). O cache do Painel
// é o das 07:30. A consulta aqui é pequena (alguns dias de movimentos e poucos saldos).
//
// Por que não o saldo diário gravado (`cached_daily_balances`): ele é a foto tirada na
// manhã seguinte e não enxerga o que foi lançado depois (em 01 e 02/11/2026 ficou
// R$ 1.502.754,14 abaixo do que o Sienge mostra hoje). Só entra como reserva.
import { siengeBulkGet, siengeGet } from "@/lib/sienge";
import { BANK_NAMES, DIMBAN_ACCOUNT_COMPANY } from "@/lib/dimBanco";
import { getCachedCompanies, getCachedDailyBalance } from "@/lib/db";
import {
  datasDeSaldo,
  fecharCaixa,
  montarConta,
  type ContaFechamento,
  type FechamentoCaixa,
  type MovimentoCaixa,
  type SaldosPorData,
} from "@/lib/fechamento-caixa";
import { hojeEmBrasilia, janelaDoFechamento, somarDias } from "@/lib/dias-uteis";

/** 1ª busca de movimentos: desde tantos dias antes do período, para achar a última data com movimento de cada empresa. */
const DIAS_PARA_TRAS = 15;
/** Empresa parada há mais tempo que isso: procura até aqui. */
const DIAS_PARA_TRAS_LONGE = 75;
/** Reserva: quantos dias para trás procurar a foto gravada. */
const DIAS_DA_FOTO = 10;
const MAX_GUARDADOS = 40;

type R = Record<string, unknown>;

function autenticacao(): string {
  return "Basic " + Buffer.from(`${process.env.SIENGE_USERNAME!}:${process.env.SIENGE_PASSWORD!}`).toString("base64");
}

const texto = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Movimentos bancários (todos, não só os avulsos) com a data entre `de` e `ate`, só com os campos usados. */
export async function buscarMovimentos(de: string, ate: string): Promise<MovimentoCaixa[]> {
  const url = new URL(`${process.env.SIENGE_BULK_API_URL!}/bank-movement`);
  url.searchParams.set("startDate", de);
  url.searchParams.set("endDate", ate);
  url.searchParams.set("selectionType", "M");
  const resposta = await siengeBulkGet(url.toString(), autenticacao());
  if (resposta.status === 404) return [];
  if (!resposta.ok) throw new Error(`Sienge (movimentos bancários): ${resposta.status} ${resposta.statusText}`);
  const corpo = (await resposta.json()) as { data?: R[] };
  return (corpo?.data ?? []).map((m) => ({
    bankMovementId: Number(m.bankMovementId) || undefined,
    bankMovementDate: String(m.bankMovementDate ?? ""),
    bankMovementAmount: Number(m.bankMovementAmount) || 0,
    bankMovementOperationType: String(m.bankMovementOperationType ?? ""),
    bankMovementOriginId: texto(m.bankMovementOriginId),
    bankMovementOperationName: texto(m.bankMovementOperationName),
    bankMovementHistoricName: texto(m.bankMovementHistoricName),
    documentIdentificationName: texto(m.documentIdentificationName),
    documentIdentificationNumber: texto(m.documentIdentificationNumber),
    accountNumber: String(m.accountNumber ?? ""),
    companyId: Number(m.companyId) || 0,
    companyName: texto(m.companyName),
    billId: m.billId == null ? null : Number(m.billId),
    creditorName: texto(m.creditorName) ?? null,
    clientName: texto(m.clientName) ?? null,
  }));
}

/** Saldos que o Sienge devolve para a data: só das empresas que tiveram movimento nela. */
export async function buscarSaldos(data: string): Promise<Record<string, number>> {
  const contas: R[] = [];
  const pagina = async (offset: number) =>
    siengeGet<{ results?: R[]; resultSetMetadata?: { count?: number } }>(
      "/accounts-balances",
      { balanceDate: data, offset: String(offset), limit: "200" },
      { semCache: true }
    );
  const primeira = await pagina(0);
  contas.push(...(primeira?.results ?? []));
  const total = primeira?.resultSetMetadata?.count ?? contas.length;
  while (contas.length < total) {
    const mais = (await pagina(contas.length))?.results ?? [];
    if (mais.length === 0) break;
    contas.push(...mais);
  }
  const mapa: Record<string, number> = {};
  for (const c of contas) mapa[`${c.companyId}:${c.accountNumber}`] = Number(c.amount) || 0;
  return mapa;
}

async function contasDaRelacao(movimentos: MovimentoCaixa[]): Promise<ContaFechamento[]> {
  const nomes = new Map<number, string>();
  try {
    for (const e of await getCachedCompanies()) nomes.set(e.id, e.name);
  } catch { /* sem banco: vale o nome que vem no movimento */ }
  for (const m of movimentos) if (m.companyName && !nomes.has(m.companyId)) nomes.set(m.companyId, m.companyName);
  return Object.entries(DIMBAN_ACCOUNT_COMPANY).map(([conta, empresa]) =>
    montarConta(conta, empresa, nomes.get(empresa) ?? `Empresa ${empresa}`, BANK_NAMES[conta] ?? "")
  );
}

/** Foto gravada mais recente até `vespera` que tenha alguma das contas pedidas. */
export async function fotoGravada(vespera: string, contaIds: string[]): Promise<SaldosPorData> {
  for (let k = 0; k < DIAS_DA_FOTO; k++) {
    const data = somarDias(vespera, -k);
    try {
      const linhas = (await getCachedDailyBalance(data)) as { accountId: string; amount: number }[] | null;
      if (!linhas) continue;
      const mapa: Record<string, number> = {};
      for (const l of linhas) if (contaIds.includes(l.accountId)) mapa[l.accountId] = l.amount;
      if (Object.keys(mapa).length > 0) return { [data]: mapa };
    } catch { /* segue para o dia anterior */ }
  }
  return {};
}

async function montar(de: string, ate: string): Promise<FechamentoCaixa> {
  const t0 = Date.now();
  const companyIds = Array.from(new Set(Object.values(DIMBAN_ACCOUNT_COMPANY)));
  const inicio = somarDias(de, -DIAS_PARA_TRAS);
  let movimentos = await buscarMovimentos(inicio, ate);
  let datas = datasDeSaldo({ movimentos, companyIds, de, ate });
  if (datas.semAncora.length > 0) {
    const antigos = await buscarMovimentos(somarDias(de, -DIAS_PARA_TRAS_LONGE), somarDias(inicio, -1));
    movimentos = antigos.concat(movimentos);
    datas = datasDeSaldo({ movimentos, companyIds, de, ate });
  }

  const saldos: SaldosPorData = {};
  await Promise.all(
    [...datas.antes, ...datas.dentro].map(async (data) => {
      saldos[data] = await buscarSaldos(data);
    })
  );

  const contas = await contasDaRelacao(movimentos);
  const semSaldo = contas.filter((c) => !Object.values(saldos).some((mapa) => c.id in mapa)).map((c) => c.id);
  const fotos = semSaldo.length > 0 ? await fotoGravada(somarDias(de, -1), semSaldo) : undefined;

  const fechamento = fecharCaixa({ contas, movimentos, saldos, fotos, de, ate, geradoEm: new Date().toISOString(), empresasDoCaixa: companyIds });
  console.log(
    `[fechamento-caixa] ${de}..${ate}: ${movimentos.length} movimentos, saldos de ${Object.keys(saldos).length} datas, ${((Date.now() - t0) / 1000).toFixed(1)} s`
  );
  return fechamento;
}

// No globalThis pelo mesmo motivo do gzip do Painel (cache-sienge-resposta.ts): o Next
// empacota o instrumentation e as rotas em separado, cada um com a sua cópia do módulo.
const memoria = globalThis as typeof globalThis & {
  __fechamentoCaixa?: { guardados: Map<string, FechamentoCaixa>; emAndamento: Map<string, Promise<FechamentoCaixa>> };
};
const estado = (memoria.__fechamentoCaixa ??= { guardados: new Map(), emAndamento: new Map() });

/** O último fechamento calculado do período, se houver (de qualquer idade). */
export function fechamentoGuardado(de: string, ate: string): FechamentoCaixa | null {
  return estado.guardados.get(`${de}|${ate}`) ?? null;
}

/**
 * Fechamento do período. Sem `fresco`, devolve o último calculado (a tela mostra na hora
 * e pede `fresco` em seguida se ele for velho); com `fresco`, busca de novo no Sienge.
 * Pedidos iguais ao mesmo tempo dividem uma busca só.
 */
export async function obterFechamento(de: string, ate: string, opcoes?: { fresco?: boolean }): Promise<FechamentoCaixa> {
  const chave = `${de}|${ate}`;
  if (!opcoes?.fresco) {
    const guardado = estado.guardados.get(chave);
    if (guardado) return guardado;
  }
  const andando = estado.emAndamento.get(chave);
  if (andando) return andando;
  const busca = montar(de, ate)
    .then((dados) => {
      estado.guardados.delete(chave);
      estado.guardados.set(chave, dados);
      while (estado.guardados.size > MAX_GUARDADOS) estado.guardados.delete(estado.guardados.keys().next().value as string);
      return dados;
    })
    .finally(() => estado.emAndamento.delete(chave));
  estado.emAndamento.set(chave, busca);
  return busca;
}

/** Deixa pronto o fechamento que a aba abre (o do dia anterior), para ninguém esperar na 1ª abertura. */
export async function aquecerFechamento(motivo: string): Promise<void> {
  const { de, ate } = janelaDoFechamento(hojeEmBrasilia());
  try {
    await obterFechamento(de, ate, { fresco: true });
    console.log(`[fechamento-caixa] pronto (${motivo}): ${de}..${ate}`);
  } catch (e) {
    console.error(`[fechamento-caixa] preparo falhou (${motivo}):`, e instanceof Error ? e.message : e);
  }
}
