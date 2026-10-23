// Entorno da Torre 3D: ruas com nome, quadras (prédios do OpenStreetMap),
// verde, areia e mar, a partir de /api/entorno-3d (ver src/lib/entorno-osm.ts).
//
// Feito para ser leve (Edielson, 23/10: "um sistema leve, fluindo bem"):
// cada camada é UMA malha (geometrias juntadas), material Lambert, sem sombra
// projetada; os nomes das ruas são planos deitados no asfalto, um por trecho
// de ~300 m. As camadas do chão ficam no mesmo plano e se separam por
// polygonOffset (sem isso, piscam ao girar).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DadosEntorno } from "@/lib/entorno-osm";

export interface Entorno { grupo: THREE.Group; dispose: () => void }

function forma(p: number[][]): THREE.Shape | null {
  if (p.length < 3) return null;
  // Shape no plano xy com y = -z: depois de deitar (rotação -90° em x) volta a z.
  return new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
}

function faixa(pts: number[][], largura: number): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const nx = -tz * largura / 2, nz = tx * largura / 2, [x, z] = pts[i];
    pos.push(x + nx, 0, z + nz, x - nx, 0, z - nz);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function plano(geos: THREE.BufferGeometry[], cor: string, nivel: number, descarte: { dispose(): void }[]) {
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose());
  const m = new THREE.MeshLambertMaterial({ color: cor, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -nivel, polygonOffsetUnits: -nivel * 4 });
  descarte.push(g, m);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 0.02 * nivel; mesh.receiveShadow = true;
  return mesh;
}

function chapas(lista: number[][][]) {
  return lista.map(p => { const f = forma(p); if (!f) return null; const g = new THREE.ShapeGeometry(f); g.rotateX(-Math.PI / 2); return g; })
    .filter((g): g is THREE.ShapeGeometry => !!g);
}

// Texto do nome da rua num canvas (fundo transparente, contorno claro).
function texturaNome(nome: string, escuro: boolean) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const fonte = "600 44px Inter, system-ui, sans-serif";
  ctx.font = fonte;
  c.width = Math.ceil(ctx.measureText(nome).width) + 24; c.height = 64;
  ctx.font = fonte; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.lineWidth = 8; ctx.strokeStyle = escuro ? "rgba(15,23,42,.9)" : "rgba(255,255,255,.95)";
  ctx.strokeText(nome, c.width / 2, 33);
  ctx.fillStyle = escuro ? "#e2e8f0" : "#334155";
  ctx.fillText(nome, c.width / 2, 33);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return { t, aspecto: c.width / c.height };
}

const curto = (n: string) => n.replace(/^Avenida /i, "Av. ").replace(/^Rua /i, "R. ");

export function montarEntorno(d: DadosEntorno, escuro: boolean): Entorno {
  const grupo = new THREE.Group();
  const descarte: { dispose(): void }[] = [];
  const add = (m: THREE.Object3D | null) => { if (m) grupo.add(m); };

  add(plano(chapas(d.mar), escuro ? "#0c2a43" : "#7fb6d6", 1, descarte));
  add(plano(chapas(d.areia), escuro ? "#3b3527" : "#eadfc3", 2, descarte));
  add(plano(chapas(d.verde), escuro ? "#1f3a2a" : "#b9d3a6", 2, descarte));
  const ruas = d.ruas.filter(r => r.l >= 3);
  add(plano(ruas.map(r => faixa(r.p, r.l + 2.5)).filter((g): g is THREE.BufferGeometry => !!g), escuro ? "#334155" : "#d4d0c8", 3, descarte)); // calçada
  add(plano(ruas.map(r => faixa(r.p, r.l)).filter((g): g is THREE.BufferGeometry => !!g), escuro ? "#1e293b" : "#6b7079", 4, descarte));
  add(plano(d.ruas.filter(r => r.l < 3).map(r => faixa(r.p, r.l)).filter((g): g is THREE.BufferGeometry => !!g), escuro ? "#3f4b5c" : "#cfc8bb", 4, descarte));

  // Quadras: prédios extrudados pela altura do OSM (ou estimada pelo tipo).
  const gp: THREE.BufferGeometry[] = [];
  d.predios.forEach(b => {
    const f = forma(b.p); if (!f) return;
    const g = new THREE.ExtrudeGeometry(f, { depth: b.h, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    gp.push(g.index ? g.toNonIndexed() : g);
  });
  if (gp.length) {
    const g = mergeGeometries(gp, false); gp.forEach(x => x.dispose());
    const m = new THREE.MeshLambertMaterial({ color: escuro ? "#475569" : "#e7e3dc" });
    descarte.push(g, m);
    grupo.add(new THREE.Mesh(g, m));
  }

  // Nomes das ruas: deitados no asfalto, no sentido da rua, um a cada ~300 m.
  const porNome = new Map<string, number[][][]>();
  d.ruas.forEach(r => { if (r.n && r.l >= 5) { if (!porNome.has(r.n)) porNome.set(r.n, []); porNome.get(r.n)!.push(r.p); } });
  const gPlano = new THREE.PlaneGeometry(1, 1);
  descarte.push(gPlano);
  porNome.forEach((trechos, nome) => {
    const { t, aspecto } = texturaNome(curto(nome), escuro);
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    descarte.push(t, mat);
    trechos.forEach(p => {
      let desde = 300; // m desde o último nome neste trecho
      for (let i = 1; i < p.length; i++) {
        const [x0, z0] = p[i - 1], [x1, z1] = p[i], L = Math.hypot(x1 - x0, z1 - z0);
        if (L < 30 || desde < 250) { desde += L; continue; }
        const altura = 4.2, m = new THREE.Mesh(gPlano, mat);
        m.scale.set(altura * aspecto, altura, 1);
        let ang = Math.atan2(-(z1 - z0), x1 - x0);           // sentido da rua visto de cima
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang <= -Math.PI / 2) ang += Math.PI; // nunca de cabeça para baixo
        m.rotation.set(-Math.PI / 2, 0, ang);
        m.position.set((x0 + x1) / 2, 0.3, (z0 + z1) / 2);
        m.renderOrder = 2;
        grupo.add(m);
        desde = L / 2;
      }
    });
  });

  return { grupo, dispose: () => descarte.forEach(x => x.dispose()) };
}
