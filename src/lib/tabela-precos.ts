// Tabela de preços das unidades — regras puras (usadas pela rota, pela tela e
// pelos testes). O preço de tabela vale para unidade NÃO vendida; a vendida
// continua mostrando o valor do contrato do Sienge.
//
// Quem pode editar: lista fechada em variável de ambiente (o painel não tem
// papel de administrador). Na Silva Packer (Edielson, 23/10): por enquanto só
// ele; depois Carlos, Humberto ou quem usar o painel.
//   TABELA_PRECOS_EMAILS = "email1@..., email2@..."
// Sem a variável, vale RESERVA_UNIDADE_EMAILS (mesma equipe, quando existir).
// Sem nenhuma das duas, ninguém edita — todos só veem.

export type TipoAlteracao = "manual" | "m2" | "percentual" | "fixo" | "cub" | "remocao";

export type Reajuste =
  | { tipo: "percentual"; percentual: number }
  | { tipo: "fixo"; valor: number }
  | { tipo: "cub"; cubBase: number; cubNovo: number; rotulo?: string };

export const arredondar = (v: number) => Math.round(v * 100) / 100;

// Fator multiplicativo do reajuste (1 para o fixo, que é aditivo).
export function fatorReajuste(r: Reajuste): number {
  if (r.tipo === "percentual") return 1 + r.percentual / 100;
  if (r.tipo === "cub") return r.cubBase > 0 ? r.cubNovo / r.cubBase : NaN;
  return 1;
}

export function aplicarReajuste(valor: number, r: Reajuste): number {
  if (r.tipo === "fixo") return arredondar(valor + r.valor);
  return arredondar(valor * fatorReajuste(r));
}

// Mensagem de erro, ou null se o reajuste é aplicável.
export function validarReajuste(r: Reajuste | null | undefined): string | null {
  if (!r) return "Informe o reajuste.";
  if (r.tipo === "percentual") {
    if (!Number.isFinite(r.percentual) || r.percentual === 0) return "Informe um percentual diferente de zero.";
    if (r.percentual <= -100) return "O percentual não pode zerar o preço.";
    return null;
  }
  if (r.tipo === "fixo") {
    if (!Number.isFinite(r.valor) || r.valor === 0) return "Informe um valor diferente de zero.";
    return null;
  }
  if (r.tipo === "cub") {
    if (!(r.cubBase > 0) || !(r.cubNovo > 0)) return "Informe o CUB base e o CUB novo.";
    if (r.cubBase === r.cubNovo) return "O CUB base e o novo são iguais — nada a reajustar.";
    return null;
  }
  return "Tipo de reajuste desconhecido.";
}

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Texto que vai para o histórico — é o que a equipe lê depois.
export function descreverReajuste(r: Reajuste): string {
  if (r.tipo === "percentual") return `Reajuste de ${pct(r.percentual)}`;
  if (r.tipo === "fixo") return `${r.valor > 0 ? "Acréscimo" : "Desconto"} de ${brl(Math.abs(r.valor))} por unidade`;
  const variacao = (fatorReajuste(r) - 1) * 100;
  const base = `CUB ${brl(r.cubBase)} → ${brl(r.cubNovo)} (${pct(arredondar(variacao * 100) / 100)})`;
  return r.rotulo ? `Reajuste pelo CUB ${r.rotulo}: ${base}` : `Reajuste pelo ${base}`;
}

// Preço = R$/m² × área privativa (preenchimento em lote).
export function precoPorM2(area: number, valorM2: number): number | null {
  if (!(area > 0) || !(valorM2 > 0)) return null;
  return arredondar(area * valorM2);
}

// Unidades a que o preço de tabela se aplica: tudo que não tem venda firmada.
// Permuta e Transferido (estoque E/T do Sienge) também não estão à venda.
export const STATUS_VENDIDOS = new Set(["Vendida", "Vendido/Terceiros", "Vendida em pré-contrato", "Permuta", "Transferido"]);
export const semVenda = (status: string) => !STATUS_VENDIDOS.has(status);

// ── Permissão (servidor) ──
function lista(v: string | undefined): string[] {
  return (v || "").split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function emailsEditoresPrecos(): string[] {
  const proprios = lista(process.env.TABELA_PRECOS_EMAILS);
  return proprios.length > 0 ? proprios : lista(process.env.RESERVA_UNIDADE_EMAILS);
}

export function podeEditarPrecos(email: string | null | undefined): boolean {
  if (!email) return false;
  return emailsEditoresPrecos().includes(email.toLowerCase().trim());
}

// ── Entrada de números no padrão brasileiro ──
// "319.370,08", "R$ 319.370,08", "319370.08", "319370" → 319370.08 / 319370.
// Ponto seguido de exatamente 3 dígitos (sem vírgula) é milhar: "319.370" = 319370.
export function lerValorBR(texto: string): number | null {
  let t = (texto || "").replace(/R\$|\s/g, "").trim();
  if (!t) return null;
  const negativo = t.startsWith("-");
  t = t.replace(/^[-+]/, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

// Percentual/decimal curto: "3,5" → 3.5; "-2" → -2. Sem regra de milhar.
export function lerDecimalBR(texto: string): number | null {
  const t = (texto || "").replace(/%|\s/g, "").replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// Máscara de digitação em reais: põe o separador de milhar enquanto a pessoa
// digita ("320000" → "320.000"; "320000,5" → "320.000,5"). Vírgula = decimal
// (até 2 casas); pontos digitados são ignorados, porque a máscara os recoloca.
export function mascararValorBR(texto: string, permitirNegativo = false): string {
  const t = texto || "";
  const negativo = permitirNegativo && t.trim().startsWith("-");
  const limpo = t.replace(/[^\d,]/g, "");
  const i = limpo.indexOf(",");
  let inteiro = i >= 0 ? limpo.slice(0, i) : limpo;
  const decimal = i >= 0 ? limpo.slice(i + 1).replace(/,/g, "").slice(0, 2) : null;
  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  if (decimal !== null && inteiro === "") inteiro = "0";
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}${comMilhar}${decimal !== null ? "," + decimal : ""}`;
}

// Ao sair do campo: completa os centavos ("320.000" → "320.000,00").
export function completarCentavosBR(texto: string, permitirNegativo = false): string {
  const v = lerValorBR(texto);
  if (v === null || (!permitirNegativo && v < 0)) return texto;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
