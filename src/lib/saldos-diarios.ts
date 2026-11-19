// Saldo de cada conta em cada dia, recalculado (Edielson, 18/11/2026: "Sim, corrigir" o
// gráfico Evolução do Saldo da aba Saldos, que usava a foto diária de `cached_daily_balances`).
//
// A foto é tirada na manhã seguinte e não enxerga o que é lançado depois: em 01 e
// 02/11/2026 ela ficou R$ 1.502.754,14 abaixo do que o Sienge mostra hoje para esses dias.
// Aqui o saldo do dia sai do saldo que o Sienge devolve HOJE para uma data (ele só devolve
// as empresas que tiveram movimento nela) mais ou menos os movimentos bancários da conta
// entre essa data e o dia pedido. É a mesma conta do Fechamento de Caixa
// (`saldoNaData` em fechamento-caixa.ts), por isso o gráfico e o Fechamento batem.
import { contaDoMovimento, dataDoMovimento, efeitoDoMovimento, r2, saldoNaData, type MovimentoCaixa, type SaldosPorData } from "./fechamento-caixa";
import { somarDias } from "./dias-uteis";

/** O mesmo formato que a aba Saldos já lia: { dia: [{ accountId: "empresa:conta", amount }] }. */
export type SaldosDiarios = Record<string, { accountId: string; amount: number }[]>;

/**
 * Em que datas pedir saldo ao Sienge: a última data com movimento de cada empresa até
 * `ate` (o Sienge devolve todas as contas da empresa nessa data). Dali para trás o saldo
 * de cada dia sai descontando os movimentos; dali para a frente ele não muda.
 */
export function datasDeAncora(movimentos: MovimentoCaixa[], ate: string): string[] {
  const ultima = new Map<number, string>();
  for (const m of movimentos) {
    const d = dataDoMovimento(m);
    if (d > ate) continue;
    if ((ultima.get(m.companyId) ?? "") < d) ultima.set(m.companyId, d);
  }
  return Array.from(new Set(ultima.values())).sort();
}

/**
 * Saldo de cada conta em cada dia de `de` a `ate`. `movimentos` precisa cobrir da data de
 * saldo mais antiga até `ate`. `fotos` (o saldo diário gravado) só vale para conta que o
 * Sienge não devolveu em data nenhuma (empresa parada na janela): o saldo dela não mudou.
 */
export function saldosDiarios(args: { movimentos: MovimentoCaixa[]; saldos: SaldosPorData; fotos?: SaldosPorData; de: string; ate: string }): SaldosDiarios {
  const { movimentos, saldos, fotos, de, ate } = args;
  const liquido = new Map<string, Record<string, number>>();
  for (const m of movimentos) {
    // Com o sinal do Sienge: estorno de baixa vem negativo (19/11/2026, mesma regra do Fechamento).
    const efeito = efeitoDoMovimento(m);
    if (efeito === 0) continue;
    const conta = contaDoMovimento(m);
    const porDia = liquido.get(conta) ?? {};
    const dia = dataDoMovimento(m);
    porDia[dia] = (porDia[dia] || 0) + efeito;
    liquido.set(conta, porDia);
  }

  const doSienge = new Set<string>();
  for (const mapa of Object.values(saldos)) for (const conta of Object.keys(mapa)) doSienge.add(conta);
  const soDaFoto = new Set<string>();
  for (const mapa of Object.values(fotos ?? {})) for (const conta of Object.keys(mapa)) if (!doSienge.has(conta)) soDaFoto.add(conta);

  const dias: SaldosDiarios = {};
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) dias[dia] = [];
  const preencher = (conta: string, fonte: SaldosPorData) => {
    const liq = liquido.get(conta) ?? {};
    for (const dia of Object.keys(dias)) {
      const v = saldoNaData(conta, dia, fonte, liq);
      if (v !== null) dias[dia].push({ accountId: conta, amount: r2(v) });
    }
  };
  for (const conta of Array.from(doSienge)) preencher(conta, saldos);
  if (fotos) for (const conta of Array.from(soDaFoto)) preencher(conta, fotos);
  return dias;
}

/** Soma das contas pedidas em cada dia (para conferências e testes). */
export function totalPorDia(dias: SaldosDiarios, contaIds: Iterable<string>): Record<string, number> {
  const quer = new Set(contaIds);
  const total: Record<string, number> = {};
  for (const [dia, contas] of Object.entries(dias)) {
    total[dia] = r2(contas.reduce((s, c) => (quer.has(c.accountId) ? s + c.amount : s), 0));
  }
  return total;
}
