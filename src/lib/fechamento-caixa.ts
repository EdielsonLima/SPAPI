// Fechamento de Caixa (Edielson, 18/11/2026): para um dia ou período, quanto cada conta
// bancária tinha antes, o que entrou, o que saiu e com quanto fechou.
//
// Regras conferidas com o Sienge em 18/11/2026 (movimentos bancários de 2026 inteiro e
// saldos de outubro e novembro), nas 17 contas da relação (`dimBanco.ts`):
//
//  1. Só o movimento bancário diz em que conta o dinheiro entrou ou saiu
//     (`accountNumber` + `companyId`); o pagamento e o recebimento do título não dizem.
//  2. Origem CR: entrada = recebimento; saída = só "Desconto concedido", que abate a entrada.
//     Origem CP: saída = pagamento; entrada = só "Retenção impostos" e "Desconto obtido",
//     sempre do mesmo título e no mesmo dia, que abatem a saída. Assim Entradas e Saídas
//     são o que passou de fato pelo banco (o líquido), como no extrato.
//  3. Avulso (origem BC): transferência entre empresas ou contas, saque, depósito e resgate
//     de aplicação vão para Transferências (entre as contas da lista elas se anulam; o que
//     sobra foi para fora: holding, caixa em dinheiro, mútuo). Tarifa bancária é saída.
//  4. O `/accounts-balances` do Sienge só devolve as contas das empresas que tiveram
//     movimento na data pedida (domingo e feriado voltam vazios). Por isso o saldo de uma
//     conta numa data é o saldo devolvido na última data com movimento da empresa, mais os
//     movimentos da conta de lá até a data.
//  5. Lançamento feito há pouco aparece nos movimentos antes de aparecer no saldo do
//     Sienge. O saldo final é o saldo anterior + os movimentos; o saldo que o Sienge devolve
//     para o fim do período vem ao lado, e a diferença (quando há) é mostrada, não escondida.
//
// Tudo aqui é função pura: a rota busca no Sienge e a tela filtra e soma.
import { detalheDaConta, instituicaoDaConta } from "./saldos-por-banco";
import { somarDias } from "./dias-uteis";

/** O que o fechamento usa do movimento bancário do Sienge (`SiengeBankMovement`). */
export interface MovimentoCaixa {
  bankMovementId?: number;
  bankMovementDate: string;
  bankMovementAmount: number;
  /** "E" entrada ou "S" saída. */
  bankMovementOperationType: string;
  /** CP, CR, BC… */
  bankMovementOriginId?: string;
  bankMovementOperationName?: string;
  bankMovementHistoricName?: string;
  documentIdentificationName?: string;
  documentIdentificationNumber?: string;
  accountNumber: string;
  companyId: number;
  companyName?: string;
  billId?: number | null;
  creditorName?: string | null;
  clientName?: string | null;
}

export interface ContaFechamento {
  /** "companyId:accountNumber", a mesma chave do saldo. */
  id: string;
  conta: string;
  companyId: number;
  empresa: string;
  /** Nome do banco no mapa das 17 contas ("Aplicação Bradesco", "BTG Pactual - CH"). */
  bancoNome: string;
  /** Instituição ("Bradesco", "BTG Pactual"). */
  instituicao: string;
  /** O que separa a conta das outras do mesmo banco: "Aplicação", "CH", "JP". */
  detalhe: string | null;
}

export type TipoLancamento = "entrada" | "saida" | "transferencia";

export interface Lancamento {
  id: number;
  data: string;
  contaId: string;
  tipo: TipoLancamento;
  /** Efeito no saldo da conta: positivo aumenta, negativo diminui. */
  efeito: number;
  /** Retenção ou desconto: lançamento que abate o pagamento ou o recebimento do título. */
  abate: boolean;
  quem: string;
  documento: string;
  historico: string;
  titulo: number | null;
}

export interface LinhaConta extends ContaFechamento {
  saldoAnterior: number | null;
  entradas: number;
  saidas: number;
  /** Líquido das transferências: positivo entrou, negativo saiu. */
  transferencias: number;
  saldoFinal: number | null;
  /** Saldo que o Sienge devolve para o fim do período; null se a empresa não teve movimento nele. */
  saldoSienge: number | null;
  /** saldoSienge − saldoFinal; 0 quando fecha ou quando não há saldo do Sienge no período. */
  diferenca: number;
  /** Saldo saiu da foto gravada pelo painel, porque o Sienge não devolveu a conta. */
  estimado: boolean;
  /** Lançamentos no período (sem contar retenção e desconto). */
  qtd: number;
}

export interface PagoEmDinheiro {
  total: number;
  qtd: number;
}

export interface FechamentoCaixa {
  de: string;
  ate: string;
  /** ISO do instante em que o servidor buscou no Sienge. */
  geradoEm: string;
  linhas: LinhaConta[];
  lancamentos: Lancamento[];
  pagoEmDinheiro: PagoEmDinheiro;
  avisos: string[];
}

/** { data: { contaId: saldo } } */
export type SaldosPorData = Record<string, Record<string, number>>;

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const semAcento = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

export const dataDoMovimento = (m: Pick<MovimentoCaixa, "bankMovementDate">) => String(m.bankMovementDate).slice(0, 10);
export const contaDoMovimento = (m: Pick<MovimentoCaixa, "companyId" | "accountNumber">) => `${m.companyId}:${m.accountNumber}`;

/** Dinheiro que só trocou de conta: transferência, saque, depósito, resgate/aplicação. Nunca título. */
export function ehTransferencia(m: Pick<MovimentoCaixa, "bankMovementOriginId" | "bankMovementOperationName" | "documentIdentificationName">): boolean {
  const origem = semAcento(m.bankMovementOriginId);
  if (origem === "CP" || origem === "CR") return false;
  if (semAcento(m.documentIdentificationName).includes("TRANSFER")) return true;
  return /TRANSFER|SAQUE|DEPOSITO/.test(semAcento(m.bankMovementOperationName));
}

/** Em que coluna o movimento entra e quanto ele mexe no saldo. */
export function classificar(m: MovimentoCaixa): { tipo: TipoLancamento; efeito: number; abate: boolean } {
  const entrada = semAcento(m.bankMovementOperationType) === "E";
  const efeito = (entrada ? 1 : -1) * Math.abs(m.bankMovementAmount || 0);
  const origem = semAcento(m.bankMovementOriginId);
  if (origem === "CR") return { tipo: "entrada", efeito, abate: !entrada };
  if (origem === "CP") return { tipo: "saida", efeito, abate: entrada };
  if (ehTransferencia(m)) return { tipo: "transferencia", efeito, abate: false };
  return { tipo: entrada ? "entrada" : "saida", efeito, abate: false };
}

/** A conta com o banco e a instituição do mapa das 17 contas. */
export function montarConta(conta: string, companyId: number, empresa: string, bancoNome: string): ContaFechamento {
  return {
    id: `${companyId}:${conta}`,
    conta,
    companyId,
    empresa,
    bancoNome,
    instituicao: instituicaoDaConta({ bankName: bancoNome, bankCode: "", bankAccountDescription: conta }),
    detalhe: detalheDaConta(bancoNome),
  };
}

/**
 * Saldo da conta no fim do dia `data`, a partir dos saldos conhecidos: usa o da última
 * data ≤ `data` e soma os movimentos de lá até `data`; se só houver saldo depois, volta
 * dele descontando os movimentos. null se a conta não aparece em nenhuma data.
 * `liquido` = { dia: efeito no saldo } da conta, cobrindo o intervalo entre as datas.
 */
export function saldoNaData(contaId: string, data: string, saldos: SaldosPorData, liquido: Record<string, number>): number | null {
  const datas = Object.keys(saldos).filter((d) => saldos[d] && contaId in saldos[d]).sort();
  if (datas.length === 0) return null;
  let antes: string | undefined;
  for (const d of datas) if (d <= data) antes = d;
  if (antes !== undefined) {
    let v = saldos[antes][contaId];
    for (const [d, n] of Object.entries(liquido)) if (d > antes && d <= data) v += n;
    return v;
  }
  const depois = datas[0];
  let v = saldos[depois][contaId];
  for (const [d, n] of Object.entries(liquido)) if (d > data && d <= depois) v -= n;
  return v;
}

/**
 * Em que datas pedir saldo ao Sienge: para cada empresa, a última data com movimento antes
 * do período (saldo anterior) e a última dentro dele (conferência). O Sienge só devolve a
 * empresa na data em que ela teve movimento, em qualquer conta dela.
 */
export function datasDeSaldo(args: { movimentos: MovimentoCaixa[]; companyIds: number[]; de: string; ate: string }): {
  antes: string[];
  dentro: string[];
  /** Empresas sem movimento antes do período na janela recebida. */
  semAncora: number[];
} {
  const { movimentos, companyIds, de, ate } = args;
  const ultimaAntes = new Map<number, string>();
  const ultimaDentro = new Map<number, string>();
  const quer = new Set(companyIds);
  for (const m of movimentos) {
    if (!quer.has(m.companyId)) continue;
    const d = dataDoMovimento(m);
    if (d < de) {
      if ((ultimaAntes.get(m.companyId) ?? "") < d) ultimaAntes.set(m.companyId, d);
    } else if (d <= ate) {
      if ((ultimaDentro.get(m.companyId) ?? "") < d) ultimaDentro.set(m.companyId, d);
    }
  }
  const unicas = (m: Map<number, string>) => Array.from(new Set(m.values())).sort();
  return { antes: unicas(ultimaAntes), dentro: unicas(ultimaDentro), semAncora: companyIds.filter((c) => !ultimaAntes.has(c)) };
}

/** Pagamentos de título feitos pela conta CAIXA (dinheiro) das empresas: não passam pelos bancos. */
export function pagoEmDinheiro(movimentos: MovimentoCaixa[], de: string, ate: string, companyIds: number[]): PagoEmDinheiro {
  const quer = new Set(companyIds);
  let total = 0;
  let qtd = 0;
  for (const m of movimentos) {
    if (!quer.has(m.companyId)) continue;
    if (semAcento(m.accountNumber) !== "CAIXA" || semAcento(m.bankMovementOriginId) !== "CP") continue;
    const d = dataDoMovimento(m);
    if (d < de || d > ate) continue;
    const { efeito, abate } = classificar(m);
    total -= efeito;
    if (!abate) qtd++;
  }
  return { total: r2(total), qtd };
}

function quemDoMovimento(m: MovimentoCaixa, tipo: TipoLancamento): string {
  if (tipo === "transferencia") return (m.bankMovementHistoricName || m.bankMovementOperationName || "Transferência").trim();
  return (m.clientName || m.creditorName || m.bankMovementHistoricName || m.bankMovementOperationName || "").trim();
}

/**
 * O fechamento do período. `movimentos` precisa cobrir do saldo mais antigo em `saldos` até
 * `ate`; `fotos` (o saldo diário gravado pelo painel) só entra para conta que o Sienge não
 * devolveu em data nenhuma, e a linha sai marcada como estimada.
 */
export function fecharCaixa(args: {
  contas: ContaFechamento[];
  movimentos: MovimentoCaixa[];
  saldos: SaldosPorData;
  fotos?: SaldosPorData;
  de: string;
  ate: string;
  geradoEm: string;
  /** Empresas cujo pagamento em dinheiro (conta CAIXA) entra na linha informativa. */
  empresasDoCaixa?: number[];
}): FechamentoCaixa {
  const { contas, movimentos, saldos, fotos, de, ate, geradoEm } = args;
  const vespera = somarDias(de, -1);
  const daLista = new Map(contas.map((c) => [c.id, c]));

  const liquido = new Map<string, Record<string, number>>();
  const lancamentos: Lancamento[] = [];
  const soma = new Map<string, { entradas: number; saidas: number; transferencias: number; qtd: number }>();
  let sequencia = 0;
  for (const m of movimentos) {
    const contaId = contaDoMovimento(m);
    if (!daLista.has(contaId)) continue;
    const data = dataDoMovimento(m);
    const { tipo, efeito, abate } = classificar(m);
    if (efeito === 0) continue;
    const porDia = liquido.get(contaId) ?? {};
    porDia[data] = (porDia[data] || 0) + efeito;
    liquido.set(contaId, porDia);
    if (data < de || data > ate) continue;
    const s = soma.get(contaId) ?? { entradas: 0, saidas: 0, transferencias: 0, qtd: 0 };
    if (tipo === "entrada") s.entradas += efeito;
    else if (tipo === "saida") s.saidas -= efeito;
    else s.transferencias += efeito;
    if (!abate) s.qtd++;
    soma.set(contaId, s);
    lancamentos.push({
      id: m.bankMovementId ?? -++sequencia,
      data,
      contaId,
      tipo,
      efeito: r2(efeito),
      abate,
      quem: quemDoMovimento(m, tipo),
      // Na transferência o número do documento é o trajeto ("SP BB/SB BRAD"); o nome só repete "transferência".
      documento:
        tipo === "transferencia" && m.documentIdentificationNumber
          ? m.documentIdentificationNumber.trim()
          : [m.documentIdentificationName, m.documentIdentificationNumber].filter(Boolean).join(" ").trim(),
      historico: (m.bankMovementHistoricName || "").trim(),
      titulo: m.billId ?? null,
    });
  }
  lancamentos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : Math.abs(b.efeito) - Math.abs(a.efeito)));

  const saldosAntes: SaldosPorData = {};
  const saldosDentro: SaldosPorData = {};
  for (const [d, mapa] of Object.entries(saldos)) {
    if (d <= vespera) saldosAntes[d] = mapa;
    else if (d <= ate) saldosDentro[d] = mapa;
  }

  const avisos: string[] = [];
  const linhas: LinhaConta[] = contas.map((conta) => {
    const liq = liquido.get(conta.id) ?? {};
    const s = soma.get(conta.id) ?? { entradas: 0, saidas: 0, transferencias: 0, qtd: 0 };
    let estimado = false;
    let anterior = saldoNaData(conta.id, vespera, saldosAntes, liq);
    if (anterior === null) anterior = saldoNaData(conta.id, vespera, saldos, liq);
    if (anterior === null && fotos) {
      anterior = saldoNaData(conta.id, vespera, fotos, liq);
      estimado = anterior !== null;
    }
    const saldoFinal = anterior === null ? null : anterior + s.entradas - s.saidas + s.transferencias;
    const sienge = saldoNaData(conta.id, ate, saldosDentro, liq);
    return {
      ...conta,
      saldoAnterior: anterior === null ? null : r2(anterior),
      entradas: r2(s.entradas),
      saidas: r2(s.saidas),
      transferencias: r2(s.transferencias),
      saldoFinal: saldoFinal === null ? null : r2(saldoFinal),
      saldoSienge: sienge === null ? null : r2(sienge),
      diferenca: sienge === null || saldoFinal === null ? 0 : r2(sienge - saldoFinal),
      estimado,
      qtd: s.qtd,
    };
  });

  const semSaldo = linhas.filter((l) => l.saldoAnterior === null);
  if (semSaldo.length > 0) avisos.push(`Sem saldo do Sienge para ${semSaldo.length === 1 ? "a conta" : "as contas"} ${semSaldo.map((l) => l.conta).join(", ")}.`);
  const estimadas = linhas.filter((l) => l.estimado);
  if (estimadas.length > 0) avisos.push(`Saldo estimado pela última posição gravada em ${estimadas.length === 1 ? "1 conta" : `${estimadas.length} contas`}: ${estimadas.map((l) => l.conta).join(", ")}.`);

  return {
    de,
    ate,
    geradoEm,
    linhas,
    lancamentos,
    pagoEmDinheiro: pagoEmDinheiro(movimentos, de, ate, args.empresasDoCaixa ?? Array.from(new Set(contas.map((c) => c.companyId)))),
    avisos,
  };
}

export interface Totais {
  saldoAnterior: number;
  entradas: number;
  saidas: number;
  transferencias: number;
  saldoFinal: number;
  /** Saldo no Sienge no fim do período, quando ele difere do calculado; senão igual ao saldoFinal. */
  saldoSienge: number;
  diferenca: number;
  qtd: number;
  /** Alguma conta ficou sem saldo: o total não inclui o saldo dela. */
  incompleto: boolean;
}

export function totalizar(linhas: LinhaConta[]): Totais {
  const t = { saldoAnterior: 0, entradas: 0, saidas: 0, transferencias: 0, saldoFinal: 0, diferenca: 0, qtd: 0 };
  let incompleto = false;
  for (const l of linhas) {
    if (l.saldoAnterior === null || l.saldoFinal === null) incompleto = true;
    t.saldoAnterior += l.saldoAnterior ?? 0;
    t.entradas += l.entradas;
    t.saidas += l.saidas;
    t.transferencias += l.transferencias;
    t.saldoFinal += l.saldoFinal ?? 0;
    t.diferenca += l.diferenca;
    t.qtd += l.qtd;
  }
  return {
    saldoAnterior: r2(t.saldoAnterior),
    entradas: r2(t.entradas),
    saidas: r2(t.saidas),
    transferencias: r2(t.transferencias),
    saldoFinal: r2(t.saldoFinal),
    saldoSienge: r2(t.saldoFinal + t.diferenca),
    diferenca: r2(t.diferenca),
    qtd: t.qtd,
    incompleto,
  };
}

export interface GrupoFechamento {
  nome: string;
  linhas: LinhaConta[];
  total: Totais;
}

/** Linhas agrupadas por empresa ou por instituição, do maior saldo final para o menor. */
export function agruparLinhas(linhas: LinhaConta[], por: "empresa" | "banco"): GrupoFechamento[] {
  const grupos = new Map<string, LinhaConta[]>();
  for (const l of linhas) {
    const nome = por === "empresa" ? l.empresa : l.instituicao;
    const lista = grupos.get(nome);
    if (lista) lista.push(l);
    else grupos.set(nome, [l]);
  }
  return Array.from(grupos.entries())
    .map(([nome, lista]) => ({
      nome,
      linhas: [...lista].sort((a, b) => (b.saldoFinal ?? 0) - (a.saldoFinal ?? 0)),
      total: totalizar(lista),
    }))
    .sort((a, b) => b.total.saldoFinal - a.total.saldoFinal);
}

export interface DiaDoFechamento {
  data: string;
  entradas: number;
  saidas: number;
  transferencias: number;
  /** Saldo das contas no fim do dia. */
  saldoFinal: number;
  qtd: number;
}

/** O período dia a dia (todos os dias, com ou sem movimento), só das contas em `linhas`. */
export function diaADia(linhas: LinhaConta[], lancamentos: Lancamento[], de: string, ate: string): DiaDoFechamento[] {
  const ids = new Set(linhas.map((l) => l.id));
  const porDia = new Map<string, { entradas: number; saidas: number; transferencias: number; qtd: number }>();
  for (const l of lancamentos) {
    if (!ids.has(l.contaId)) continue;
    const d = porDia.get(l.data) ?? { entradas: 0, saidas: 0, transferencias: 0, qtd: 0 };
    if (l.tipo === "entrada") d.entradas += l.efeito;
    else if (l.tipo === "saida") d.saidas -= l.efeito;
    else d.transferencias += l.efeito;
    if (!l.abate) d.qtd++;
    porDia.set(l.data, d);
  }
  let saldo = linhas.reduce((s, l) => s + (l.saldoAnterior ?? 0), 0);
  const dias: DiaDoFechamento[] = [];
  for (let data = de; data <= ate; data = somarDias(data, 1)) {
    const d = porDia.get(data) ?? { entradas: 0, saidas: 0, transferencias: 0, qtd: 0 };
    saldo += d.entradas - d.saidas + d.transferencias;
    dias.push({ data, entradas: r2(d.entradas), saidas: r2(d.saidas), transferencias: r2(d.transferencias), saldoFinal: r2(saldo), qtd: d.qtd });
  }
  return dias;
}

/** Quantos lançamentos de um tipo (sem retenção e desconto) nas contas dadas. */
export function contarLancamentos(lancamentos: Lancamento[], tipo: TipoLancamento, contaIds?: Set<string>): number {
  let n = 0;
  for (const l of lancamentos) if (l.tipo === tipo && !l.abate && (!contaIds || contaIds.has(l.contaId))) n++;
  return n;
}
