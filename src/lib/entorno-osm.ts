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
  raio?: number;            // m em volta do lote (padrão 700)
  ajusteX?: number;         // m ao longo da rua, para acertar à mão depois de ver
  site?: string;            // página do empreendimento no site (andamento da obra)
}

export interface DadosEntorno {
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
const nomeRua = (n: string) => `(^|[^0-9])${n.slice(0, 1)}[.]?${n.slice(1)}([^0-9]|$)`;

export function consultaLocalizar(l: LocalEntorno): string {
  const bb = l.bbox.join(",");
  const ruas = [l.rua, l.ruaFundos].filter(Boolean).map(n => nomeRua(n!)).join("|");
  return `[out:json][timeout:60];(way["highway"]["name"~"${ruas}",i](${bb});way["natural"="coastline"](${bb}););out geom tags;`;
}

export function consultaEntorno(lat: number, lon: number, raio: number): string {
  const a = `around:${raio},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const longe = `around:${Math.max(raio * 3, 2500)},${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `[out:json][timeout:120];(
way["highway"](${a});
way["building"](${a});
way["leisure"~"park|garden|pitch|playground"](${a});
way["landuse"~"grass|forest|recreation_ground|village_green"](${a});
way["natural"~"wood|scrub|beach|sand|water"](${longe});
way["natural"="coastline"](${longe});
);out geom tags;`;
}

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
  // Normal para o lado do lote: na direção da rua dos fundos.
  let nrm: [number, number] = [-u[1], u[0]];
  const fundos = l.ruaFundos ? els.filter(e => e.type === "way" && casa(e.tags?.name, l.ruaFundos!)).flatMap(e => e.geometry || []).map(p => pr.para(p.lat, p.lon)) : [];
  if (fundos.length) {
    const c = fundos.reduce((m, p) => Math.hypot(p[0] - s[0], p[1] - s[1]) < Math.hypot(m[0] - s[0], m[1] - s[1]) ? p : m);
    if ((c[0] - s[0]) * nrm[0] + (c[1] - s[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
  }
  const { lat, lon } = pr.de(s[0], s[1]);
  return { lat, lon, frente: [-nrm[0], -nrm[1]] };
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
  const out: DadosEntorno = { fonte: "© OpenStreetMap (ODbL)", lote: { lat: +lote.lat.toFixed(6), lon: +lote.lon.toFixed(6) }, ruas: [], predios: [], verde: [], areia: [], mar: [] };
  // Lote (60 × 40 m atrás da rua da frente, com folga): o nosso prédio ocupa o lugar.
  const noLote = (p: number[][]) => { const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length; return Math.abs(cx - (l.ajusteX || 0)) < 34 && cz < -4 && cz > -58; };
  for (const e of els) {
    const t = e.tags || {};
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
      // Mar = faixa larga à DIREITA do sentido da linha (convenção do OSM: terra à esquerda).
      const p = local(g);
      for (let i = 1; i < p.length; i++) {
        const [x0, z0] = p[i - 1], [x1, z1] = p[i];
        const L = Math.hypot(x1 - x0, z1 - z0) || 1;
        // Nesse referencial, a direita do sentido (x, z) é (-dz, dx) (conferido no teste).
        const nx = -(z1 - z0) / L * 3000, nz = (x1 - x0) / L * 3000;
        out.mar.push([[x0, z0], [x1, z1], [r1(x1 + nx), r1(z1 + nz)], [r1(x0 + nx), r1(z0 + nz)]]);
      }
    } else if (t.natural === "beach" || t.natural === "sand") {
      out.areia.push(local(g));
    } else if (t.natural === "water") {
      out.mar.push(local(g));
    } else {
      out.verde.push(local(g));
    }
  }
  return out;
}
