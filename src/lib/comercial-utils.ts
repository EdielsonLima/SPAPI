// Funções puras do módulo Comercial (tipo de imóvel, nome curto do
// empreendimento, pavimento). Saíram de executive-dashboard.tsx sem alteração
// quando o Comercial virou módulo próprio (menu lateral, 22/10/2026).

// Inferência do tipo de imóvel a partir do nome da unidade (pura — usada no render e no default do filtro).
export function inferUnitTypeFromName(name: string): string {
  const n = name.toUpperCase().trim();
  if (/\bVG\b|VAGA|GARAGEM|^G[\s-]?\d/i.test(n)) {
    if (/DUPLA|DBL|2V/i.test(n)) return "Vaga Dupla";
    if (/TRIPLA|TPL|3V/i.test(n)) return "Vaga Tripla";
    if (/PNE|DEFICIENTE|ACESS/i.test(n)) return "Vaga PNE";
    return "Vaga Simples";
  }
  if (/\bSL\b|\bSALA\b|COMERCIAL/i.test(n)) return "Sala Comercial";
  if (/\bLJ\b|\bLOJA\b/i.test(n)) return "Loja";
  if (/\bCASA\b/i.test(n)) return "Casa";
  if (/\bCOB\b|COBERTURA/i.test(n)) return "Cobertura";
  if (/\bGARDEN\b|\bJARDIM\b/i.test(n)) return "Garden";
  if (/\bDEP\b|DEPOSITO|\bBOX\b/i.test(n)) return "Depósito";
  return "Apartamento";
}

// Nome curto do empreendimento pra exibição: corta o sufixo de centro de custo
// depois do " - " ("PALACIO ELIZABETH - DESPESAS INDIRETAS" → "PALACIO ELIZABETH").
// Só para display — filtros e chaves internas continuam com o nome completo do Sienge.
export function shortEnterpriseName(name: string): string {
  // Corta no primeiro hífen/traço que tenha espaço de PELO MENOS um lado
  // ("X - Y", "X -Y", "X- Y", "X – Y"). Hífen colado dos dois lados ("X-1")
  // é considerado parte do nome e não corta.
  const m = name.match(/\s+[-–—]|[-–—]\s+/);
  if (m && m.index && m.index > 0) return name.slice(0, m.index).trim();
  return name;
}

// Normaliza o rótulo de pavimento para juntar variações ("G 3"="G3", "15 º"="15º")
// que vêm inconsistentes do Sienge e criariam linhas duplicadas no espelho.
export function normalizeFloor(floor: string): string {
  let f = (floor || "").trim().replace(/\s+/g, " ");
  if (!f) return "";
  f = f.replace(/(\d+)\s*º/g, "$1º");   // "15 º" -> "15º"
  f = f.replace(/^G\s*(\d+)/i, "G$1");  // "G 3" -> "G3"
  return f;
}

// Ordena pavimentos do mais alto (topo) para o mais baixo (base): andares
// numéricos desc → Garagens (podium G4..G1, decrescente) → Mezanino → Térreo →
// desconhecido. As garagens ficam ACIMA do térreo (G4 no topo, G1 logo acima do
// térreo), como no espelho do empreendimento.
// Pavimento a exibir: o do Sienge quando existe; senão o do nome (AP1201 → 12º).
export function pavimentoDaUnidade(floor: string, name: string): string {
  const f = normalizeFloor(floor);
  if (f) return f;
  const m = (name || "").trim().match(/^[A-Za-z\s.-]*(\d{3,})$/);
  return m ? `${parseInt(m[1].slice(0, -2), 10)}º` : "";
}

export function floorSortKey(floor: string): number {
  const f = normalizeFloor(floor);
  if (!f) return -1000;
  const g = f.match(/^G\s*(\d+)/i);
  if (g) return parseInt(g[1], 10) / 100; // ex.: G4=0.04 (topo) ... G1=0.01, acima do térreo(0)
  if (/mezanino/i.test(f)) return 0.005;
  if (/t[ée]rreo/i.test(f)) return 0;
  const num = f.match(/(\d+)/);
  if (num) return parseInt(num[1], 10);
  return -1000;
}

// Valor de UMA unidade dentro do contrato (mesma regra do Financeiro da Leven,
// 26/09). Contrato de apartamento + vaga traz as duas unidades: dar o valor do
// contrato inteiro a cada uma fazia o "VGV vendido" do Quadro Espelho e da
// tela Unidades somar o mesmo contrato N vezes. A parte de cada unidade é o
// percentual de participação do Sienge; se as participações não fecham 100%
// (cadastro incompleto), divide em partes iguais.
export function valorDaUnidadeNoContrato(
  valorContrato: number,
  unidades: { name: string; participationPercentage?: number | null }[],
  nomeUnidade: string,
): number {
  if (!valorContrato || unidades.length === 0) return 0;
  if (unidades.length === 1) return valorContrato;
  const alvo = unidades.find(u => u.name === nomeUnidade);
  if (!alvo) return 0;
  const soma = unidades.reduce((s, u) => s + (u.participationPercentage || 0), 0);
  const fatia = Math.abs(soma - 100) < 0.01
    ? (alvo.participationPercentage || 0) / 100
    : 1 / unidades.length;
  return Math.round(valorContrato * fatia * 100) / 100;
}

// Unidade como o módulo recebe de /api/sienge/units.
export interface ApiUnit {
  id?: number;
  enterpriseId?: number;
  enterpriseName: string;
  companyName: string;
  name: string;
  propertyType: string;
  commercialStock: string;
  floor: string;
  contractNumber: string;
  privateArea: number;
}

export type ComercialAba = "visao" | "vendas" | "clientes" | "corretores" | "unidades" | "quadro" | "precos";

// Rota de cada tela do módulo. A ordem é a do menu.
export const ABAS_COMERCIAL: { key: ComercialAba; label: string; href: string; subtitle: string }[] = [
  { key: "visao", label: "Visão Geral", href: "/comercial/visao-geral", subtitle: "VGV, estoque e ranking de vendas" },
  { key: "vendas", label: "Vendas", href: "/comercial/vendas", subtitle: "Contratos de venda por empreendimento" },
  { key: "clientes", label: "Clientes", href: "/comercial/clientes", subtitle: "Carteira de clientes e contratos" },
  { key: "corretores", label: "Corretores e Imobiliárias", href: "/comercial/corretores", subtitle: "Quem vendeu, quanto e a comissão lançada no Sienge" },
  { key: "unidades", label: "Unidades", href: "/comercial/unidades", subtitle: "Situação comercial de cada unidade" },
  { key: "quadro", label: "Quadro Espelho", href: "/comercial/quadro-espelho", subtitle: "Espelho de vendas por pavimento" },
  { key: "precos", label: "Tabela de Preços", href: "/comercial/tabela-precos", subtitle: "Preço de tabela das unidades não vendidas, com reajustes e histórico" },
];

// Vendas contadas por UNIDADE (trazido do Financeiro da Leven em 22/10/2026).
// Cada unidade de cada contrato vira uma linha com o tipo da unidade e a parte
// dela no valor do contrato (valorDaUnidadeNoContrato). Com tipos escolhidos,
// só eles contam.
export interface UnidadeVendida { contratoId: number | null; contrato: string; unidade: string; tipo: string; valor: number; data: string; empreendimento: string; cliente: string; situacao: string; permuta: boolean }
export function unidadesVendidas<C extends { number?: string | null; id?: number | null; value?: number | null; contractDate?: string | null; enterpriseName?: string | null; situation?: string | null; cancellationDate?: string | null; salesContractCustomers?: { name?: string | null }[] | null; paymentConditions?: { conditionTypeId: string }[] | null; salesContractUnits?: { name: string; participationPercentage?: number | null }[] | null }>(
  contratos: C[],
  tipoDe: (c: C, nomeUnidade: string) => string,
  tipos: Set<string> = new Set(),
): UnidadeVendida[] {
  const out: UnidadeVendida[] = [];
  for (const c of contratos) {
    const us = c.salesContractUnits || [];
    for (const u of us) {
      const tipo = tipoDe(c, u.name);
      if (tipos.size > 0 && !tipos.has(tipo)) continue;
      out.push({
        contratoId: c.id ?? null, contrato: String(c.number ?? c.id ?? ""), unidade: u.name, tipo, valor: valorDaUnidadeNoContrato(c.value || 0, us, u.name), data: c.contractDate || "",
        empreendimento: c.enterpriseName || "", cliente: c.salesContractCustomers?.[0]?.name || "",
        situacao: c.cancellationDate ? "Cancelado" : c.situation || "", permuta: ehPermuta(c),
      });
    }
  }
  return out;
}

// "53 apartamentos · 22 vagas moto · 5 vagas carro" (do maior para o menor).
export function resumoPorTipo(us: { tipo: string }[]): string {
  const m = new Map<string, number>();
  us.forEach(u => m.set(u.tipo, (m.get(u.tipo) || 0) + 1));
  const plural = (t: string, n: number) => {
    const b = t.toLowerCase();
    if (n === 1) return b;
    const [p, ...r] = b.split(" ");
    const pp = /[aeiou]$/.test(p) ? p + "s" : /l$/.test(p) ? p.slice(0, -1) + "is" : /[rz]$/.test(p) ? p + "es" : p;
    return [pp, ...r].join(" ");
  };
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => `${n} ${plural(t, n)}`).join(" · ");
}

// Contrato de permuta = todas as condições de pagamento são "PE" (Permuta).
// Contrato de venda com só uma parte em permuta não conta aqui.
export function ehPermuta(c: { paymentConditions?: { conditionTypeId: string }[] | null }): boolean {
  const conds = c.paymentConditions || [];
  return conds.length > 0 && conds.every(p => p.conditionTypeId === "PE");
}

// ── Corretores e imobiliárias ──
// O Sienge guarda quem intermediou a venda na COMISSÃO (/commissions), não no
// contrato. Uma comissão aponta o contrato pelo número (salesContractNumber,
// às vezes sem o espaço: "AP1506" × "AP 1506") e pelo empreendimento.
export interface SiengeComissao {
  commissionID: number; enterpriseID: number; enterpriseName?: string;
  brokerID: number; brokerName: string;
  customerName?: string; unitName?: string;
  salesContractNumber: string; value: number; installmentPercentage?: number;
  installmentStatus?: string; dueDate?: string;
}

// Pessoa jurídica (imobiliária) × pessoa física (corretor autônomo), pelo nome:
// o /commissions não traz o tipo do cadastro.
// Corretores da própria Silva Packer (equipe comercial interna), pelo nome do
// credor no Sienge. Gilberto Boing = corretor da casa e gerente comercial
// (Edielson, 22/10/2026). Ficam no ranking com a etiqueta "Da casa", mas o
// "Vendido com parceiros" conta só imobiliárias e corretores de fora.
export const CORRETORES_DA_CASA = new Set(["GILBERTO BOING"]);
const normNome = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export function tipoParceiro(nome: string): "imobiliaria" | "corretor" | "casa" {
  if (CORRETORES_DA_CASA.has(normNome(nome))) return "casa";
  return /\b(LTDA|EIRELI|S\/?A|ME|EPP|IMOBILI\w*|NEG[OÓ]CIOS|ADMINISTRA\w*|CONSULTORIA|CORRETORA)\b/i.test(nome) ? "imobiliaria" : "corretor";
}

type ContratoRanking = {
  id: number; number: string; enterpriseId?: number; enterpriseName?: string; value: number; contractDate?: string;
  salesContractCustomers?: { name: string }[] | null; salesContractUnits?: { name: string; main?: boolean }[] | null;
};

export interface VendaParceiro { contratoId: number; contrato: string; cliente: string; unidades: string[]; data: string; valor: number; comissao: number; comissaoPaga: boolean }
export interface Parceiro {
  id: number; nome: string; tipo: "imobiliaria" | "corretor" | "casa";
  valor: number; comissao: number; contratos: number; clientes: number; ticket: number; vendas: VendaParceiro[];
}

export function rankingParceiros(comissoes: SiengeComissao[], contratos: ContratoRanking[]) {
  const norm = (s: string) => (s || "").replace(/\s+/g, "").toUpperCase();
  const porChave = new Map<string, ContratoRanking>();
  contratos.forEach(c => porChave.set(`${c.enterpriseId ?? ""}|${norm(c.number)}`, c));
  const parceiros = new Map<number, { nome: string; vendas: Map<number, VendaParceiro> }>();
  const comParceiro = new Set<number>();
  const comExterno = new Set<number>();
  comissoes.forEach(k => {
    const c = porChave.get(`${k.enterpriseID}|${norm(k.salesContractNumber)}`);
    if (!c) return; // contrato fora do recorte (filtro, cancelado)
    comParceiro.add(c.id);
    if (tipoParceiro(k.brokerName) !== "casa") comExterno.add(c.id);
    if (!parceiros.has(k.brokerID)) parceiros.set(k.brokerID, { nome: k.brokerName, vendas: new Map() });
    const p = parceiros.get(k.brokerID)!;
    const v = p.vendas.get(c.id) ?? {
      contratoId: c.id, contrato: c.number, cliente: c.salesContractCustomers?.[0]?.name || k.customerName || "—",
      unidades: [...(c.salesContractUnits || [])].sort((a, b) => Number(b.main) - Number(a.main)).map(u => u.name),
      data: c.contractDate || "", valor: c.value || 0, comissao: 0, comissaoPaga: true,
    };
    v.comissao += k.value || 0;
    if ((k.installmentStatus || "").toUpperCase() !== "PAID") v.comissaoPaga = false;
    p.vendas.set(c.id, v);
  });
  const lista: Parceiro[] = Array.from(parceiros.entries()).map(([id, p]) => {
    const vendas = Array.from(p.vendas.values()).sort((a, b) => b.data.localeCompare(a.data));
    const valor = vendas.reduce((s, v) => s + v.valor, 0);
    return {
      id, nome: p.nome, tipo: tipoParceiro(p.nome), valor,
      comissao: Math.round(vendas.reduce((s, v) => s + v.comissao, 0) * 100) / 100,
      contratos: vendas.length, clientes: new Set(vendas.map(v => v.cliente)).size,
      ticket: vendas.length ? valor / vendas.length : 0, vendas,
    };
  }).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
  // Contrato com algum parceiro de fora conta como "com parceiros"; só com a
  // equipe da casa, conta como "casa".
  const intermediados = contratos.filter(c => comExterno.has(c.id));
  const daCasa = contratos.filter(c => comParceiro.has(c.id) && !comExterno.has(c.id));
  const diretos = contratos.filter(c => !comParceiro.has(c.id));
  const porMes = new Map<string, { valor: number; qtd: number }>();
  intermediados.forEach(c => {
    const m = (c.contractDate || "").slice(0, 7); if (!m) return;
    const e = porMes.get(m) ?? { valor: 0, qtd: 0 }; e.valor += c.value || 0; e.qtd++; porMes.set(m, e);
  });
  return {
    parceiros: lista,
    valorComParceiros: intermediados.reduce((s, c) => s + (c.value || 0), 0),
    contratosComParceiros: intermediados.length,
    valorCasa: daCasa.reduce((s, c) => s + (c.value || 0), 0),
    contratosCasa: daCasa.length,
    comissoes: Math.round(lista.reduce((s, p) => s + p.comissao, 0) * 100) / 100,
    comissoesPagas: lista.every(p => p.vendas.every(v => v.comissaoPaga)),
    valorDireto: diretos.reduce((s, c) => s + (c.value || 0), 0),
    contratosDiretos: diretos.length,
    porMes: Array.from(porMes.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mes, e]) => ({ mes, ...e })),
  };
}
