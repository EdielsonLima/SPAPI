// Condições de pagamento por empreendimento e o fluxo de pagamento de uma
// unidade (modal "Condições" do Quadro Espelho 3D). Regras puras: usadas pela
// rota, pela tela e pelos testes.
//
// Modelo (percentuais do preço de tabela):
//   sinal       — % no ato
//   mensais     — % dividido em N parcelas mensais a partir do mês seguinte
//                 (podem atravessar as chaves: "saldo em 100×")
//   balões      — % dividido em N parcelas anuais (12, 24, 36… meses)
//   chaves      — % na entrega das chaves (mês de `entrega`)
//   saldo       — o que resta (100 − soma), em N parcelas mensais após as chaves
// O saldo é calculado, nunca digitado: a soma sempre fecha em 100%.

export interface CondicoesPagamento {
  sinalPct: number;
  mensaisPct: number; mensaisQtd: number;
  baloesPct: number; baloesQtd: number;
  chavesPct: number;
  saldoQtd: number;           // parcelas mensais após as chaves (0 = à vista nas chaves)
  entrega: string;            // "AAAA-MM" previsto das chaves
  correcao: string;           // texto livre: "INCC até as chaves; após, IPCA + 1% a.m."
  observacoes: string;        // texto livre
}

export const CONDICOES_PADRAO: CondicoesPagamento = {
  sinalPct: 10,
  mensaisPct: 20, mensaisQtd: 24,
  baloesPct: 10, baloesQtd: 2,
  chavesPct: 10,
  saldoQtd: 60,
  entrega: "",
  correcao: "Parcelas corrigidas pelo INCC até as chaves; após as chaves, IPCA + 1% a.m.",
  observacoes: "Condições de referência. Proposta sujeita à aprovação da construtora.",
};

export const arred = (v: number) => Math.round(v * 100) / 100;
export const saldoPct = (c: CondicoesPagamento) => arred(100 - c.sinalPct - c.mensaisPct - c.baloesPct - c.chavesPct);

// Mensagem de erro, ou null se as condições são aplicáveis.
export function validarCondicoes(c: Partial<CondicoesPagamento> | null | undefined): string | null {
  if (!c) return "Condições vazias.";
  const pct = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
  const qtd = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
  if (!pct(c.sinalPct) || !pct(c.mensaisPct) || !pct(c.baloesPct) || !pct(c.chavesPct)) return "Percentuais devem ficar entre 0 e 100.";
  if (!qtd(c.mensaisQtd, 240) || !qtd(c.baloesQtd, 30) || !qtd(c.saldoQtd, 600)) return "Quantidades de parcelas inválidas.";
  if ((c.mensaisPct! > 0 && c.mensaisQtd === 0) || (c.baloesPct! > 0 && c.baloesQtd === 0)) return "Percentual com parcela precisa de quantidade maior que zero.";
  const soma = c.sinalPct! + c.mensaisPct! + c.baloesPct! + c.chavesPct!;
  if (soma > 100 + 1e-9) return `Sinal + mensais + balões + chaves passam de 100% (${arred(soma)}%).`;
  if (soma < 100 - 1e-9 && c.saldoQtd === 0) return "Há saldo após as chaves: informe em quantas parcelas.";
  if (c.entrega && !/^\d{4}-(0[1-9]|1[0-2])$/.test(c.entrega)) return "Mês de entrega no formato AAAA-MM.";
  if (typeof c.correcao !== "string" || c.correcao.length > 300) return "Texto de correção inválido (até 300 caracteres).";
  if (typeof c.observacoes !== "string" || c.observacoes.length > 600) return "Observações inválidas (até 600 caracteres).";
  return null;
}

// Normaliza o que vem da tela/rota para o tipo completo (números, 2 casas).
export function normalizarCondicoes(c: Partial<CondicoesPagamento>): CondicoesPagamento {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? arred(v) : d);
  const i = (v: unknown, d: number) => (Number.isInteger(v) ? (v as number) : d);
  return {
    sinalPct: n(c.sinalPct, CONDICOES_PADRAO.sinalPct),
    mensaisPct: n(c.mensaisPct, CONDICOES_PADRAO.mensaisPct), mensaisQtd: i(c.mensaisQtd, CONDICOES_PADRAO.mensaisQtd),
    baloesPct: n(c.baloesPct, CONDICOES_PADRAO.baloesPct), baloesQtd: i(c.baloesQtd, CONDICOES_PADRAO.baloesQtd),
    chavesPct: n(c.chavesPct, CONDICOES_PADRAO.chavesPct),
    saldoQtd: i(c.saldoQtd, CONDICOES_PADRAO.saldoQtd),
    entrega: typeof c.entrega === "string" ? c.entrega.trim() : "",
    correcao: typeof c.correcao === "string" ? c.correcao.trim() : "",
    observacoes: typeof c.observacoes === "string" ? c.observacoes.trim() : "",
  };
}

// ── Fluxo ──
export interface EtapaFluxo {
  etapa: "sinal" | "mensais" | "baloes" | "chaves" | "saldo";
  rotulo: string;
  pct: number;          // do preço
  total: number;        // R$ da etapa
  parcelas: number;     // 0 = pagamento único
  valorParcela: number; // R$ por parcela (= total quando única)
  inicio: string;       // "AAAA-MM" da primeira parcela
  fim: string;          // "AAAA-MM" da última
  periodicidade: "única" | "mensal" | "anual";
}
export interface FluxoPagamento {
  preco: number;
  etapas: EtapaFluxo[];
  ateChaves: number;    // R$ pagos até (e inclusive) as chaves
  aposChaves: number;   // R$ após as chaves
  totalParcelas: number;
  entrega: string;      // "AAAA-MM" usado para as chaves
  entregaEstimada: boolean; // true quando não havia mês de entrega cadastrado
}

const mesMais = (base: Date, meses: number) => {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const mesesEntre = (de: Date, ateAAAAMM: string) => {
  const [a, m] = ateAAAAMM.split("-").map(Number);
  return (a - de.getUTCFullYear()) * 12 + (m - 1 - de.getUTCMonth());
};

// `hoje` entra como parâmetro para o teste ser determinístico.
export function fluxoDePagamento(preco: number, c: CondicoesPagamento, hoje = new Date()): FluxoPagamento {
  const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  // Chaves: mês cadastrado; sem ele, depois das mensais e balões (mínimo 12 meses).
  const fimObra = Math.max(c.mensaisQtd, c.baloesQtd * 12, 12);
  const entregaEstimada = !c.entrega || mesesEntre(base, c.entrega) < 0;
  const entrega = entregaEstimada ? mesMais(base, fimObra) : c.entrega;
  const mesesAteChaves = Math.max(1, mesesEntre(base, entrega));
  const etapas: EtapaFluxo[] = [];
  const valor = (pct: number) => arred(preco * pct / 100);
  // R$ de cada etapa que cai até o mês das chaves (inclusive).
  let ateChaves = 0;
  if (c.sinalPct > 0) { etapas.push({ etapa: "sinal", rotulo: "Sinal (ato)", pct: c.sinalPct, total: valor(c.sinalPct), parcelas: 0, valorParcela: valor(c.sinalPct), inicio: mesMais(base, 0), fim: mesMais(base, 0), periodicidade: "única" }); ateChaves += valor(c.sinalPct); }
  if (c.mensaisPct > 0 && c.mensaisQtd > 0) {
    const n = c.mensaisQtd, vp = arred(valor(c.mensaisPct) / n);
    etapas.push({ etapa: "mensais", rotulo: n > mesesAteChaves ? "Mensais" : "Mensais até as chaves", pct: c.mensaisPct, total: valor(c.mensaisPct), parcelas: n, valorParcela: vp, inicio: mesMais(base, 1), fim: mesMais(base, n), periodicidade: "mensal" });
    ateChaves += n <= mesesAteChaves ? valor(c.mensaisPct) : vp * Math.min(n, mesesAteChaves); // todas antes das chaves = total exato (sem arredondar parcela)
  }
  if (c.baloesPct > 0 && c.baloesQtd > 0) {
    const n = c.baloesQtd, vp = arred(valor(c.baloesPct) / n);
    etapas.push({ etapa: "baloes", rotulo: n === 1 ? "Balão anual" : "Balões anuais", pct: c.baloesPct, total: valor(c.baloesPct), parcelas: n, valorParcela: vp, inicio: mesMais(base, 12), fim: mesMais(base, 12 * n), periodicidade: "anual" });
    ateChaves += n <= Math.floor(mesesAteChaves / 12) ? valor(c.baloesPct) : vp * Math.min(n, Math.floor(mesesAteChaves / 12));
  }
  if (c.chavesPct > 0) { etapas.push({ etapa: "chaves", rotulo: "Na entrega das chaves", pct: c.chavesPct, total: valor(c.chavesPct), parcelas: 0, valorParcela: valor(c.chavesPct), inicio: entrega, fim: entrega, periodicidade: "única" }); ateChaves += valor(c.chavesPct); }
  const sp = saldoPct(c);
  if (sp > 0) {
    const n = Math.max(1, c.saldoQtd);
    etapas.push({ etapa: "saldo", rotulo: "Saldo após as chaves", pct: sp, total: valor(sp), parcelas: n, valorParcela: arred(valor(sp) / n), inicio: mesMais(base, mesesAteChaves + 1), fim: mesMais(base, mesesAteChaves + n), periodicidade: n === 1 ? "única" : "mensal" });
  }
  ateChaves = arred(ateChaves);
  const aposChaves = arred(preco - ateChaves);
  const totalParcelas = etapas.reduce((s, e) => s + (e.parcelas || 1), 0);
  return { preco, etapas, ateChaves, aposChaves, totalParcelas, entrega, entregaEstimada };
}

// "AAAA-MM" → "mmm/AAAA" (ex.: "2029-12" → "dez/2029").
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesCurto = (aaaamm: string) => { const [a, m] = aaaamm.split("-").map(Number); return `${MESES[(m || 1) - 1]}/${a}`; };

// Resumo em texto para copiar e colar (WhatsApp, e-mail).
export function resumoDoFluxo(unidade: string, empreendimento: string, area: number, f: FluxoPagamento, c: CondicoesPagamento, brl: (v: number) => string): string {
  const linhas = [
    `${empreendimento} · apartamento ${unidade}${area > 0 ? ` · ${area.toLocaleString("pt-BR")} m² privativos` : ""}`,
    `Preço de tabela: ${brl(f.preco)}`,
    "",
    "Fluxo de pagamento:",
    ...f.etapas.map(e => e.parcelas > 0
      ? `• ${e.rotulo}: ${e.parcelas}× ${brl(e.valorParcela)} (${e.pct}%) — ${mesCurto(e.inicio)} a ${mesCurto(e.fim)}`
      : `• ${e.rotulo}: ${brl(e.total)} (${e.pct}%) — ${mesCurto(e.inicio)}`),
    "",
    `Até as chaves (${mesCurto(f.entrega)}${f.entregaEstimada ? ", estimado" : ""}): ${brl(f.ateChaves)}`,
    ...(f.aposChaves > 0 ? [`Após as chaves: ${brl(f.aposChaves)}`] : []),
    ...(c.correcao ? ["", c.correcao] : []),
    ...(c.observacoes ? [c.observacoes] : []),
  ];
  return linhas.join("\n");
}

// Chave do empreendimento para guardar as condições: a do entorno 3D quando
// existe; senão, o nome do Sienge em minúsculas sem acento ("solar-di-capri").
export function chaveDoEmpreendimento(chaveLocal: string | undefined, nome: string): string {
  if (chaveLocal) return chaveLocal;
  return (nome || "empreendimento").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "empreendimento";
}
