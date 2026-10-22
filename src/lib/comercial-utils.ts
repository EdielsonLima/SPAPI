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
  enterpriseName: string;
  companyName: string;
  name: string;
  propertyType: string;
  commercialStock: string;
  floor: string;
  contractNumber: string;
  privateArea: number;
}

export type ComercialAba = "visao" | "vendas" | "clientes" | "unidades" | "quadro";

// Rota de cada tela do módulo. A ordem é a do menu.
export const ABAS_COMERCIAL: { key: ComercialAba; label: string; href: string; subtitle: string }[] = [
  { key: "visao", label: "Visão Geral", href: "/comercial/visao-geral", subtitle: "VGV, estoque e ranking de vendas" },
  { key: "vendas", label: "Vendas", href: "/comercial/vendas", subtitle: "Contratos de venda por empreendimento" },
  { key: "clientes", label: "Clientes", href: "/comercial/clientes", subtitle: "Carteira de clientes e contratos" },
  { key: "unidades", label: "Unidades", href: "/comercial/unidades", subtitle: "Situação comercial de cada unidade" },
  { key: "quadro", label: "Quadro Espelho", href: "/comercial/quadro-espelho", subtitle: "Espelho de vendas por pavimento" },
];
