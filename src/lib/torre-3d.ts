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

import type { LocalEntorno } from "@/lib/entorno-osm";

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
  // Janelas por apartamento em cada face (frente = fora da sacada; lateral só
  // nos apartamentos da ponta; fundos = largura do apartamento).
  janelas: { frente: number; lateral: number; fundos: number };
  // Janelas tiradas da planta (apartamento da esquerda; o da direita é o
  // espelho). Quando existe, substitui a contagem de `janelas`.
  janelasTipo?: JanelaTipo[];
  // Núcleo de escada e elevadores atrás da lâmina (m), centrado em x.
  nucleo?: { largura: number; fundo: number };
  base?: ConfigBase;
  // Cota de piso de um andar tirada do corte; com ela as cotas dos demais
  // andares saem de `peDireito` a partir dali, e não do embasamento.
  cotaRef?: { andar: number; cota: number };
  // Primeiro andar de apartamentos do projeto. Andares abaixo do primeiro que
  // tem unidade no Sienge são desenhados sem situação (não clicáveis).
  primeiroAndar?: number;
  // Onde fica o lote, para o entorno (ruas com nome, quadras, praia) tirado do
  // OpenStreetMap pelo servidor (/api/entorno-3d). Sem isso, só o prédio.
  local?: LocalEntorno;
  // Planta humanizada do apartamento tipo (botão "Ver planta" no card do 3D).
  planta?: PlantaTipo;
}

// A imagem é a do final que NÃO é espelhado; os finais em `espelhar` mostram
// a mesma imagem invertida na horizontal. Fora de `andares` (andar do Sienge)
// a planta aparece com a `nota` (ex.: pavimento diferenciado).
export interface PlantaTipo {
  url: string; titulo: string; espelhar?: string[]; andares?: [number, number]; nota?: string;
  // Aba "Tour 3D": maquete da planta (planta-dollhouse.tsx). Sem isso, só a imagem.
  tour?: TourPlanta;
  // Aba "Fotos": imagens dos ambientes (renders), na ordem de exibição.
  fotos?: FotoPlanta[];
}

// Retângulo em pixels da imagem da planta: [x0, y0, x1, y1].
export type CaixaPx = [number, number, number, number];
export interface TourPlanta {
  paredes: string;        // json gerado por scripts/extrair-paredes-planta.py
  pxPorMetro: number;     // escala da imagem
  ambientes: { nome: string; caixa: CaixaPx; menor?: boolean }[]; // menor = rótulo só ao aproximar
  vidros?: [number, number, number, number][]; // [x, y, w, h] px: esquadrias de vidro (varanda)
}
export interface FotoPlanta { url: string; titulo: string }

export function plantaDaUnidade(cfg: ConfigTorre, unidade: string): { url: string; titulo: string; espelhada: boolean; nota: string | null; tour: TourPlanta | null; fotos: FotoPlanta[] } | null {
  const p = cfg.planta; if (!p) return null;
  const af = andarEFinal(unidade);
  const espelhada = !!af && (p.espelhar || []).includes(af.final);
  const fora = !!af && !!p.andares && (af.andar < p.andares[0] || af.andar > p.andares[1]);
  return { url: p.url, titulo: p.titulo, espelhada, nota: fora ? p.nota || null : null, tour: p.tour || null, fotos: p.fotos || [] };
}

// pos = m do centro da janela até a quina de fora (frente/fundos) ou até a
// face dos fundos (lado). peitoril = m do piso até a janela.
export interface JanelaTipo { face: "frente" | "fundos" | "lado"; pos: number; w: number; h: number; peitoril: number; aberta?: boolean }

// Embasamento detalhado: lojas no térreo, garagens com painéis de veneziana em
// arco, portal de vidro no eixo da torre e o lazer na cobertura.
export interface ConfigBase {
  altura: number;          // m do térreo até a cobertura (lazer)
  peDireitoLazer: number;  // m do pavimento de lazer, entre a base e o 1º andar de apartamentos
  alturaLojas: number;     // m do térreo comercial
  // Contorno da base em metros, no plano da torre: x para a direita, z para a
  // frente (+z = rua), origem no centro da torre. Frente = maior z.
  contorno: [number, number][];
  // Planta humanizada do lazer, deitada na cobertura (centro e tamanho em m).
  lazer?: { url: string; x: number; z: number; largura: number; profundidade: number };
  // Quadra na cobertura (leva alambrado), retângulo em m.
  quadra?: { x0: number; z0: number; x1: number; z1: number };
}

export const CONFIG_PADRAO: ConfigTorre = {
  nome: "padrão",
  largura: 28, profundidade: 18, peDireito: 3, sacada: 2.2, larguraSacada: 7, embasamento: 6,
  ordemFinais: [],
  janelas: { frente: 1, lateral: 3, fundos: 2 },
};

// Planta do lazer do Palácio (imagem enviada pelo Edielson em 23/10): medida
// pela quadra (linhas de 40 m = 742 px → 18,55 px/m). Os elevadores (px 1395 ×
// 845) ficam 2,97 m atrás do centro da lâmina na planta tipo, então o centro
// da torre cai em px 1395 × 900. Converte px da planta em m.
// Planta humanizada do lazer: 33,28 px/m (60,24 m de comprimento no
// carimbo das garagens = 2.005 px). Origem = centro da lâmina da torre, que
// nas garagens fica a 35,9 m da divisa esquerda e com a frente a 3,3 m da
// divisa da Rua 2.950 (lâmina de 10 m, núcleo saindo mais 4,3 m).
const PX_M = 33.28, TORRE = [1423, 1325 - 8.3 * 33.28];
const pxM = (x: number, y: number): [number, number] => [+((x - TORRE[0]) / PX_M).toFixed(2), +((y - TORRE[1]) / PX_M).toFixed(2)];

// Planta baixa tipo do Palácio (arquitetônico, 1/50, mar/2022 — "Pré-formas
// tipo 9º ao 42º pavimento", 34×), enviada pelo Edielson em 23/10: lâmina de
// 32,5 × 10,0 m, final 01 à esquerda e 02 à direita olhando a frente; living
// das duas no meio da frente com uma sacada única de 14,1 × 3,0 m (dividida ao
// meio, churrasqueira em cada lado); suítes nas pontas; núcleo de 6,1 m que
// sai 4,3 m pelos fundos.
// Cortes AA/BB e plantas do térreo, mezanino e garagens (Rodrigo, 23/10):
// térreo de salas comerciais com mezanino 0,00–5,40; garagens 1–4 a +5,40,
// +8,05, +10,70 e +13,35; lazer a +16,00; 7º e 8º "tipo diferenciado" a
// +21,04 e +24,28; tipo do 9º (+27,52) ao 42º (+134,44), 3,24 m piso a piso.
// No Sienge são os andares 1 a 36 (AP101 a AP3602).
export const CONFIG_PALACIO: ConfigTorre = {
  nome: "Palácio Elizabeth",
  largura: 32.5, profundidade: 10, peDireito: 3.24, sacada: 3, larguraSacada: 7.05, embasamento: 8,
  ordemFinais: ["01", "02"],
  janelas: { frente: 2, lateral: 1, fundos: 4 },
  janelasTipo: [
    // Frente: BWC 0,60×0,60, suítes 1,50×2,10 (porta-janela) e BWC 0,60×0,60.
    { face: "frente", pos: 1.5, w: 0.6, h: 0.6, peitoril: 1.6 },
    { face: "frente", pos: 3.7, w: 1.5, h: 2.1, peitoril: 0.1 },
    { face: "frente", pos: 6.8, w: 1.5, h: 2.1, peitoril: 0.1 },
    { face: "frente", pos: 9.0, w: 0.6, h: 0.6, peitoril: 1.6 },
    // Fundos: suíte 1,50×1,20, BWC 0,60×0,60, suíte 1,50×1,20, serviço
    // 1,00×1,20 e a sacada técnica aberta (peitoril 1,20) encostada no núcleo.
    { face: "fundos", pos: 2.4, w: 1.5, h: 1.2, peitoril: 0.9 },
    { face: "fundos", pos: 4.7, w: 0.6, h: 0.6, peitoril: 1.5 },
    { face: "fundos", pos: 6.65, w: 1.5, h: 1.2, peitoril: 0.9 },
    { face: "fundos", pos: 9.25, w: 1.0, h: 1.2, peitoril: 0.9 },
    { face: "fundos", pos: 11.6, w: 2.8, h: 2.2, peitoril: 0.1, aberta: true },
    // Lateral: só o vão de 0,70×0,70 do BWC (o resto é parede de concreto).
    { face: "lado", pos: 3.35, w: 0.7, h: 0.7, peitoril: 1.5 },
  ],
  nucleo: { largura: 6.1, fundo: 4.3 },
  // O Sienge numera os apartamentos a partir do 1º (AP101 = 7º pavimento do
  // projeto, AP3602 = 42º): "andar" aqui é sempre o do Sienge.
  cotaRef: { andar: 1, cota: 21.04 },
  // Endereço do carimbo das plantas: Rua 2950 nº 255 e Rua 2970, Centro, BC.
  // Planta humanizada do site (SIL_ELI_PH_TIPO, 23/10): é o final 01 (sacada
  // à direita, no meio da frente); o 02 é o espelho. Sienge 3–36 = tipo 9º–42º.
  planta: {
    url: "/modelos/palacio-planta-tipo.webp", titulo: "Planta humanizada · apartamento tipo", espelhar: ["02"], andares: [3, 36],
    nota: "Este andar é do tipo diferenciado do projeto (7º e 8º pavimentos): a planta mostrada é a do tipo.",
    // Tour 3D: paredes extraídas da imagem (scripts/extrair-paredes-planta.py);
    // ambientes marcados à mão sobre a imagem (px). Escala: ~80 px por metro
    // (a planta tem 1720 px para ~21,5 m de frente).
    tour: {
      paredes: "/modelos/palacio-planta-tipo.paredes.json", pxPorMetro: 80,
      ambientes: [
        { nome: "Suíte master", caixa: [60, 40, 410, 330] },
        { nome: "Banho master", caixa: [60, 340, 320, 470], menor: true },
        { nome: "Banho suíte 2", caixa: [420, 40, 560, 280], menor: true },
        { nome: "Closet suíte 2", caixa: [420, 290, 760, 470], menor: true },
        { nome: "Suíte 2", caixa: [570, 40, 840, 290] },
        { nome: "Cozinha e copa", caixa: [870, 40, 1360, 480] },
        { nome: "Lavabo", caixa: [870, 340, 1030, 470], menor: true },
        { nome: "Circulação", caixa: [320, 480, 1010, 585], menor: true },
        { nome: "Suíte 3", caixa: [60, 540, 540, 1000] },
        { nome: "Banho suíte 3", caixa: [60, 740, 240, 1000], menor: true },
        { nome: "Suíte 4", caixa: [570, 590, 1000, 1000] },
        { nome: "Banho suíte 4", caixa: [860, 740, 1000, 1000], menor: true },
        { nome: "Jantar", caixa: [1010, 600, 1290, 1000] },
        { nome: "Estar", caixa: [1290, 480, 1660, 1000] },
        { nome: "Varanda gourmet", caixa: [970, 1000, 1640, 1250] },
      ],
      // Esquadrias da varanda (vidro): fechamento entre estar/jantar e varanda, e a fachada da varanda.
      vidros: [[1000, 996, 450, 8], [975, 1250, 500, 8]],
    },
    fotos: [
      { url: "/modelos/palacio-fotos/01-estar-e-jantar.webp", titulo: "Estar e jantar" },
      { url: "/modelos/palacio-fotos/02-varanda.webp", titulo: "Varanda gourmet" },
      { url: "/modelos/palacio-fotos/03-cozinha.webp", titulo: "Cozinha" },
      { url: "/modelos/palacio-fotos/04-quarto-principal.webp", titulo: "Suíte master" },
      { url: "/modelos/palacio-fotos/05-quarto.webp", titulo: "Suíte" },
      { url: "/modelos/palacio-fotos/06-banheiro.webp", titulo: "Banho" },
    ],
  },
  local: { chave: "palacio-elizabeth", rua: "2950", numero: 255, ruaFundos: "2970", bbox: [-27.05, -48.665, -26.95, -48.59], site: "https://silvapacker.com.br/empreendimentos/palacio-elizabeth/" },
  base: {
    // Corte: salas comerciais + mezanino até +5,40, 4 garagens, lazer a +16,00.
    // Fachada (lojas, friso, painéis das garagens, cornija) pela perspectiva.
    altura: 16, peDireitoLazer: 5.04, alturaLojas: 5.4,
    // Corpo principal + quadra nos fundos (contorno da planta do lazer).
    contorno: [pxM(230, 573), pxM(1075, 573), pxM(1075, 24), pxM(1875, 24), pxM(1875, 573), pxM(2235, 573), pxM(2235, 1325), pxM(230, 1325)],
    quadra: (() => { const [x0, z0] = pxM(1075, 24), [x1, z1] = pxM(1875, 573); return { x0, z0, x1, z1 }; })(),
    lazer: { url: "/modelos/palacio-lazer.webp", ...(() => { const [x, z] = pxM(1233, 675); return { x, z }; })(), largura: 2006 / PX_M, profundidade: 1302 / PX_M },
  },
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
  if (cfg.cotaRef) return cfg.cotaRef.cota + (andar - cfg.cotaRef.andar) * cfg.peDireito;
  return alturaEmbasamento(primeiroAndar, cfg) + (andar - primeiroAndar) * cfg.peDireito;
}
export function alturaEmbasamento(primeiroAndar: number, cfg: ConfigTorre): number {
  if (cfg.cotaRef) return cotaDoAndar(Math.min(primeiroAndar, cfg.primeiroAndar ?? primeiroAndar), primeiroAndar, cfg);
  if (cfg.base) return cfg.base.altura + cfg.base.peDireitoLazer;
  return Math.max(1, primeiroAndar - 1) * cfg.peDireito;
}

// Base sem contorno próprio: retângulo `embasamento` m em volta da torre, da
// frente das sacadas (+2 m) até atrás.
export function baseDaTorre(primeiroAndar: number, cfg: ConfigTorre): ConfigBase {
  if (cfg.base) return cfg.base;
  const x = cfg.largura / 2 + cfg.embasamento, zf = cfg.profundidade / 2 + cfg.sacada + 2, zt = -cfg.profundidade / 2 - cfg.embasamento;
  const altura = alturaEmbasamento(primeiroAndar, cfg);
  return { altura, peDireitoLazer: 0, alturaLojas: Math.min(5, altura), contorno: [[-x, zt], [x, zt], [x, zf], [-x, zf]] };
}

// Janela (ou porta da sacada) de um apartamento numa face da torre. x/z = centro
// na face; y = centro; face diz para onde ela olha.
export interface Janela { x: number; y: number; z: number; w: number; h: number; face: "frente" | "fundos" | "esquerda" | "direita"; porta?: boolean; aberta?: boolean }

const espalhar = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 0.5)) / n);

export function janelasDaUnidade(indice: number, total: number, andar: number, primeiroAndar: number, cfg: ConfigTorre): Janela[] {
  const piso = cotaDoAndar(andar, primeiroAndar, cfg);
  const w = cfg.largura / Math.max(1, total);
  const x0 = -cfg.largura / 2 + w * indice, x1 = x0 + w;
  const zF = cfg.profundidade / 2, zT = -cfg.profundidade / 2;
  const jw = 1.5, jh = 1.6, yJ = piso + 0.9 + jh / 2;
  const out: Janela[] = [];
  if (cfg.janelasTipo) {
    const sac = sacadaDaUnidade(indice, total, andar, primeiroAndar, cfg);
    const ph = cfg.peDireito - 0.7;
    out.push({ x: sac.x, y: piso + 0.2 + ph / 2, z: zF, w: sac.w * 0.86, h: ph, face: "frente", porta: true });
    // Da esquerda: medido da quina esquerda; da direita: espelho. Com mais de
    // dois finais, só os das pontas têm lateral.
    const esq = indice < total / 2;
    cfg.janelasTipo.forEach(j => {
      const y = piso + j.peitoril + j.h / 2;
      if (j.face === "lado") {
        if (indice !== 0 && indice !== total - 1) return;
        out.push({ x: esq ? -cfg.largura / 2 : cfg.largura / 2, y, z: zT + j.pos, w: j.w, h: j.h, face: esq ? "esquerda" : "direita", aberta: j.aberta });
        return;
      }
      const x = esq ? x0 + j.pos : x1 - j.pos;
      out.push({ x, y, z: j.face === "frente" ? zF : zT, w: j.w, h: j.h, face: j.face, aberta: j.aberta });
    });
    return out;
  }
  // Porta de vidro atrás da sacada, e janelas da frente no trecho livre.
  const sac = sacadaDaUnidade(indice, total, andar, primeiroAndar, cfg);
  const ph = cfg.peDireito - 0.7;
  out.push({ x: sac.x, y: piso + 0.2 + ph / 2, z: zF, w: sac.w * 0.86, h: ph, face: "frente", porta: true });
  const livres: [number, number][] = [[x0, sac.x - sac.w / 2], [sac.x + sac.w / 2, x1]].filter(([a, b]) => b - a > jw + 1) as [number, number][];
  const totalLivre = livres.reduce((t, [a, b]) => t + b - a, 0);
  livres.forEach(([a, b]) => {
    const n = Math.max(1, Math.round(cfg.janelas.frente * (b - a) / Math.max(totalLivre, 1)));
    // Recuo de 1,6 m da quina (pilastra) para a janela não encostar nela.
    const ia = a <= -cfg.largura / 2 + 0.01 ? a + 1.6 : a + 0.6, ib = b >= cfg.largura / 2 - 0.01 ? b - 1.6 : b - 0.6;
    espalhar(ia, ib, n).forEach(x => out.push({ x, y: yJ, z: zF, w: jw, h: jh, face: "frente" }));
  });
  espalhar(x0 + 0.8, x1 - 0.8, cfg.janelas.fundos).forEach(x => out.push({ x, y: yJ, z: zT, w: jw, h: jh, face: "fundos" }));
  const laterais = espalhar(zT + 1.6, zF - 1.6, cfg.janelas.lateral);
  if (indice === 0) laterais.forEach(z => out.push({ x: -cfg.largura / 2, y: yJ, z, w: jw, h: jh, face: "esquerda" }));
  if (indice === total - 1) laterais.forEach(z => out.push({ x: cfg.largura / 2, y: yJ, z, w: jw, h: jh, face: "direita" }));
  return out;
}

// "lado esquerdo, olhando a frente" — para o card da unidade.
export function descricaoDaPosicao(indice: number, total: number): string {
  if (total === 1) return "único do andar";
  if (total === 2) return indice === 0 ? "lado esquerdo (olhando a frente)" : "lado direito (olhando a frente)";
  return `${indice + 1}º da esquerda para a direita (olhando a frente)`;
}

export const CONFIGS_COM_ENTORNO: ConfigTorre[] = [CONFIG_PALACIO];
