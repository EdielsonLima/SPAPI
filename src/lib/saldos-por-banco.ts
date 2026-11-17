// Saldos › tabela "Contas por Banco" (Edielson, 17/11/2026): a mesma lista de contas da
// tabela "Contas por Empresa", agrupada pela instituição em vez da empresa.
//
// O nome do banco de cada conta vem do mapa das 17 contas (`BANK_NAMES` em
// `src/lib/dimBanco.ts`), que separa o que é a mesma instituição: "Banco Bradesco" e
// "Aplicação Bradesco", "BTG Pactual - CH" e "BTG Pactual - JP". Aqui elas se juntam.
// Conta fora do mapa (seletor de Contas com "todas") chega sem nome: vale o código
// Febraban, se vier; sem ele vai para "Outras contas" (fica por último na tabela).

export interface ContaSaldo {
  bankAccountId: number;
  bankName?: string;
  bankCode?: string;
  bankAccountDescription?: string;
  accountNumber: string;
  companyName: string;
  currentBalance: number;
}

export interface ContaNoBanco<C extends ContaSaldo = ContaSaldo> {
  conta: C;
  /** O que diferencia a conta dentro do banco: "Aplicação", "CH", "JP"; null se nada. */
  detalhe: string | null;
}

export interface GrupoBanco<C extends ContaSaldo = ContaSaldo> {
  banco: string;
  total: number;
  contas: ContaNoBanco<C>[];
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

const POR_NOME: [RegExp, string][] = [
  [/BANCO DO BRASIL|^BB\b/, "Banco do Brasil"],
  [/BRADESCO/, "Bradesco"],
  [/CAIXA ECON|^CEF\b/, "Caixa Econômica"],
  [/BTG/, "BTG Pactual"],
  [/ITAU/, "Itaú"],
  [/SANTANDER/, "Santander"],
  [/SICOOB/, "Sicoob"],
  [/SICREDI/, "Sicredi"],
  [/\bXP\b/, "XP"],
  [/\bINTER\b/, "Inter"],
  [/SAFRA/, "Safra"],
];

// Só no nome que vem do mapa das 17 contas: lá "Aplicação Caixa" é a aplicação na Caixa
// Econômica. Na descrição do Sienge "CAIXA" é o caixa da empresa (dinheiro), não o banco.
const APLICACAO_CAIXA = /^APLICACAO CAIXA\b/;

const POR_CODIGO: Record<string, string> = {
  "1": "Banco do Brasil",
  "237": "Bradesco",
  "104": "Caixa Econômica",
  "208": "BTG Pactual",
  "341": "Itaú",
  "33": "Santander",
  "756": "Sicoob",
  "748": "Sicredi",
  "102": "XP",
  "348": "XP",
  "77": "Inter",
  "422": "Safra",
};

/** Instituição da conta: junta "Banco Bradesco" e "Aplicação Bradesco", "BTG Pactual - CH" e "- JP". */
export function instituicaoDaConta(c: Pick<ContaSaldo, "bankName" | "bankCode" | "bankAccountDescription">): string {
  const nome = semAcento(c.bankName || "");
  for (const [re, banco] of POR_NOME) if (nome && re.test(nome)) return banco;
  if (APLICACAO_CAIXA.test(nome)) return "Caixa Econômica";
  const codigo = String(c.bankCode || "").replace(/\D/g, "").replace(/^0+/, "");
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];
  if (c.bankName) return c.bankName.replace(/^aplica[cç][aã]o\s+/i, "").trim() || c.bankName;
  // A rota de saldos põe o número da conta na descrição e não manda o código: conta fora
  // da lista das 17 não tem como saber o banco. Ficam todas juntas.
  return OUTRAS_CONTAS;
}

export const OUTRAS_CONTAS = "Outras contas";

/** O que separa a conta das outras do mesmo banco: "Aplicação" ou o que vem depois do " - " ("CH", "JP"). */
export function detalheDaConta(bankName: string | undefined): string | null {
  const nome = (bankName || "").trim();
  if (!nome) return null;
  if (/^aplica[cç][aã]o\b/i.test(nome)) return "Aplicação";
  const m = nome.match(/\s-\s(.+)$/);
  return m ? m[1].trim() : null;
}

/** Contas agrupadas por instituição; bancos e contas do maior saldo para o menor. */
export function agruparPorBanco<C extends ContaSaldo>(contas: C[]): GrupoBanco<C>[] {
  const grupos = new Map<string, GrupoBanco<C>>();
  for (const conta of contas) {
    const banco = instituicaoDaConta(conta);
    let g = grupos.get(banco);
    if (!g) {
      g = { banco, total: 0, contas: [] };
      grupos.set(banco, g);
    }
    g.total += conta.currentBalance;
    g.contas.push({ conta, detalhe: detalheDaConta(conta.bankName) });
  }
  const lista = Array.from(grupos.values());
  for (const g of lista) g.contas.sort((a, b) => b.conta.currentBalance - a.conta.currentBalance);
  return lista.sort((a, b) => Number(a.banco === OUTRAS_CONTAS) - Number(b.banco === OUTRAS_CONTAS) || b.total - a.total);
}
