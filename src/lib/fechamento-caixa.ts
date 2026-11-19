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
//     são o líquido de cada título, como no extrato.
//  3. O `/accounts-balances` do Sienge só devolve as contas das empresas que tiveram
//     movimento na data pedida (domingo e feriado voltam vazios). Por isso o saldo de uma
//     conta numa data é o saldo devolvido na última data com movimento da empresa, mais os
//     movimentos da conta de lá até a data.
//  4. Lançamento feito há pouco aparece nos movimentos antes de aparecer no saldo do
//     Sienge. O saldo final é o saldo anterior + os movimentos; o saldo que o Sienge devolve
//     para o fim do período vem ao lado, e a diferença (quando há) é mostrada, não escondida.
//  5. O valor do movimento vale com o sinal que o Sienge manda: estorno de baixa vem
//     negativo (conferido pelo saldo da conta 9937-6 em 08/09 e 07/10/2026).
//
// Entradas e Saídas = títulos recebidos e pagos, iguais ao fechamento das 07:30 (Edielson,
// 19/11/2026: "o link do fechamento de caixa de ontem não bate com essa nova aba"). Em
// 18/11 a aba mostrava Entradas R$ 18.259,39 e Saídas R$ 0,00 e o relatório, Recebido
// R$ 105.516,19 e Pago R$ 87.256,80: dois recebimentos e um pagamento passaram pelo caixa
// interno (conta CAIXA, dinheiro) da Construtora, fora dos bancos. Agora:
//  6. Recebimento ou pagamento de título de empresa que não é a Holding entra em Entradas
//     ou Saídas onde quer que o dinheiro tenha passado: nas 17 contas, no caixa interno
//     (CAIXA) ou numa conta da Holding (ela paga contas do Galpão Canelinha). A empresa do
//     título é a do lado do mútuo (`MUTUO*`) que tem a direção do pagamento; sem mútuo, a
//     do próprio movimento.
//  7. Fora das 17 contas o movimento vira uma linha "fora dos bancos" sem saldo (o saldo
//     da conta CAIXA no Sienge é acumulado contábil, R$ 2,2 mi na Construtora em 18/11, não
//     é dinheiro em caixa). Nela, a coluna Outros devolve o mesmo valor com o sinal
//     contrário: o dinheiro não passou pelos bancos e o saldo deles não muda.
//  8. Outros = o resto do que mexe nos bancos sem ser título das empresas: transferências
//     (entre as 17 contas se anulam; o que sobra foi para fora: Holding, mútuo), tarifas
//     bancárias (o fechamento das 07:30 não conta movimento sem título) e título da Holding
//     pago ou recebido por uma das 17 contas (o fechamento das 07:30 não conta a Holding).
//  Conferido com o fechamento das 07:30 em 12 dias úteis de novembro: igual no centavo.
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
  installmentId?: number | null;
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
  /** Caixa interno (dinheiro) ou conta da Holding: título pago ou recebido fora dos 17 bancos, sem saldo. */
  foraDosBancos?: boolean;
}

/** Entrada = título recebido; saída = título pago; outro = o resto (transferência, tarifa…). */
export type TipoLancamento = "entrada" | "saida" | "outro";
/** O que é o lançamento da coluna Outros. */
export type CategoriaOutro = "transferencia" | "tarifa" | "holding" | "avulso";

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
  /** Só no tipo "outro". */
  categoria?: CategoriaOutro;
  /** Passou pelo caixa interno ou por conta da Holding: está em Entradas/Saídas e não mexe no saldo dos bancos. */
  foraDosBancos?: boolean;
  /** Empresa do título, quando não é a dona da conta (recebimento da Domus no caixa da Construtora). */
  empresaTitulo?: string;
}

export interface LinhaConta extends ContaFechamento {
  saldoAnterior: number | null;
  entradas: number;
  saidas: number;
  /** Líquido do que não é título das empresas (transferências, tarifas…); na linha fora dos bancos, o contrário de entradas − saídas. */
  outros: number;
  saldoFinal: number | null;
  /** Saldo que o Sienge devolve para o fim do período; null se a empresa não teve movimento nele. */
  saldoSienge: number | null;
  /** saldoSienge − saldoFinal; 0 quando fecha ou quando não há saldo do Sienge no período. */
  diferenca: number;
  /** Saldo saiu da foto gravada pelo painel, porque o Sienge não devolveu a conta. */
  estimado: boolean;
  /** Lançamentos no período (sem contar retenção e desconto). */
  qtd: number;
  foraDosBancos: boolean;
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

/** Efeito do movimento no saldo da conta, com o sinal do Sienge (estorno de baixa vem negativo). */
export const efeitoDoMovimento = (m: Pick<MovimentoCaixa, "bankMovementOperationType" | "bankMovementAmount">) =>
  (semAcento(m.bankMovementOperationType) === "E" ? 1 : -1) * (Number(m.bankMovementAmount) || 0);

const ehTitulo = (m: Pick<MovimentoCaixa, "bankMovementOriginId">) => {
  const origem = semAcento(m.bankMovementOriginId);
  return origem === "CP" || origem === "CR";
};
export const ehMutuo = (conta: string) => /^MUTUO/.test(semAcento(conta));

/** Dinheiro que só trocou de conta: transferência, saque, depósito, resgate/aplicação. Nunca título. */
export function ehTransferencia(m: Pick<MovimentoCaixa, "bankMovementOriginId" | "bankMovementOperationName" | "documentIdentificationName">): boolean {
  if (ehTitulo(m)) return false;
  if (semAcento(m.documentIdentificationName).includes("TRANSFER")) return true;
  return /TRANSFER|SAQUE|DEPOSITO/.test(semAcento(m.bankMovementOperationName));
}

/**
 * Em que coluna o movimento entra e quanto ele mexe no saldo. `tituloDaHolding`: título da
 * Holding pago ou recebido por esta conta, que o fechamento das 07:30 não conta: vai para Outros.
 */
export function classificar(
  m: MovimentoCaixa,
  tituloDaHolding = false,
): { tipo: TipoLancamento; efeito: number; abate: boolean; categoria?: CategoriaOutro } {
  const entrada = semAcento(m.bankMovementOperationType) === "E";
  const efeito = efeitoDoMovimento(m);
  const origem = semAcento(m.bankMovementOriginId);
  if (ehTitulo(m) && tituloDaHolding) return { tipo: "outro", efeito, abate: false, categoria: "holding" };
  if (origem === "CR") return { tipo: "entrada", efeito, abate: !entrada };
  if (origem === "CP") return { tipo: "saida", efeito, abate: entrada };
  if (ehTransferencia(m)) return { tipo: "outro", efeito, abate: false, categoria: "transferencia" };
  const tarifa = /TARIFA/.test(semAcento(`${m.bankMovementHistoricName ?? ""} ${m.bankMovementOperationName ?? ""}`));
  return { tipo: "outro", efeito, abate: false, categoria: tarifa ? "tarifa" : "avulso" };
}

/** O mesmo pagamento ou recebimento de título nas várias contas (a de verdade e os dois lados do mútuo). */
const chaveDoTitulo = (m: MovimentoCaixa) =>
  `${semAcento(m.bankMovementOriginId)}|${m.billId}|${m.installmentId ?? ""}|${dataDoMovimento(m)}`;

/**
 * Empresa dona do título de cada baixa. Quando uma empresa paga ou recebe pela conta de outra,
 * o Sienge lança o mútuo dos dois lados: a dona do título tem o lado com a direção do
 * pagamento (saída no CP, entrada no CR); a que emprestou a conta tem o lado contrário.
 * Sem mútuo, a dona é a empresa do próprio movimento.
 */
export function empresasDosTitulos(movimentos: MovimentoCaixa[]): Map<string, number> {
  const donos = new Map<string, number>();
  for (const m of movimentos) {
    if (!ehTitulo(m) || m.billId == null || !ehMutuo(m.accountNumber)) continue;
    const direcao = semAcento(m.bankMovementOriginId) === "CP" ? "S" : "E";
    if (semAcento(m.bankMovementOperationType) !== direcao) continue;
    donos.set(chaveDoTitulo(m), m.companyId);
  }
  return donos;
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

/** Grupo das contas fora dos 17 bancos na visão "Por banco". */
export const FORA_DOS_BANCOS = "Fora dos bancos";

/** Caixa interno, cofre ou conta da Holding por onde passou título das empresas. */
export function montarContaFora(conta: string, companyId: number, empresa: string, daHolding: boolean): ContaFechamento {
  const nome = semAcento(conta);
  const bancoNome =
    nome === "CAIXA" || nome.endsWith("CAIXA")
      ? "Caixa interno (dinheiro)"
      : nome.startsWith("COFRE")
        ? "Cofre (dinheiro)"
        : daHolding
          ? "Conta da Holding"
          : "Conta fora da lista";
  return { id: `${companyId}:${conta}`, conta, companyId, empresa, bancoNome, instituicao: FORA_DOS_BANCOS, detalhe: null, foraDosBancos: true };
}

/**
 * Saldo da conta no fim do dia `data`, a partir dos saldos conhecidos: usa o da última
 * data ≤ `data` e soma os movimentos de lá até `data`; se só houver saldo depois, volta
 * dele descontando os movimentos. null se a conta não aparece em nenhuma data.
 * `liquido` = { dia: efeito no saldo } da conta, cobrindo o intervalo entre as datas.
 */
export function saldoNaData(contaId: string, data: string, saldos: SaldosPorData, liquido: Record<string, number>): number | null {
  const datas = Object.keys(saldos)
    .filter((d) => saldos[d] && contaId in saldos[d])
    .sort();
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
  const unicas = (mapa: Map<number, string>) => Array.from(new Set(mapa.values())).sort();
  return { antes: unicas(ultimaAntes), dentro: unicas(ultimaDentro), semAncora: companyIds.filter((c) => !ultimaAntes.has(c)) };
}

/**
 * Pagamentos de título feitos pela conta CAIXA (dinheiro) das empresas. Desde 19/11/2026
 * eles estão nas Saídas; o campo continua na resposta para a aba aberta antes da mudança.
 */
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

function quemDoMovimento(m: MovimentoCaixa, categoria?: CategoriaOutro): string {
  if (categoria === "transferencia") return (m.bankMovementHistoricName || m.bankMovementOperationName || "Transferência").trim();
  return (m.clientName || m.creditorName || m.bankMovementHistoricName || m.bankMovementOperationName || "").trim();
}

type Soma = { entradas: number; saidas: number; outros: number; qtd: number };
const somaVazia = (): Soma => ({ entradas: 0, saidas: 0, outros: 0, qtd: 0 });

/** Põe o lançamento na coluna dele; o de fora dos bancos devolve o valor em Outros, para não mexer no saldo. */
function somar(s: Soma, l: Pick<Lancamento, "tipo" | "efeito" | "abate" | "foraDosBancos">): void {
  if (l.tipo === "entrada") s.entradas += l.efeito;
  else if (l.tipo === "saida") s.saidas -= l.efeito;
  else s.outros += l.efeito;
  if (l.foraDosBancos) s.outros -= l.efeito;
  if (!l.abate) s.qtd++;
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
  /** Empresas cujo pagamento em dinheiro (conta CAIXA) entra no campo `pagoEmDinheiro`. */
  empresasDoCaixa?: number[];
  /** Ids da Holding (também vale a empresa com "HOLDING" no nome). */
  empresasHolding?: number[];
  /** Nome das empresas que não estão nas 17 contas (Holding, Domus…). */
  nomesEmpresas?: Record<number, string>;
}): FechamentoCaixa {
  const { contas, movimentos, saldos, fotos, de, ate, geradoEm } = args;
  const vespera = somarDias(de, -1);
  const daLista = new Map(contas.map((c) => [c.id, c]));

  const holding = new Set(args.empresasHolding ?? []);
  const nomes = new Map<number, string>();
  for (const [id, nome] of Object.entries(args.nomesEmpresas ?? {})) nomes.set(Number(id), nome);
  for (const c of contas) if (!nomes.has(c.companyId)) nomes.set(c.companyId, c.empresa);
  for (const m of movimentos) if (m.companyName && !nomes.has(m.companyId)) nomes.set(m.companyId, m.companyName);
  for (const [id, nome] of Array.from(nomes.entries())) if (/HOLDING/.test(semAcento(nome))) holding.add(id);
  const nomeDa = (id: number) => nomes.get(id) ?? `Empresa ${id}`;
  const donos = empresasDosTitulos(movimentos);

  const liquido = new Map<string, Record<string, number>>();
  const lancamentos: Lancamento[] = [];
  const soma = new Map<string, Soma>();
  const fora = new Map<string, ContaFechamento>();
  let sequencia = 0;
  for (const m of movimentos) {
    const contaId = contaDoMovimento(m);
    const naLista = daLista.has(contaId);
    const titulo = ehTitulo(m);
    const dono = titulo ? (donos.get(chaveDoTitulo(m)) ?? m.companyId) : m.companyId;
    const daHolding = titulo && holding.has(dono);
    // Fora das 17 contas só interessa título das empresas (não da Holding) em conta de verdade.
    const foraDosBancos = !naLista && titulo && !daHolding && !ehMutuo(m.accountNumber);
    if (!naLista && !foraDosBancos) continue;
    const data = dataDoMovimento(m);
    const { tipo, efeito, abate, categoria } = classificar(m, daHolding);
    if (efeito === 0) continue;
    if (naLista) {
      const porDia = liquido.get(contaId) ?? {};
      porDia[data] = (porDia[data] || 0) + efeito;
      liquido.set(contaId, porDia);
    }
    if (data < de || data > ate) continue;
    if (foraDosBancos && !fora.has(contaId)) {
      fora.set(contaId, montarContaFora(m.accountNumber, m.companyId, nomeDa(m.companyId), holding.has(m.companyId)));
    }
    const lancamento: Lancamento = {
      id: m.bankMovementId ?? -++sequencia,
      data,
      contaId,
      tipo,
      efeito: r2(efeito),
      abate,
      quem: quemDoMovimento(m, categoria),
      // Na transferência o número do documento é o trajeto ("SP BB/SB BRAD"); o nome só repete "transferência".
      documento:
        categoria === "transferencia" && m.documentIdentificationNumber
          ? m.documentIdentificationNumber.trim()
          : [m.documentIdentificationName, m.documentIdentificationNumber].filter(Boolean).join(" ").trim(),
      historico: (m.bankMovementHistoricName || "").trim(),
      titulo: m.billId ?? null,
      ...(categoria ? { categoria } : {}),
      ...(foraDosBancos ? { foraDosBancos: true } : {}),
      ...(titulo && dono !== m.companyId ? { empresaTitulo: nomeDa(dono) } : {}),
    };
    const s = soma.get(contaId) ?? somaVazia();
    somar(s, lancamento);
    soma.set(contaId, s);
    lancamentos.push(lancamento);
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
    const s = soma.get(conta.id) ?? somaVazia();
    let estimado = false;
    let anterior = saldoNaData(conta.id, vespera, saldosAntes, liq);
    if (anterior === null) anterior = saldoNaData(conta.id, vespera, saldos, liq);
    if (anterior === null && fotos) {
      anterior = saldoNaData(conta.id, vespera, fotos, liq);
      estimado = anterior !== null;
    }
    const saldoFinal = anterior === null ? null : anterior + s.entradas - s.saidas + s.outros;
    const sienge = saldoNaData(conta.id, ate, saldosDentro, liq);
    return {
      ...conta,
      saldoAnterior: anterior === null ? null : r2(anterior),
      entradas: r2(s.entradas),
      saidas: r2(s.saidas),
      outros: r2(s.outros),
      saldoFinal: saldoFinal === null ? null : r2(saldoFinal),
      saldoSienge: sienge === null ? null : r2(sienge),
      diferenca: sienge === null || saldoFinal === null ? 0 : r2(sienge - saldoFinal),
      estimado,
      qtd: s.qtd,
      foraDosBancos: false,
    };
  });

  const semSaldo = linhas.filter((l) => l.saldoAnterior === null);
  if (semSaldo.length > 0) {
    avisos.push(`Sem saldo do Sienge para ${semSaldo.length === 1 ? "a conta" : "as contas"} ${semSaldo.map((l) => l.conta).join(", ")}.`);
  }
  const estimadas = linhas.filter((l) => l.estimado);
  if (estimadas.length > 0) {
    avisos.push(
      `Saldo estimado pela última posição gravada em ${estimadas.length === 1 ? "1 conta" : `${estimadas.length} contas`}: ${estimadas.map((l) => l.conta).join(", ")}.`,
    );
  }

  for (const conta of Array.from(fora.values())) {
    const s = soma.get(conta.id) ?? somaVazia();
    linhas.push({
      ...conta,
      saldoAnterior: null,
      entradas: r2(s.entradas),
      saidas: r2(s.saidas),
      outros: r2(s.outros),
      saldoFinal: null,
      saldoSienge: null,
      diferenca: 0,
      estimado: false,
      qtd: s.qtd,
      foraDosBancos: true,
    });
  }

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
  outros: number;
  saldoFinal: number;
  /** Saldo no Sienge no fim do período, quando ele difere do calculado; senão igual ao saldoFinal. */
  saldoSienge: number;
  diferenca: number;
  qtd: number;
  /** Alguma conta bancária ficou sem saldo: o total não inclui o saldo dela. */
  incompleto: boolean;
}

export function totalizar(linhas: LinhaConta[]): Totais {
  const t = { saldoAnterior: 0, entradas: 0, saidas: 0, outros: 0, saldoFinal: 0, diferenca: 0, qtd: 0 };
  let incompleto = false;
  for (const l of linhas) {
    if (!l.foraDosBancos && (l.saldoAnterior === null || l.saldoFinal === null)) incompleto = true;
    t.saldoAnterior += l.saldoAnterior ?? 0;
    t.entradas += l.entradas;
    t.saidas += l.saidas;
    t.outros += l.outros;
    t.saldoFinal += l.saldoFinal ?? 0;
    t.diferenca += l.diferenca;
    t.qtd += l.qtd;
  }
  return {
    saldoAnterior: r2(t.saldoAnterior),
    entradas: r2(t.entradas),
    saidas: r2(t.saidas),
    outros: r2(t.outros),
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
  /** Só linhas fora dos bancos: o grupo não tem saldo. */
  semSaldo: boolean;
}

/** Linhas agrupadas por empresa ou por instituição, do maior saldo final para o menor; fora dos bancos por último. */
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
      linhas: [...lista].sort((a, b) => Number(a.foraDosBancos) - Number(b.foraDosBancos) || (b.saldoFinal ?? 0) - (a.saldoFinal ?? 0)),
      total: totalizar(lista),
      semSaldo: lista.every((l) => l.foraDosBancos),
    }))
    .sort((a, b) => Number(a.semSaldo) - Number(b.semSaldo) || b.total.saldoFinal - a.total.saldoFinal);
}

export interface DiaDoFechamento {
  data: string;
  entradas: number;
  saidas: number;
  outros: number;
  /** Saldo das contas no fim do dia. */
  saldoFinal: number;
  qtd: number;
}

/** O período dia a dia (todos os dias, com ou sem movimento), só das contas em `linhas`. */
export function diaADia(linhas: LinhaConta[], lancamentos: Lancamento[], de: string, ate: string): DiaDoFechamento[] {
  const ids = new Set(linhas.map((l) => l.id));
  const porDia = new Map<string, Soma>();
  for (const l of lancamentos) {
    if (!ids.has(l.contaId)) continue;
    const d = porDia.get(l.data) ?? somaVazia();
    somar(d, l);
    porDia.set(l.data, d);
  }
  let saldo = linhas.reduce((s, l) => s + (l.saldoAnterior ?? 0), 0);
  const dias: DiaDoFechamento[] = [];
  for (let data = de; data <= ate; data = somarDias(data, 1)) {
    const d = porDia.get(data) ?? somaVazia();
    saldo += d.entradas - d.saidas + d.outros;
    dias.push({ data, entradas: r2(d.entradas), saidas: r2(d.saidas), outros: r2(d.outros), saldoFinal: r2(saldo), qtd: d.qtd });
  }
  return dias;
}

/** Quantos lançamentos de um tipo (sem retenção e desconto) nas contas dadas. */
export function contarLancamentos(lancamentos: Lancamento[], tipo: TipoLancamento, contaIds?: Set<string>): number {
  let n = 0;
  for (const l of lancamentos) if (l.tipo === tipo && !l.abate && (!contaIds || contaIds.has(l.contaId))) n++;
  return n;
}

export interface ComposicaoOutros {
  transferencias: number;
  tarifas: number;
  /** Título da Holding pago ou recebido por uma das 17 contas. */
  holding: number;
  avulsos: number;
  /** O contrário do que passou fora dos bancos (pago em dinheiro = positivo). */
  foraDosBancos: number;
}

/** De que é feita a coluna Outros, para a tela explicar o número. */
export function composicaoOutros(lancamentos: Lancamento[], contaIds?: Set<string>): ComposicaoOutros {
  const c = { transferencias: 0, tarifas: 0, holding: 0, avulsos: 0, foraDosBancos: 0 };
  for (const l of lancamentos) {
    if (contaIds && !contaIds.has(l.contaId)) continue;
    if (l.foraDosBancos) c.foraDosBancos -= l.efeito;
    if (l.tipo !== "outro") continue;
    if (l.categoria === "transferencia") c.transferencias += l.efeito;
    else if (l.categoria === "tarifa") c.tarifas += l.efeito;
    else if (l.categoria === "holding") c.holding += l.efeito;
    else c.avulsos += l.efeito;
  }
  return {
    transferencias: r2(c.transferencias),
    tarifas: r2(c.tarifas),
    holding: r2(c.holding),
    avulsos: r2(c.avulsos),
    foraDosBancos: r2(c.foraDosBancos),
  };
}

export interface ResumoForaDosBancos {
  /** "Caixa interno (dinheiro)", "Conta da Holding"… */
  rotulo: string;
  recebido: number;
  pago: number;
  qtd: number;
}

/** O que foi recebido e pago fora dos 17 bancos, por tipo de conta (as linhas já filtradas). */
export function resumoForaDosBancos(linhas: LinhaConta[]): ResumoForaDosBancos[] {
  const porRotulo = new Map<string, ResumoForaDosBancos>();
  for (const l of linhas) {
    if (!l.foraDosBancos) continue;
    const r = porRotulo.get(l.bancoNome) ?? { rotulo: l.bancoNome, recebido: 0, pago: 0, qtd: 0 };
    r.recebido = r2(r.recebido + l.entradas);
    r.pago = r2(r.pago + l.saidas);
    r.qtd += l.qtd;
    porRotulo.set(l.bancoNome, r);
  }
  return Array.from(porRotulo.values()).sort((a, b) => b.recebido + b.pago - (a.recebido + a.pago));
}

