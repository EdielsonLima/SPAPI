/**
 * Controle de Locacoes (Alugueis) — EXCLUSIVO do modo Holding.
 *
 * ARQUIVO ISOLADO: nada aqui e importado pelas telas das demais empresas
 * (Contas a Pagar/Pagas/Vencidas/Receber/Recebidas, Painel Executivo, DRE,
 * Orcamento, Comercial). Alterar este arquivo NAO pode mudar nenhum numero
 * ja validado dessas telas. Pela mesma razao as formulas abaixo sao locais
 * (nao reaproveitam dashboard-utils) — a duplicacao e proposital.
 *
 * REGRA (decodificada do Power BI "FINANCEIRO HOLDING.pbix", paginas
 * "ALUGUEIS A RECEBER" e "ALUGUEIS REALIZADO"):
 *   titulo de receber com documento LOC ou LNC
 *   E com categoria financeira 10513 ou 10514 (Receita de locacao PF / PJ)
 *
 * VALIDADO em 2026-07-31 contra o Power BI (Alugueis Realizado, 01/01/2026 a
 * 11/06/2026 — data do ultimo lancamento do CSV do BI):
 *   Total ............. R$ 2.328.855,21  (BI: R$ 2.328.855,21)
 *   Silva Packer ...... R$ 1.444.930,96  (BI: R$ 1.444.930,96)
 *   Holding ........... R$   473.940,83  (BI: R$   473.940,83)
 *   Sul Brasil ........ R$   409.983,42  (BI: R$   409.983,42)
 * NAO ALTERAR as constantes/formulas abaixo sem pedido explicito do usuario.
 */

import { SiengeIncome } from "@/types/sienge";

/** Documentos de locacao: CONTRATO DE LOCACAO / CONTRATO DE LOCACAO NAO CONTABIL. */
export const ALUGUEL_DOC_IDS = new Set(["LOC", "LNC"]);

/** Categorias financeiras de receita de locacao (Pessoa Fisica / Pessoa Juridica). */
export const ALUGUEL_CATEGORY_IDS = new Set(["10513", "10514"]);

/** True quando o titulo de receber e um aluguel pela regra do Power BI. */
export function isAluguel(item: SiengeIncome): boolean {
  if (!ALUGUEL_DOC_IDS.has((item.documentIdentificationId || "").trim())) return false;
  return (item.paymentsCategories || []).some((c) =>
    ALUGUEL_CATEGORY_IDS.has(String(c.financialCategoryId || "").trim())
  );
}

/**
 * Saldo em aberto da parcela (mesma formula do CR: corrigido - desconto).
 * Nao subtrai taxAmount — isso e regra de Contas a Pagar (outcome).
 */
export function saldoAberto(item: SiengeIncome): number {
  const corrigido = item.correctedBalanceAmount ?? item.balanceAmount ?? 0;
  return corrigido - (item.discountAmount || 0);
}

/** Soma dos recebimentos liquidos da parcela dentro do intervalo informado. */
export function recebidoNoPeriodo(
  item: SiengeIncome,
  inicio: string,
  fim: string
): number {
  let total = 0;
  for (const p of item.payments || []) {
    const data = (p.paymentDate || "").slice(0, 10);
    if (!data || data < inicio || data > fim) continue;
    total += p.netAmount || 0;
  }
  return total;
}

/** Nome do imovel: o Sienge guarda no "Numero do documento" do titulo. */
export function nomeImovel(item: SiengeIncome): string {
  return (item.documentNumber || "").trim() || "(sem imovel)";
}

/** Nome curto da empresa (2 primeiras palavras) — usado nos cards e no grafico. */
export function nomeCurtoEmpresa(nome: string): string {
  return (nome || "").split(" ").slice(0, 2).join(" ");
}

/** Dias de atraso de uma parcela em aberto (0 quando ainda nao venceu). */
export function diasEmAtraso(dueDate: string, hoje: string): number {
  const venc = (dueDate || "").slice(0, 10);
  if (!venc || venc >= hoje) return 0;
  const ms = new Date(`${hoje}T12:00:00`).getTime() - new Date(`${venc}T12:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Data de hoje em ISO local (sem deslocamento de fuso). */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Tolerancia de baixa, em dias.
 *
 * Atraso pequeno em aluguel quase nunca e inadimplencia: o inquilino pagou e o
 * financeiro ainda nao deu baixa no Sienge. Atrasos ATE este limite nao contam
 * como atraso na classificacao do pagador.
 *
 * Base do numero (cache de 2026-07-16, 1.403 parcelas de locacao quitadas):
 *   61,9% quitadas sem atraso · 1 a 5 dias concentra 24,1% · acima de 5 dias
 *   sobram 14,0%. Com 5 dias, casos como CELITA MOREIRA (12 atrasos, nenhum
 *   acima de 5d) saem de "atraso" e viram "em dia", que e a leitura correta.
 * O usuario pode ajustar para 3 ou 7 dias na propria tela.
 */
export const TOLERANCIA_BAIXA_PADRAO = 5;
export const TOLERANCIAS_BAIXA = [3, 5, 7];

/** A partir deste percentual de parcelas com atraso real o pagador e cronico. */
export const PCT_CRONICO = 0.3;

/** Abaixo disso nao ha historico suficiente para chamar alguem de cronico. */
export const MIN_PARCELAS_PERFIL = 5;

export type PerfilPagador = "sem-historico" | "em-dia" | "pontual" | "cronico";

export interface ResumoPagador {
  pagasQtd: number;
  pagasValor: number;
  /** Parcelas quitadas com qualquer atraso (inclusive dentro da tolerancia). */
  atrasoQualquerQtd: number;
  /** Parcelas quitadas com atraso ACIMA da tolerancia — as que contam. */
  atrasoRealQtd: number;
  atrasoRealMedio: number;
  atrasoRealMaximo: number;
  pctAtrasoReal: number;
  ultimoPagamento: { data: string; valor: number } | null;
  perfil: PerfilPagador;
}

export const ROTULO_PERFIL: Record<PerfilPagador, string> = {
  "sem-historico": "Sem historico",
  "em-dia": "Em dia",
  pontual: "Atraso pontual",
  cronico: "Atraso cronico",
};

/**
 * Comportamento de pagamento por CLIENTE (e o cliente que paga, nao o imovel —
 * e agrupar por cliente ainda contorna as variacoes de grafia do mesmo imovel,
 * ex. "casa rua 3000" e "CASA RUA 3000").
 *
 * Uma passada so sobre todos os titulos, porque a tabela consulta o resultado
 * linha a linha.
 */
export function mapaPagadores(
  todos: SiengeIncome[],
  toleranciaDias: number
): Map<string, ResumoPagador> {
  const atrasosPorCliente = new Map<string, number[]>();
  const acumulado = new Map<
    string,
    { pagasQtd: number; pagasValor: number; ultimo: { data: string; valor: number } | null }
  >();

  for (const i of todos) {
    const cliente = i.clientName || "-";
    if (!atrasosPorCliente.has(cliente)) {
      atrasosPorCliente.set(cliente, []);
      acumulado.set(cliente, { pagasQtd: 0, pagasValor: 0, ultimo: null });
    }
    const acc = acumulado.get(cliente)!;

    const recebimentos = (i.payments || []).filter((p) => (p.netAmount || 0) > 0);
    if (recebimentos.length === 0) continue;

    acc.pagasQtd++;
    let quitacao = "";
    for (const p of recebimentos) {
      acc.pagasValor += p.netAmount || 0;
      const data = (p.paymentDate || "").slice(0, 10);
      if (data > quitacao) quitacao = data;
      if (!acc.ultimo || data > acc.ultimo.data) acc.ultimo = { data, valor: p.netAmount || 0 };
    }
    atrasosPorCliente.get(cliente)!.push(diasEmAtraso((i.dueDate || "").slice(0, 10), quitacao));
  }

  const out = new Map<string, ResumoPagador>();
  for (const [cliente, atrasos] of atrasosPorCliente) {
    const acc = acumulado.get(cliente)!;
    const reais = atrasos.filter((d) => d > toleranciaDias);
    const pct = acc.pagasQtd ? reais.length / acc.pagasQtd : 0;

    let perfil: PerfilPagador;
    if (acc.pagasQtd === 0) perfil = "sem-historico";
    else if (reais.length === 0) perfil = "em-dia";
    else if (acc.pagasQtd >= MIN_PARCELAS_PERFIL && pct >= PCT_CRONICO) perfil = "cronico";
    else perfil = "pontual";

    out.set(cliente, {
      pagasQtd: acc.pagasQtd,
      pagasValor: acc.pagasValor,
      atrasoQualquerQtd: atrasos.filter((d) => d > 0).length,
      atrasoRealQtd: reais.length,
      atrasoRealMedio: reais.length
        ? Math.round(reais.reduce((a, b) => a + b, 0) / reais.length)
        : 0,
      atrasoRealMaximo: reais.length ? Math.max(...reais) : 0,
      pctAtrasoReal: Math.round(pct * 100),
      ultimoPagamento: acc.ultimo,
      perfil,
    });
  }
  return out;
}

/** Uma parcela em aberto do imovel, no resumo do historico. */
export interface ParcelaAberta {
  key: string;
  dueDate: string;
  parcela: string;
  valor: number;
  dias: number;
}

/** Historico de um imovel — o que alimenta a linha expandida. */
export interface ResumoImovel {
  totalParcelas: number;
  pagasQtd: number;
  pagasValor: number;
  /** Parcelas quitadas apos o vencimento. */
  atrasoQtd: number;
  atrasoMedio: number;
  atrasoMaximo: number;
  ultimoPagamento: { data: string; valor: number } | null;
  vencidas: ParcelaAberta[];
  aVencerQtd: number;
  aVencerValor: number;
  clientes: string[];
  contratoInicio: string;
}

/**
 * Consolida o historico de um imovel a partir de TODOS os titulos de locacao
 * (sem recorte de periodo — a leitura util e o comportamento do inquilino ao
 * longo do contrato inteiro).
 */
export function resumoImovel(
  todos: SiengeIncome[],
  imovel: string,
  hoje: string
): ResumoImovel {
  const doImovel = todos.filter((i) => nomeImovel(i) === imovel);
  const atrasos: number[] = [];
  const vencidas: ParcelaAberta[] = [];
  const clientes = new Set<string>();
  let pagasQtd = 0;
  let pagasValor = 0;
  let aVencerQtd = 0;
  let aVencerValor = 0;
  let ultimoPagamento: { data: string; valor: number } | null = null;
  let contratoInicio = "";

  for (const i of doImovel) {
    if (i.clientName) clientes.add(i.clientName);
    const inicio = (i.billDate || i.issueDate || "").slice(0, 10);
    if (inicio && (!contratoInicio || inicio < contratoInicio)) contratoInicio = inicio;

    const recebimentos = (i.payments || []).filter((p) => (p.netAmount || 0) > 0);
    if (recebimentos.length > 0) {
      pagasQtd++;
      let quitacao = "";
      for (const p of recebimentos) {
        pagasValor += p.netAmount || 0;
        const data = (p.paymentDate || "").slice(0, 10);
        if (data > quitacao) quitacao = data;
        if (!ultimoPagamento || data > ultimoPagamento.data) {
          ultimoPagamento = { data, valor: p.netAmount || 0 };
        }
      }
      const atraso = diasEmAtraso((i.dueDate || "").slice(0, 10), quitacao);
      if (atraso > 0) atrasos.push(atraso);
    }

    const saldo = saldoAberto(i);
    if (saldo > 0) {
      const venc = (i.dueDate || "").slice(0, 10);
      const dias = diasEmAtraso(venc, hoje);
      if (dias > 0) {
        vencidas.push({
          key: `${i.companyId}:${i.billId}:${i.installmentId}`,
          dueDate: venc,
          parcela: i.installmentNumber || "-",
          valor: saldo,
          dias,
        });
      } else {
        aVencerQtd++;
        aVencerValor += saldo;
      }
    }
  }

  return {
    totalParcelas: doImovel.length,
    pagasQtd,
    pagasValor,
    atrasoQtd: atrasos.length,
    atrasoMedio: atrasos.length ? Math.round(atrasos.reduce((a, b) => a + b, 0) / atrasos.length) : 0,
    atrasoMaximo: atrasos.length ? Math.max(...atrasos) : 0,
    ultimoPagamento,
    vencidas: vencidas.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    aVencerQtd,
    aVencerValor,
    clientes: Array.from(clientes),
    contratoInicio,
  };
}

export const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
