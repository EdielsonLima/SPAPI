// Entorno da maquete 3D (ruas com nome, quadras, praia e mar) a partir do
// OpenStreetMap. Funções puras: o servidor (/api/entorno-3d) baixa do
// Overpass, passa por aqui UMA vez e guarda o resultado no banco.
//
// Referencial do resultado ("referencial da rua"): metros, origem no eixo da
// rua da frente, na altura do número do lote; +z sai do lote para a rua e
// atravessa ela; +x é a direita de quem olha o prédio da rua. A Torre 3D só
// desloca o grupo até o eixo da rua dela.

export interface LocalEntorno {
  chave: string;            // linha do cache no banco
  rua: string;              // rua da frente, só o número ("2950")
  numero: number;           // número do lote = metros desde a Av. Atlântica (Balneário Camboriú)
  ruaFundos?: string;       // rua dos fundos: diz de que lado da rua da frente fica o lote
  bbox: [number, number, number, number]; // sul, oeste, norte, leste — onde procurar as ruas
  raio?: number;            // m em volta do lote com prédios (padrão RAIO_PREDIOS)
  raioLonge?: number;       // m com ruas, praia e mar (padrão RAIO_LONGE)
  ajusteX?: number;         // m ao longo da rua, para acertar à mão depois de ver
  // Rua que curva ou quebra (a régua "número = metros em linha reta desde a
  // orla" erra): o lote é ancorado no cruzamento da rua da frente com esta. A
  // origem fica a `distancia` m do cruzamento, andando pela rua da frente para
  // o lado do mar. Nome por extenso, sem pontuação ("Avenida Brasil").
  esquina?: { rua: string; distancia: number };
  // Caixa do lote no referencial da rua (m): x0 a x1 ao longo da rua e `fundo`
  // para dentro. Prédio do mapa com o centro aí dentro sai, porque o nosso
  // ocupa o lugar. Padrão: 34 m para cada lado e 58 m de fundo.
  lote?: { x0: number; x1: number; fundo: number };
  site?: string;            // página do empreendimento no site (andamento da obra)
}

// Sobe quando o formato ou o recorte mudam: o servidor devolve o salvo antigo
// e refaz em segundo plano (a próxima abertura já vem nova).
export const VERSAO_ENTORNO = 3;
// Prédios só perto (são o peso do mapa); ruas, areia e mar vão mais longe
// para a praia aparecer (Edielson, 23/10: "o pessoal quer saber onde fica a
// praia"). Além disso a neblina da cena esconde a borda.
export const RAIO_PREDIOS = 900;
export const RAIO_LONGE = 1800;

export interface DadosEntorno {
  versao?: number;
  norte?: [number, number];  // direção do norte no referencial (x, z), para a bússola
  fonte: string;
  lote: { lat: number; lon: number };
  ruas: { l: number; n: string; p: number[][] }[];   // largura, nome, pontos [x, z]
  predios: { h: number; p: number[][] }[];
  verde: number[][][];
  areia: number[][][];
  mar: number[][][];
}

export interface ElementoOSM {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { role?: string; geometry?: { lat: number; lon: number }[] }[];
}

// Casa "Rua 2950", "Rua 2.950", "R. 2950 - Centro"… O ponto vai como [.] e não
// como \. — o Overpass trata "\." dentro de string como escape inválido.
// Nome que não é número ("Avenida Brasil") casa como está.
const nomeRua = (n: string) => /^[0-9]+$/.test(n) ? `(^|[^0-9])${n.slice(0, 1)}[.]?${n.slice(1)}([^0-9]|$)` : n;

export function consultaLocalizar(l: LocalEntorno): string {
  const bb = l.bbox.join(",");
  const ruas = [l.rua, l.ruaFundos, l.esquina?.rua].filter(Boolean).map(n => nomeRua(n!)).join("|");
  return `[out:json][timeout:60];(way["highway"]["name"~"${ruas}",i](${bb});way["natural"="coastline"](${bb}););out geom tags;`;
}

export function consultaEntorno(lat: number, lon: number, raio: number, raioLonge = RAIO_LONGE): string {
  const a = `around:${raio},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const meio = `around:${Math.max(raioLonge, raio)},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const longe = `around:${Math.max(raioLonge * 1.6, 2500)},${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `[out:json][timeout:180];(
way["highway"](${a});
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"](${meio});
way["building"](${a});
way["leisure"~"park|garden|pitch|playground"](${meio});
way["landuse"~"grass|forest|recreation_ground|village_green"](${meio});
way["natural"~"wood|scrub|beach|sand|water"](${longe});
way["natural"="coastline"](${longe});
);out geom tags;
(relation["natural"~"beach|sand|water"](${longe}););out geom;`;
}

// Raio (m) do mar e da areia em volta do lote: o mesmo da consulta.
const raioDoMar = (l: LocalEntorno) => Math.max((l.raioLonge ?? RAIO_LONGE) * 1.6, 2500);

// Metros leste/norte em volta de um ponto (plano local, suficiente a 1–3 km).
function projecao(lat0: number, lon0: number) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110540;
  return {
    para: (lat: number, lon: number): [number, number] => [(lon - lon0) * kx, (lat - lat0) * ky],
    de: (e: number, n: number) => ({ lat: lat0 + n / ky, lon: lon0 + e / kx }),
  };
}

const casa = (nome: string | undefined, n: string) => !!nome && new RegExp(nomeRua(n), "i").test(nome.trim());

export interface Lote { lat: number; lon: number; frente: [number, number] } // frente = unitário leste/norte, do lote para a rua

// Acha o lote: os nós da rua da frente, alinhados no eixo principal (as ruas
// de Balneário são retas); a ponta perto do mar é o começo da numeração, e o
// número do lote é a distância andada dali. O lado é o da rua dos fundos.
export function localizarLote(els: ElementoOSM[], l: LocalEntorno): Lote | null {
  if (l.esquina) return localizarPelaEsquina(els, l);
  const nos = els.filter(e => e.type === "way" && casa(e.tags?.name, l.rua)).flatMap(e => e.geometry || []);
  if (nos.length < 2) return null;
  const lat0 = nos.reduce((s, p) => s + p.lat, 0) / nos.length, lon0 = nos.reduce((s, p) => s + p.lon, 0) / nos.length;
  const pr = projecao(lat0, lon0);
  const pts = nos.map(p => pr.para(p.lat, p.lon));
  // Eixo principal: o par de pontos mais distante.
  let a = pts[0], b = pts[1], dmax = -1;
  for (const p of pts) for (const q of pts) { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (d > dmax) { dmax = d; a = p; b = q; } }
  // Começo = ponta mais perto da costa (sem costa: a ponta mais a leste).
  const costa = els.filter(e => e.tags?.natural === "coastline").flatMap(e => e.geometry || []).map(p => pr.para(p.lat, p.lon));
  const dCosta = (p: number[]) => costa.length ? Math.min(...costa.map(c => Math.hypot(c[0] - p[0], c[1] - p[1]))) : -p[0];
  if (dCosta(b) < dCosta(a)) [a, b] = [b, a];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: [number, number] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const s = [a[0] + u[0] * l.numero, a[1] + u[1] * l.numero];
  return loteNoPonto(els, l, pr, s, u);
}

// s = ponto no eixo da rua da frente; u = sentido da rua, do mar para o
// interior. O lote fica do lado da rua dos fundos.
function loteNoPonto(els: ElementoOSM[], l: LocalEntorno, pr: ReturnType<typeof projecao>, s: number[], u: [number, number]): Lote {
  let nrm: [number, number] = [-u[1], u[0]];
  const fundos = l.ruaFundos ? els.filter(e => e.type === "way" && casa(e.tags?.name, l.ruaFundos!)).flatMap(e => e.geometry || []).map(p => pr.para(p.lat, p.lon)) : [];
  if (fundos.length) {
    const c = fundos.reduce((m, p) => Math.hypot(p[0] - s[0], p[1] - s[1]) < Math.hypot(m[0] - s[0], m[1] - s[1]) ? p : m);
    if ((c[0] - s[0]) * nrm[0] + (c[1] - s[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
  }
  const { lat, lon } = pr.de(s[0], s[1]);
  return { lat, lon, frente: [-nrm[0], -nrm[1]] };
}

// Encontro de dois trechos (inclusive nas pontas), ou null.
function encontro(a: number[], b: number[], c: number[], d: number[]): number[] | null {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const w = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && w >= -1e-6 && w <= 1 + 1e-6 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null;
}

// Lote ancorado numa esquina (`l.esquina`): acha o cruzamento da rua da frente
// com a outra, e anda `distancia` m pela rua da frente — acompanhando as
// curvas dela — para o lado do mar. A direção da rua é a do trecho onde parou.
function localizarPelaEsquina(els: ElementoOSM[], l: LocalEntorno): Lote | null {
  const vias = (nome: string) => els.filter(e => e.type === "way" && casa(e.tags?.name, nome) && (e.geometry?.length ?? 0) >= 2).map(e => e.geometry!);
  const daRua = vias(l.rua), daEsquina = vias(l.esquina!.rua);
  if (!daRua.length || !daEsquina.length) return null;
  const nos = daRua.flat();
  const lat0 = nos.reduce((s, p) => s + p.lat, 0) / nos.length, lon0 = nos.reduce((s, p) => s + p.lon, 0) / nos.length;
  const pr = projecao(lat0, lon0);
  const m = (g: { lat: number; lon: number }[]) => g.map(p => pr.para(p.lat, p.lon) as number[]);
  const ruas = daRua.map(m), outras = daEsquina.map(m);
  // Cada trecho da rua que passa pelo cruzamento vira dois caminhos saindo dele.
  const caminhos: number[][][] = [];
  let cruz: number[] | null = null;
  for (const w of ruas) {
    let onde = -1, c: number[] | null = null;
    for (let i = 0; i + 1 < w.length && !c; i++) for (const o of outras) {
      for (let j = 0; j + 1 < o.length && !c; j++) { c = encontro(w[i], w[i + 1], o[j], o[j + 1]); if (c) onde = i; }
      if (c) break;
    }
    if (!c) continue;
    cruz = cruz ?? c;
    caminhos.push([c, ...w.slice(onde + 1)], [c, ...w.slice(0, onde + 1).reverse()]);
  }
  if (!cruz) return null;
  const tam = (c: number[][]) => c.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - c[i][0], p[1] - c[i][1]), 0);
  const andaveis = caminhos.filter(c => tam(c) > 1);
  if (!andaveis.length) return null;
  // Para o mar = o caminho cuja ponta fica mais perto da costa (sem costa: mais a leste).
  const costa = els.filter(e => e.tags?.natural === "coastline").flatMap(e => e.geometry || []).map(p => pr.para(p.lat, p.lon));
  const dCosta = (p: number[]) => costa.length ? Math.min(...costa.map(c => Math.hypot(c[0] - p[0], c[1] - p[1]))) : -p[0];
  const paraOMar = andaveis.reduce((a, b) => dCosta(b[b.length - 1]) < dCosta(a[a.length - 1]) ? b : a);
  let falta = l.esquina!.distancia, s = paraOMar[0], dir: [number, number] | null = null;
  for (let i = 1; i < paraOMar.length; i++) {
    const a = paraOMar[i - 1], b = paraOMar[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    if (falta <= L || i === paraOMar.length - 1) { const k = Math.min(1, falta / L); s = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; break; }
    falta -= L;
  }
  if (!dir) return null;
  return loteNoPonto(els, l, pr, s, [-dir[0], -dir[1]]); // u = do mar para o interior
}

// Praia e rio costumam vir como relação (multipolígono): junta os trechos de
// fora pelas pontas até fechar cada anel.
function aneis(membros: NonNullable<ElementoOSM["members"]>): { lat: number; lon: number }[][] {
  const k = (q: { lat: number; lon: number }) => `${q.lat.toFixed(7)},${q.lon.toFixed(7)}`;
  const partes = membros.filter(m => (m.role === "outer" || !m.role) && (m.geometry?.length ?? 0) >= 2).map(m => m.geometry!.slice());
  const out: { lat: number; lon: number }[][] = [];
  while (partes.length) {
    let anel = partes.shift()!, cresceu = true;
    while (cresceu && k(anel[0]) !== k(anel[anel.length - 1])) {
      cresceu = false;
      for (let i = 0; i < partes.length; i++) {
        const q = partes[i], fim = k(anel[anel.length - 1]);
        if (k(q[0]) === fim) anel = anel.concat(q.slice(1));
        else if (k(q[q.length - 1]) === fim) anel = anel.concat(q.slice(0, -1).reverse());
        else continue;
        partes.splice(i, 1); cresceu = true; break;
      }
    }
    if (anel.length >= 4) out.push(anel);
  }
  return out;
}

// ── Mar ──
// A costa do OpenStreetMap é uma linha com a terra à ESQUERDA do sentido; no
// referencial daqui, a direita do sentido (dx, dz) é (-dz, dx). Até a versão
// 2 o mar era uma faixa de 3 km à direita de cada trecho da costa: numa costa
// reta serve, mas com ilha, ponta e foz de rio (a Barra Sul) as faixas
// atravessavam a terra e pintavam a cidade de azul. Agora o mar é o que se
// ALCANÇA pela água: numa grade de 20 m, as células cortadas pela costa viram
// muro e a água se espalha a partir de pontos logo à direita da costa, dentro
// do círculo da consulta. A grade sai em retângulos (linhas iguais juntadas) e
// uma faixa estreita, exata, acompanha a costa para a borda não ficar em degraus.
const CEL = 20;        // m, lado da célula da grade
const FAIXA = 48;      // m, largura da faixa exata junto à costa (cobre a célula-muro)

type Trecho = [number, number, number, number]; // ax, az, bx, bz

// Distância até a primeira costa que um raio (ponto p, direção unitária n) encontra, ou `max`.
function ateACosta(px: number, pz: number, nx: number, nz: number, trechos: Trecho[], max: number): number {
  let melhor = max;
  for (const [ax, az, bx, bz] of trechos) {
    const ex = bx - ax, ez = bz - az, den = nx * ez - nz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - px) * ez - (az - pz) * ex) / den;
    if (t <= 1e-6 || t >= melhor) continue;
    const w = ((ax - px) * nz - (az - pz) * nx) / den;
    if (w >= 0 && w <= 1) melhor = t;
  }
  return melhor;
}

// Junta as linhas de costa que continuam uma na outra (fim de uma = começo da outra).
function encadear(linhas: number[][][]): number[][][] {
  const k = (q: number[]) => `${q[0]},${q[1]}`;
  const cadeias = linhas.filter(c => c.length >= 2).map(c => c.slice());
  for (let mudou = true; mudou;) {
    mudou = false;
    const inicio = new Map<string, number>();
    cadeias.forEach((c, i) => { if (c.length) inicio.set(k(c[0]), i); });
    for (let i = 0; i < cadeias.length && !mudou; i++) {
      const c = cadeias[i]; if (!c.length) continue;
      const j = inicio.get(k(c[c.length - 1]));
      if (j === undefined || j === i || !cadeias[j].length) continue;
      c.push(...cadeias[j].slice(1)); cadeias[j] = []; mudou = true;
    }
  }
  return cadeias.filter(c => c.length >= 2);
}

export function marDaCosta(costas: number[][][], raio: number): number[][][] {
  const cadeias = encadear(costas);
  if (!cadeias.length) return [];
  // Costa aberta que acaba dentro do círculo é prolongada reta para fora dele (sem isso a água daria a volta pela ponta).
  const fechada = (c: number[][]) => c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
  const muros = cadeias.map(c => {
    if (fechada(c)) return c;
    const a = c[0], b = c[1], y = c[c.length - 2], z = c[c.length - 1];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, lz = Math.hypot(z[0] - y[0], z[1] - y[1]) || 1, E = raio * 3;
    return [[a[0] - (b[0] - a[0]) / la * E, a[1] - (b[1] - a[1]) / la * E], ...c, [z[0] + (z[0] - y[0]) / lz * E, z[1] + (z[1] - y[1]) / lz * E]];
  });
  const trechos: Trecho[] = [];
  muros.forEach(c => { for (let i = 1; i < c.length; i++) trechos.push([c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]]); });

  const n = Math.ceil(raio / CEL) * 2, r2 = raio * raio;
  const LIVRE = 0, MURO = 1, AGUA = 2;
  const g = new Uint8Array(n * n);
  const cel = (x: number, z: number) => { const i = Math.floor((x + raio) / CEL), j = Math.floor((z + raio) / CEL); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const centro = (k: number): [number, number] => [-raio + ((k % n) + 0.5) * CEL, -raio + (Math.floor(k / n) + 0.5) * CEL];
  for (let k = 0; k < g.length; k++) { const [x, z] = centro(k); if (x * x + z * z > r2) g[k] = MURO; }
  // Muro: células por onde a costa passa (amostra a cada 5 m; a água anda só em cruz, então não vaza na diagonal).
  const sementes: number[] = [], terra: number[] = [];
  for (const [ax, az, bx, bz] of trechos) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux; // n = direita do sentido = água
    // Só a parte do trecho que passa perto do círculo interessa.
    const t0 = Math.max(0, -(ax * ux + az * uz) - raio * 1.5), t1 = Math.min(L, -(ax * ux + az * uz) + raio * 1.5);
    for (let t = t0; t <= t1; t += CEL / 4) { const k = cel(ax + ux * t, az + uz * t); if (k >= 0) g[k] = MURO; }
    for (let t = t0 + CEL / 2; t <= t1; t += CEL) {
      const px = ax + ux * t, pz = az + uz * t, d = CEL * 1.6;
      // Ponto 32 m para a água (e para a terra), só se não houver outra costa no caminho: canal estreito não serve de semente.
      if (ateACosta(px + nx * 0.5, pz + nz * 0.5, nx, nz, trechos, d + CEL) >= d + CEL) sementes.push(px + nx * d, pz + nz * d);
      if (ateACosta(px - nx * 0.5, pz - nz * 0.5, -nx, -nz, trechos, d + CEL) >= d + CEL) terra.push(px - nx * d, pz - nz * d);
    }
  }
  const fila: number[] = [];
  for (let i = 0; i < sementes.length; i += 2) { const k = cel(sementes[i], sementes[i + 1]); if (k >= 0 && g[k] === LIVRE) { g[k] = AGUA; fila.push(k); } }
  while (fila.length) {
    const k = fila.pop()!, i = k % n;
    for (const v of [i > 0 ? k - 1 : -1, i < n - 1 ? k + 1 : -1, k - n, k + n]) if (v >= 0 && v < g.length && g[v] === LIVRE) { g[v] = AGUA; fila.push(v); }
  }
  // Trava: se a água chegou a um ponto que é terra, a costa veio com buraco. Melhor ficar só com a faixa junto à costa do que alagar a cidade.
  let vazou = false;
  for (let i = 0; i < terra.length && !vazou; i += 2) { const k = cel(terra[i], terra[i + 1]); vazou = k >= 0 && g[k] === AGUA; }

  const out: number[][][] = [];
  if (!vazou) {
    // Retângulos: trechos de água de cada linha, juntando linhas seguidas com o mesmo trecho.
    let abertos = new Map<string, number[]>(); // "i0-i1" -> [x0, z0, x1, z1]
    const fechar = (m: Map<string, number[]>) => m.forEach(([x0, z0, x1, z1]) => out.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]));
    for (let j = 0; j < n; j++) {
      const linha = new Map<string, number[]>();
      for (let i = 0; i < n; i++) {
        if (g[j * n + i] !== AGUA) continue;
        const i0 = i; while (i + 1 < n && g[j * n + i + 1] === AGUA) i++;
        const chave = `${i0}-${i}`, antes = abertos.get(chave), z0 = -raio + j * CEL;
        if (antes) { antes[3] = z0 + CEL; linha.set(chave, antes); abertos.delete(chave); }
        else linha.set(chave, [-raio + i0 * CEL, z0, -raio + (i + 1) * CEL, z0 + CEL]);
      }
      fechar(abertos); abertos = linha;
    }
    fechar(abertos);
  }
  // Faixa exata junto à costa: em cada vértice, para a direita, até FAIXA m ou até a outra margem.
  const normais = new Map<string, [number, number]>();
  const kv = (q: number[]) => `${q[0]},${q[1]}`;
  cadeias.forEach(c => { for (let i = 1; i < c.length; i++) {
    const L = Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]); if (L < 1e-6) continue;
    const nx = -(c[i][1] - c[i - 1][1]) / L, nz = (c[i][0] - c[i - 1][0]) / L;
    for (const q of [c[i - 1], c[i]]) { const a = normais.get(kv(q)) ?? [0, 0]; normais.set(kv(q), [a[0] + nx, a[1] + nz]); }
  } });
  const borda = new Map<string, number[] | null>(); // vértice -> ponto da borda de fora da faixa
  const bordaDe = (q: number[]) => {
    const k = kv(q); if (borda.has(k)) return borda.get(k)!;
    const [sx, sz] = normais.get(k) ?? [0, 0], L = Math.hypot(sx, sz);
    let b: number[] | null = null;
    if (L > 1e-6) { const nx = sx / L, nz = sz / L, w = Math.max(0, ateACosta(q[0] + nx * 0.5, q[1] + nz * 0.5, nx, nz, trechos, FAIXA) - 0.5); b = [r1(q[0] + nx * w), r1(q[1] + nz * w)]; }
    borda.set(k, b); return b;
  };
  const perto = (q: number[]) => q[0] * q[0] + q[1] * q[1] < (raio + 200) * (raio + 200);
  cadeias.forEach(c => { for (let i = 1; i < c.length; i++) {
    if (!perto(c[i - 1]) && !perto(c[i])) continue;
    const b0 = bordaDe(c[i - 1]), b1 = bordaDe(c[i]);
    if (b0 && b1) out.push([c[i - 1], c[i], b1, b0]);
  } });
  return out;
}

const LARG: Record<string, number> = {
  motorway: 14, trunk: 13, primary: 12, primary_link: 7, secondary: 11, secondary_link: 7, tertiary: 9,
  residential: 7, unclassified: 7, living_street: 5, service: 4, pedestrian: 5, footway: 2, path: 1.6, cycleway: 2.2, steps: 2,
};
const ALTURA_TIPO: Record<string, number> = { apartments: 30, residential: 18, commercial: 15, hotel: 36, office: 24, retail: 8, house: 7, garage: 4, roof: 4 };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function processarEntorno(els: ElementoOSM[], lote: Lote, l: LocalEntorno): DadosEntorno {
  const pr = projecao(lote.lat, lote.lon);
  const [fe, fn] = lote.frente;
  // x = direita de quem olha o prédio da rua (olhando para -frente), z = frente.
  const xe = -fn, xn = fe;
  const local = (g: { lat: number; lon: number }[]) => g.map(p => { const [e, n] = pr.para(p.lat, p.lon); return [r1(e * xe + n * xn), r1(e * fe + n * fn)]; });
  const out: DadosEntorno = { versao: VERSAO_ENTORNO, norte: [Math.round(fe * 1000) / 1000, Math.round(fn * 1000) / 1000], fonte: "© OpenStreetMap (ODbL)", lote: { lat: +lote.lat.toFixed(6), lon: +lote.lon.toFixed(6) }, ruas: [], predios: [], verde: [], areia: [], mar: [] };
  // Lote (60 × 40 m atrás da rua da frente, com folga): o nosso prédio ocupa o lugar.
  const cx0 = (l.ajusteX || 0) + (l.lote?.x0 ?? -34), cx1 = (l.ajusteX || 0) + (l.lote?.x1 ?? 34), fundo = l.lote?.fundo ?? 58;
  const noLote = (p: number[][]) => { const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length; return cx > cx0 && cx < cx1 && cz < -4 && cz > -fundo; };
  const costas: number[][][] = [];
  for (const e of els) {
    const t = e.tags || {};
    if (e.type === "relation") {
      // Praia e rio como multipolígono: cada anel de fora vira uma chapa.
      for (const anel of aneis(e.members || [])) {
        if (t.natural === "beach" || t.natural === "sand") out.areia.push(local(anel));
        else if (t.natural === "water") out.mar.push(local(anel));
      }
      continue;
    }
    const g = e.geometry; if (!g || g.length < 2) continue;
    if (t.highway) {
      if (/proposed|construction|elevator|corridor|platform/.test(t.highway)) continue;
      out.ruas.push({ l: LARG[t.highway] ?? 3, n: t.name || "", p: local(g) });
    } else if (t.building) {
      const p = local(g); if (noLote(p)) continue;
      const lv = parseFloat(t["building:levels"] || ""), hm = parseFloat((t.height || "").replace(",", "."));
      const h = hm > 0 ? hm : lv > 0 ? lv * 3 : ALTURA_TIPO[t.building] ?? 9;
      out.predios.push({ h: r1(h), p });
    } else if (t.natural === "coastline") {
      costas.push(local(g)); // o mar sai da costa inteira, depois do laço (marDaCosta)
    } else if (t.natural === "beach" || t.natural === "sand") {
      out.areia.push(local(g));
    } else if (t.natural === "water") {
      out.mar.push(local(g));
    } else {
      out.verde.push(local(g));
    }
  }
  out.mar.push(...marDaCosta(costas, raioDoMar(l)));
  return out;
}
