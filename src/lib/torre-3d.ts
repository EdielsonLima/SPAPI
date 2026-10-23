// Maquete 3D do Quadro Espelho (Silva Packer) — geometria pura, sem three.js.
//
// Mesma ideia da "tabela de vendas em 3D" do Financeiro da Leven, mas o prédio
// é montado a partir dos dados do Sienge: cada apartamento vira um bloco do
// pavimento, na cor da situação (situacao-unidade.ts). Sem maquete do
// arquiteto: é um estudo de massa, com as medidas de cada empreendimento aqui.
//
// Piloto: Palácio Elizabeth (Edielson, 22/10): 2 apartamentos por andar,
// espelhados, sala e sacada no canto de dentro — as duas sacadas se encontram
// no meio da frente, como na perspectiva da fachada.

export interface ConfigTorre {
  nome: string;
  largura: number;        // m, frente da torre (eixo x)
  profundidade: number;   // m (eixo z; frente = +z)
  peDireito: number;      // m por pavimento
  sacada: number;         // m que a sacada avança na frente
  larguraSacada: number;  // m de cada sacada (as duas juntas ficam no meio)
  embasamento: number;    // m a mais de cada lado no embasamento (garagens/lojas)
  // Ordem dos finais da esquerda para a direita, olhando a frente. Vazio = ordem
  // numérica. Ajuste de lado se faz só aqui.
  ordemFinais: string[];
}

export const CONFIG_PADRAO: ConfigTorre = {
  nome: "padrão",
  largura: 28, profundidade: 18, peDireito: 3, sacada: 2.2, larguraSacada: 7, embasamento: 6,
  ordemFinais: [],
};

// Planta tipo do Palácio (4 suítes, ~ 18 × 15 m por apartamento, sacada no canto).
// Medidas estimadas pela planta humanizada — conferir com o projeto.
export const CONFIG_PALACIO: ConfigTorre = {
  nome: "Palácio Elizabeth",
  largura: 34, profundidade: 17, peDireito: 3.06, sacada: 2.4, larguraSacada: 8, embasamento: 8,
  ordemFinais: ["01", "02"],
};

export function configDoEmpreendimento(nome: string): ConfigTorre {
  const n = (nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (n.includes("PALACIO ELIZABETH")) return CONFIG_PALACIO;
  return CONFIG_PADRAO;
}

// "AP3001" → andar 30, final "01". Usa o pavimento do cadastro quando vier
// ("30º Pavimento"), senão o número do nome. null = não é unidade de torre.
export function andarEFinal(nome: string, pavimento = ""): { andar: number; final: string } | null {
  const m = /(\d{3,4})\s*$/.exec((nome || "").trim());
  if (!m) return null;
  const num = m[1];
  const final = num.slice(-2);
  const doNome = parseInt(num.slice(0, -2), 10);
  const doCadastro = /(\d+)/.exec(pavimento || "");
  const andar = doCadastro && !/^G/i.test(pavimento.trim()) ? parseInt(doCadastro[1], 10) : doNome;
  if (!andar || andar < 1) return null;
  return { andar, final };
}

// Finais na ordem da frente (esquerda → direita).
export function ordenarFinais(finais: string[], cfg: ConfigTorre): string[] {
  const unicos = Array.from(new Set(finais));
  const pos = (f: string) => { const i = cfg.ordemFinais.indexOf(f); return i < 0 ? 1000 + parseInt(f, 10) : i; };
  return unicos.sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}

export interface Bloco { x: number; y: number; z: number; w: number; h: number; d: number }

// Corpo do apartamento: a frente é dividida igualmente entre os finais do andar.
export function blocoDaUnidade(indice: number, total: number, andar: number, primeiroAndar: number, cfg: ConfigTorre): Bloco {
  const w = cfg.largura / Math.max(1, total);
  const y0 = cotaDoAndar(andar, primeiroAndar, cfg);
  return { x: -cfg.largura / 2 + w * indice + w / 2, y: y0 + cfg.peDireito / 2, z: 0, w: w - 0.25, h: cfg.peDireito - 0.35, d: cfg.profundidade - 0.25 };
}

// Sacada: com 2 finais, no canto de dentro de cada um (encostadas no meio);
// com mais, centrada na frente de cada apartamento.
export function sacadaDaUnidade(indice: number, total: number, andar: number, primeiroAndar: number, cfg: ConfigTorre): Bloco {
  const corpo = blocoDaUnidade(indice, total, andar, primeiroAndar, cfg);
  const w = Math.min(cfg.larguraSacada, corpo.w);
  let x = corpo.x;
  if (total === 2) x = indice === 0 ? -w / 2 : w / 2;
  return { x, y: corpo.y - corpo.h / 2 + 0.1, z: cfg.profundidade / 2 + cfg.sacada / 2, w: w - 0.15, h: 0.2, d: cfg.sacada };
}

// Cota do piso: o embasamento ocupa os pavimentos abaixo do primeiro andar de
// apartamentos (garagens e lojas), com o mesmo pé-direito.
export function cotaDoAndar(andar: number, primeiroAndar: number, cfg: ConfigTorre): number {
  return alturaEmbasamento(primeiroAndar, cfg) + (andar - primeiroAndar) * cfg.peDireito;
}
export function alturaEmbasamento(primeiroAndar: number, cfg: ConfigTorre): number {
  return Math.max(1, primeiroAndar - 1) * cfg.peDireito;
}

// "lado esquerdo, olhando a frente" — para o card da unidade.
export function descricaoDaPosicao(indice: number, total: number): string {
  if (total === 1) return "único do andar";
  if (total === 2) return indice === 0 ? "lado esquerdo (olhando a frente)" : "lado direito (olhando a frente)";
  return `${indice + 1}º da esquerda para a direita (olhando a frente)`;
}
