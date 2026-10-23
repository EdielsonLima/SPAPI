// Peças do prédio da maquete 3D (three.js): texturas desenhadas em canvas,
// caixas com UV em metros, painéis em arco e o embasamento detalhado
// (lojas, friso, garagens com veneziana, portal de vidro e lazer na cobertura).
//
// A geometria (medidas, contorno, janelas) vem de lib/torre-3d; aqui só o
// desenho. Só é carregado junto com a maquete (next/dynamic).

import * as THREE from "three";
import type { Bloco, ConfigBase } from "@/lib/torre-3d";

export const CORES = {
  fachada: "#e9e1d3",   // bege da perspectiva
  clara: "#f4efe6",     // molduras, cornijas
  pedra: "#8f8a83",     // soco
  veneziana: "#2e3237",
  toldo: "#24282c",
  ferro: "#1c1f22",
};

// Textura de canvas. Com `repetir`, 1 repetição = 1 m (as caixas têm UV em m).
export function texturaCanvas(larg: number, alt: number, desenhar: (c: CanvasRenderingContext2D, w: number, h: number) => void, repetir = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = larg; cv.height = alt;
  desenhar(cv.getContext("2d")!, larg, alt);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Pseudoaleatório fixo: a pastilha sai igual a cada abertura.
function sorteio(semente: number) {
  let s = semente;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function criarTexturas() {
  // Pastilha cinza das pilastras (perspectiva): 8 × 8 por metro.
  const mosaico = texturaCanvas(256, 256, (c, w) => {
    const r = sorteio(7), n = 8, p = w / n;
    c.fillStyle = "#9a9ea4"; c.fillRect(0, 0, w, w);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 168 + Math.floor(r() * 50);
      c.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      c.fillRect(i * p + 1.5, j * p + 1.5, p - 3, p - 3);
    }
  });
  // Veneziana das garagens: 6 lâminas por metro.
  const veneziana = texturaCanvas(128, 128, (c, w) => {
    c.fillStyle = CORES.veneziana; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 6; i++) {
      const y = (i * w) / 6;
      c.fillStyle = "#454a51"; c.fillRect(0, y, w, 4);
      c.fillStyle = "#1e2125"; c.fillRect(0, y + w / 6 - 3, w, 3);
    }
  });
  // Friso ornamental acima das lojas (arabescos escuros sobre bege): 1 painel.
  const friso = texturaCanvas(512, 256, (c, w, h) => {
    c.fillStyle = "#ead9bd"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#5a4636"; c.lineWidth = 7; c.lineCap = "round";
    c.strokeRect(10, 10, w - 20, h - 20);
    const voluta = (cx: number, cy: number, s: number, lado: number) => {
      c.beginPath();
      for (let t = 0; t < Math.PI * 3.2; t += 0.1) {
        const rr = s * (1 - t / (Math.PI * 3.6));
        const x = cx + lado * rr * Math.cos(t), y = cy + rr * Math.sin(t);
        if (t === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    };
    [-1, 1].forEach(lado => {
      voluta(w / 2 + lado * 70, h / 2, 55, lado);
      voluta(w / 2 + lado * 180, h / 2 + 20, 45, -lado);
      c.beginPath(); c.moveTo(w / 2 + lado * 20, h / 2 - 60);
      c.bezierCurveTo(w / 2 + lado * 120, h / 2 - 100, w / 2 + lado * 200, h / 2 - 20, w / 2 + lado * 230, h / 2 - 70); c.stroke();
    });
    c.beginPath(); c.arc(w / 2, h / 2 - 10, 18, 0, Math.PI * 2); c.stroke();
  }, false);
  // Vitrine da loja: interior aceso, quente.
  const loja = texturaCanvas(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f7e3bf"); g.addColorStop(0.6, "#d9ae73"); g.addColorStop(1, "#8a6a45");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(60,45,30,.35)";
    [0.2, 0.45, 0.72].forEach(f => { c.fillRect(f * w, h * 0.45, w * 0.05, h * 0.5); c.beginPath(); c.arc(f * w + w * 0.025, h * 0.4, w * 0.035, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = CORES.ferro; c.fillRect(0, 0, w, 6); c.fillRect(w / 2 - 3, 0, 6, h);
  }, false);
  // Vitral do portal: vidro escuro com caixilho e ferro trabalhado embaixo.
  const vitral = texturaCanvas(256, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#5f7d8f"); g.addColorStop(0.5, "#344d5c"); g.addColorStop(1, "#6c8a9a");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = CORES.ferro; c.lineWidth = 6;
    for (let x = 0; x <= w; x += w / 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y <= h; y += h / 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      const cy = h * (0.72 + k * 0.09);
      c.beginPath(); c.arc(w * 0.3, cy, w * 0.14, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(w * 0.7, cy, w * 0.14, 0, Math.PI * 2); c.stroke();
    }
  }, false);
  // Porta de entrada em ferro (grade escura sobre vidro).
  const portao = texturaCanvas(256, 512, (c, w, h) => {
    c.fillStyle = "#3a3f44"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#111315"; c.lineWidth = 5;
    for (let x = 16; x < w; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
    c.beginPath(); c.arc(w / 2, h * 0.3, w * 0.3, 0, Math.PI * 2); c.stroke();
  }, false);
  // Alambrado da quadra (foto do terraço no site): malha losango, 4 por metro.
  const alambrado = texturaCanvas(128, 128, (c, w) => {
    c.clearRect(0, 0, w, w);
    c.strokeStyle = "rgba(40,44,48,.95)"; c.lineWidth = 6;
    for (let k = -w; k < w * 2; k += w / 4) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k + w, w); c.stroke();
      c.beginPath(); c.moveTo(k + w, 0); c.lineTo(k, w); c.stroke();
    }
  });
  return { mosaico, veneziana, friso, loja, vitral, portao, alambrado };
}
export type Texturas = ReturnType<typeof criarTexturas>;

// Caixa com UV em metros (a textura repete por metro, qualquer que seja o tamanho).
export function caixaUV(b: Bloco, mat: THREE.Material, sombra = true): THREE.Mesh {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[b.d, b.h], [b.d, b.h], [b.w, b.d], [b.w, b.d], [b.w, b.h], [b.w, b.h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(b.x, b.y, b.z);
  m.castShadow = sombra; m.receiveShadow = true;
  return m;
}

// Contorno em arco abatido (painel das garagens, vitral do portal): base em y0,
// altura total h, flecha = quanto o arco sobe acima dos cantos.
function arcoEm(p: THREE.Shape | THREE.Path, w: number, h: number, y0 = 0, flecha = w * 0.18) {
  const rise = Math.min(flecha, w / 2);
  const r = (w * w / 4 + rise * rise) / (2 * rise);
  const cy = y0 + h - r;
  const a0 = Math.atan2(y0 + h - rise - cy, w / 2);
  p.moveTo(-w / 2, y0);
  p.lineTo(w / 2, y0);
  p.lineTo(w / 2, y0 + h - rise);
  p.absarc(0, cy, r, a0, Math.PI - a0, false);
  p.lineTo(-w / 2, y0);
}

// Painel em arco com moldura saliente. Desenhado no plano xy, olhando +z.
function painelArco(w: number, h: number, mat: THREE.Material, matMoldura: THREE.Material, descarte: THREE.BufferGeometry[], uvMetro = true): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape(); arcoEm(s, w, h);
  const geo = new THREE.ShapeGeometry(s, 24);
  if (!uvMetro) {
    // UV 0..1 (vitral): normaliza pelo retângulo do painel.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, uv.getY(i) / h);
  }
  const painel = new THREE.Mesh(geo, mat); painel.receiveShadow = true;
  g.add(painel);
  const m = 0.45;
  const fora = new THREE.Shape(); arcoEm(fora, w + m * 2, h + m * 1.6, -m * 0.6, w * 0.18 + m * 0.3);
  const furo = new THREE.Path(); arcoEm(furo, w, h);
  fora.holes.push(furo);
  const moldura = new THREE.Mesh(new THREE.ExtrudeGeometry(fora, { depth: 0.35, bevelEnabled: false, curveSegments: 24 }), matMoldura);
  moldura.castShadow = true; moldura.receiveShadow = true;
  g.add(moldura);
  // Fecho (pedra-chave) no topo do arco.
  const fecho = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.55), matMoldura);
  fecho.position.set(0, h + 0.2, 0.25); fecho.castShadow = true;
  g.add(fecho);
  descarte.push(geo, moldura.geometry, fecho.geometry);
  return g;
}

interface Materiais {
  fachada: THREE.Material; clara: THREE.Material; pedra: THREE.Material; mosaico: THREE.Material;
  veneziana: THREE.Material; toldo: THREE.Material; friso: THREE.Material; loja: THREE.Material;
  vitral: THREE.Material; portao: THREE.Material; guarda: THREE.Material; telhado: THREE.Material;
  verde: THREE.Material; cupula: THREE.Material; alambrado: THREE.Material;
}

export function materiaisDoPredio(tx: Texturas): Materiais {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const friso = tx.friso.clone(); friso.wrapS = THREE.RepeatWrapping; friso.needsUpdate = true;
  return {
    fachada: std({ color: CORES.fachada }),
    clara: std({ color: CORES.clara, roughness: 0.7 }),
    pedra: std({ color: CORES.pedra }),
    mosaico: std({ map: tx.mosaico, roughness: 0.6 }),
    veneziana: std({ map: tx.veneziana, roughness: 0.55, metalness: 0.2 }),
    toldo: std({ color: CORES.toldo, roughness: 0.9 }),
    friso: std({ map: friso, roughness: 0.8 }),
    loja: std({ map: tx.loja, emissive: "#3a2a14", roughness: 0.2, metalness: 0.1 }),
    vitral: std({ map: tx.vitral, roughness: 0.15, metalness: 0.4 }),
    portao: std({ map: tx.portao, roughness: 0.4, metalness: 0.5 }),
    guarda: new THREE.MeshStandardMaterial({ color: "#5b6b78", transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3 }),
    verde: std({ color: "#4d7a43", roughness: 0.95 }),
    // Cúpulas do coroamento (foto aérea do site): cobertura escura, curva.
    cupula: std({ color: "#454b52", roughness: 0.5, metalness: 0.2 }),
    alambrado: new THREE.MeshStandardMaterial({ map: tx.alambrado, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 }),
    telhado: std({ color: "#d9d2c5" }),
  };
}

type Tipo = "frente" | "lado" | "fundos";

// Embasamento a partir do contorno. Frente (maior z) leva lojas, friso, garagens
// e o portal no eixo da torre; laterais, só garagens; fundos, liso com cornija.
export function montarBase(base: ConfigBase, mats: Materiais, add: (o: THREE.Object3D) => void, descarte: THREE.BufferGeometry[], larguraPortal: number) {
  const H = base.altura, hL = Math.min(base.alturaLojas, H);
  const pts = base.contorno;
  // Corpo extrudado do contorno (shape em x, -z; extrusão vira altura).
  const forma = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const corpo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: H, bevelEnabled: false }), mats.fachada);
  corpo.rotation.x = -Math.PI / 2; corpo.castShadow = true; corpo.receiveShadow = true;
  add(corpo); descarte.push(corpo.geometry);
  const teto = new THREE.Mesh(new THREE.ShapeGeometry(forma), mats.telhado);
  teto.rotation.x = -Math.PI / 2; teto.position.y = H + 0.01; teto.receiveShadow = true;
  add(teto); descarte.push(teto.geometry);

  const zFrente = Math.max(...pts.map(p => p[1]));
  const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const xs = pts.map(p => p[0]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);

  pts.forEach((p, i) => {
    let a = p, b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) return;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    // Normal para fora, pela orientação do polígono (área > 0 = anti-horário em x,z).
    const nx = area > 0 ? uz : -uz, nz = area > 0 ? -ux : ux;
    // Grupo local: x ao longo da parede (da esquerda para a direita de quem
    // olha de fora), z para fora, y para cima.
    if (ux * nz - uz * nx < 0) { [a, b] = [b, a]; }
    const ang = Math.atan2(nx, nz);
    const g = new THREE.Group();
    g.position.set(a[0], 0, a[1]); g.rotation.y = ang;
    const tipo: Tipo = Math.abs(a[1] - zFrente) < 0.01 && Math.abs(b[1] - zFrente) < 0.01 ? "frente"
      : (Math.abs(nx) > 0.9 && (Math.abs(a[0] - xMin) < 0.01 || Math.abs(a[0] - xMax) < 0.01)) ? "lado" : "fundos";
    decorarFace(g, L, tipo, H, hL, mats, descarte, tipo === "frente" ? -a[0] : null, larguraPortal);
    add(g);
  });
}

function decorarFace(g: THREE.Group, L: number, tipo: Tipo, H: number, hL: number, mats: Materiais, descarte: THREE.BufferGeometry[], eixoTorre: number | null, larguraPortal: number) {
  const box = (b: Bloco, m: THREE.Material, sombra = true) => { const mesh = caixaUV(b, m, sombra); g.add(mesh); descarte.push(mesh.geometry); return mesh; };
  // Soco de pedra, cornija com dentículo e guarda-corpo de vidro do lazer.
  box({ x: L / 2, y: 0.3, z: 0.15, w: L, h: 0.6, d: 0.3 }, mats.pedra);
  box({ x: L / 2, y: H - 0.55, z: 0.6, w: L + 1.2, h: 1.1, d: 1.2 }, mats.clara);
  box({ x: L / 2, y: H - 1.45, z: 0.3, w: L + 0.6, h: 0.5, d: 0.6 }, mats.clara);
  // Guarda-corpo do lazer (foto da piscina no site): pilaretes de pedra clara
  // a cada ~4 m com vidro escuro entre eles; na frente, floreira por dentro.
  box({ x: L / 2, y: H + 0.6, z: 0.05, w: L, h: 1.2, d: 0.06 }, mats.guarda, false);
  const nP = Math.max(1, Math.round(L / 4));
  for (let k = 0; k <= nP; k++) box({ x: (L * k) / nP, y: H + 0.7, z: 0.05, w: 0.5, h: 1.4, d: 0.5 }, mats.clara);
  box({ x: L / 2, y: H + 1.45, z: 0.05, w: L + 0.5, h: 0.12, d: 0.55 }, mats.clara);
  if (tipo === "frente") {
    box({ x: L / 2, y: H + 0.35, z: -0.8, w: L - 1, h: 0.7, d: 0.9 }, mats.toldo);
    box({ x: L / 2, y: H + 0.85, z: -0.8, w: L - 1.2, h: 0.45, d: 0.8 }, mats.verde);
  }
  if (tipo === "fundos") return;

  const temGaragem = H - hL > 7;
  const yFriso = hL + 0.8;               // centro do friso (1,6 m)
  const yG0 = hL + 2.3, yG1 = H - 2.6;   // faixa das garagens
  // Vãos: na frente o portal fica no eixo da torre; o resto em vãos de ~8,5 m.
  const vaos: { a: number; b: number; portal?: boolean }[] = [];
  const dividir = (a: number, b: number) => {
    const n = Math.max(1, Math.round((b - a) / 8.5));
    for (let k = 0; k < n; k++) vaos.push({ a: a + ((b - a) * k) / n, b: a + ((b - a) * (k + 1)) / n });
  };
  if (tipo === "frente" && eixoTorre !== null && eixoTorre > larguraPortal && eixoTorre < L - larguraPortal) {
    const pa = eixoTorre - larguraPortal / 2, pb = eixoTorre + larguraPortal / 2;
    dividir(0, pa); vaos.push({ a: pa, b: pb, portal: true }); dividir(pb, L);
  } else dividir(0, L);

  const meio = Math.floor(vaos.length / 2);
  vaos.forEach((v, k) => {
    const w = v.b - v.a, cx = (v.a + v.b) / 2;
    // Pilastra de pastilha em cada divisa (e nas pontas).
    box({ x: v.a, y: (H - 1.9) / 2, z: 0.3, w: 1.4, h: H - 1.9, d: 0.6 }, mats.mosaico);
    if (k === vaos.length - 1) box({ x: v.b, y: (H - 1.9) / 2, z: 0.3, w: 1.4, h: H - 1.9, d: 0.6 }, mats.mosaico);

    if (v.portal) {
      // Portão de ferro no térreo, vitrines dos lados e três vitrais em arco.
      const porta = new THREE.Mesh(new THREE.PlaneGeometry(4, hL - 0.6), mats.portao);
      porta.position.set(cx, (hL - 0.6) / 2 + 0.6, 0.05); g.add(porta); descarte.push(porta.geometry);
      [-1, 1].forEach(l => {
        const vit = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 3.6, hL - 1.4), mats.loja);
        vit.position.set(cx + l * (w / 4 + 1.1), (hL - 1.4) / 2 + 0.6, 0.05); g.add(vit); descarte.push(vit.geometry);
      });
      box({ x: cx, y: hL + 0.4, z: 0.4, w: w - 1.4, h: 0.8, d: 0.8 }, mats.clara);
      const n = 3, wv = (w - 1.4) / n - 1.2, hv = H - 3 - (hL + 1.4);
      for (let j = 0; j < n; j++) {
        const pv = painelArco(wv, hv, mats.vitral, mats.clara, descarte, false);
        pv.position.set(v.a + 0.7 + (w - 1.4) * (j + 0.5) / n, hL + 1.4, 0.06);
        g.add(pv);
      }
      return;
    }

    if (tipo === "frente") {
      // Vitrine com caixilho, toldo escuro inclinado e friso ornamental.
      const vit = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.8, hL - 1.6), mats.loja);
      vit.position.set(cx, (hL - 1.6) / 2 + 0.6, 0.05); g.add(vit); descarte.push(vit.geometry);
      box({ x: cx, y: hL - 0.9, z: 0.1, w: w - 1.6, h: 0.18, d: 0.2 }, mats.toldo);
      const toldo = box({ x: cx, y: hL - 1.25, z: 0.85, w: w - 2, h: 0.12, d: 1.8 }, mats.toldo);
      toldo.rotation.x = 0.38;
      const fr = box({ x: cx, y: yFriso, z: 0.12, w: w - 1.6, h: 1.4, d: 0.24 }, mats.friso, false);
      // Friso: um painel inteiro por vão (UV 0..1 na face da frente).
      const uv = fr.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 16; i < 20; i++) uv.setXY(i, uv.getX(i) / (w - 1.6), uv.getY(i) / 1.4);
    } else if (k === meio) {
      // Lateral: portão da garagem no térreo.
      const pg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(6, w - 2), hL - 1.2), mats.veneziana);
      pg.position.set(cx, (hL - 1.2) / 2 + 0.6, 0.05); g.add(pg); descarte.push(pg.geometry);
    }
    box({ x: cx, y: hL + 0.05, z: 0.35, w, h: 0.5, d: 0.7 }, mats.clara);

    if (temGaragem) {
      const pv = painelArco(w - 3, yG1 - yG0, mats.veneziana, mats.clara, descarte);
      pv.position.set(cx, yG0, 0.06);
      g.add(pv);
    }
  });
}

// Planta humanizada do lazer deitada na cobertura.
export function montarLazer(base: ConfigBase, add: (o: THREE.Object3D) => void, descarte: { dispose(): void }[]) {
  const lz = base.lazer;
  if (!lz) return;
  new THREE.TextureLoader().load(lz.url, tex => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(lz.largura, lz.profundidade);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(lz.x, base.altura + 0.04, lz.z);
    m.receiveShadow = true;
    add(m);
    descarte.push(tex, mat, geo);
  });
}

// Alambrado de 4 m em volta da quadra, na cobertura da base.
export function montarQuadra(base: ConfigBase, mats: Materiais, add: (o: THREE.Object3D) => void, descarte: { dispose(): void }[]) {
  const q = base.quadra;
  if (!q) return;
  const h = 4, y = base.altura + h / 2;
  const lados: [number, number, number, number][] = [[q.x0, q.z0, q.x1, q.z0], [q.x1, q.z0, q.x1, q.z1], [q.x0, q.z1, q.x1, q.z1], [q.x0, q.z0, q.x0, q.z1]];
  lados.forEach(([ax, az, bx, bz]) => {
    const L = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(L, h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * h);
    const tela = new THREE.Mesh(geo, mats.alambrado);
    tela.position.set((ax + bx) / 2, y, (az + bz) / 2);
    tela.rotation.y = Math.atan2(-(bz - az), bx - ax);
    add(tela); descarte.push(geo);
    const nP = Math.max(1, Math.round(L / 5));
    for (let k = 0; k <= nP; k++) {
      const poste = caixaUV({ x: ax + ((bx - ax) * k) / nP, y, z: az + ((bz - az) * k) / nP, w: 0.12, h, d: 0.12 }, mats.toldo);
      add(poste); descarte.push(poste.geometry);
    }
  });
}

// Calçada, rua e árvores em vaso na frente da base.
export function montarRua(base: ConfigBase, add: (o: THREE.Object3D) => void, descarte: { dispose(): void }[], escuro: boolean) {
  const xs = base.contorno.map(p => p[0]), zf = Math.max(...base.contorno.map(p => p[1]));
  const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, w = x1 - x0, cx = (x0 + x1) / 2;
  const plano = (larg: number, prof: number, z: number, cor: string, y: number) => {
    const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.95 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, prof), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(cx, y, z); m.receiveShadow = true;
    add(m); descarte.push(m.geometry, mat);
  };
  plano(w, 6, zf + 3, escuro ? "#475569" : "#cfcac2", 0.05);
  plano(w, 14, zf + 13, escuro ? "#1e293b" : "#4b5058", 0.03);
  const faixa = new THREE.MeshStandardMaterial({ color: "#f1f5f9" });
  descarte.push(faixa);
  for (let x = x0 + 2; x < x1; x += 7) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.25), faixa);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, zf + 13); add(m); descarte.push(m.geometry);
  }
  const vaso = new THREE.MeshStandardMaterial({ color: "#3a3d40", roughness: 0.7 });
  const copa = new THREE.MeshStandardMaterial({ color: "#3f6b3a", roughness: 0.9 });
  descarte.push(vaso, copa);
  const gVaso = new THREE.BoxGeometry(1.1, 0.9, 1.1), gCopa = new THREE.SphereGeometry(0.95, 12, 10), gTronco = new THREE.CylinderGeometry(0.08, 0.1, 1, 6);
  descarte.push(gVaso, gCopa, gTronco);
  for (let x = Math.min(...xs) + 4; x < Math.max(...xs) - 2; x += 8.5) {
    const v = new THREE.Mesh(gVaso, vaso); v.position.set(x, 0.45, zf + 1.4); v.castShadow = true; add(v);
    const t = new THREE.Mesh(gTronco, vaso); t.position.set(x, 1.3, zf + 1.4); add(t);
    const c = new THREE.Mesh(gCopa, copa); c.position.set(x, 2.5, zf + 1.4); c.castShadow = true; add(c);
  }
}
