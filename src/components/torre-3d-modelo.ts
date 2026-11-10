// Maquete vinda do projeto (arquivo .m3d): baixa, descompacta e vira geometria
// do three.js. A leitura do formato fica em lib/modelo-3d (pura); as cores por
// situação, em torre-3d.tsx.

import * as THREE from "three";
import { ehGzip, lerModelo, posicoesDaFaixa, coresDaFaixa, type Faixa, type Modelo3D } from "@/lib/modelo-3d";

// Um download por arquivo enquanto a aba vive: a cena do 3D é refeita a cada
// mudança de filtro, e o arquivo (1,3 MB) não precisa vir nem ser lido de novo.
const baixados = new Map<string, Promise<Modelo3D>>();

export function baixarModelo(url: string): Promise<Modelo3D> {
  let p = baixados.get(url);
  if (!p) {
    p = (async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`maquete: HTTP ${r.status}`);
      let buf = await r.arrayBuffer();
      // O arquivo é gzip por dentro (o servidor não comprime). Se algum proxy
      // já tiver descompactado, segue direto.
      if (ehGzip(buf)) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      return lerModelo(buf);
    })();
    p.catch(() => baixados.delete(url)); // falhou: a próxima abertura tenta de novo
    baixados.set(url, p);
  }
  return p;
}

const ruido = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
// Luz das janelas à noite (mesmos tons do 3D do Palácio): quente, e algumas frias.
const ACESA = new THREE.Color("#ffd39a"), FRIA = new THREE.Color("#e8eeff");

// "Cor" por vértice do vidro de uma unidade = a luz de cada pano à noite. Os
// triângulos são agrupados em panos de ~1,2 m (pela posição) e cada pano tem
// intensidade própria: ~12 % apagados, ~20 % em luz fria, o resto 0,55–1.
// Sem isso a unidade acesa vira um bloco chapado. De dia o material ignora.
function luzDoVidro(pos: Float32Array, semente: number): Float32Array {
  const out = new Float32Array(pos.length);
  const c = new THREE.Color();
  for (let t = 0; t < pos.length; t += 9) {
    const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3, cz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3;
    const pano = Math.floor(cx / 1.2) * 31 + Math.floor(cz / 1.2) * 17 + semente * 101;
    const r1 = ruido(pano + 1), r2 = ruido(pano + 57);
    const fator = r1 < 0.12 ? 0.05 : 0.55 + 0.45 * ruido(pano + 7);
    c.copy(ACESA).lerp(FRIA, r2 < 0.2 ? 0.6 : 0).multiplyScalar(fator);
    for (let v = 0; v < 9; v += 3) { out[t + v] = c.r; out[t + v + 1] = c.g; out[t + v + 2] = c.b; }
  }
  return out;
}

// cores: "modelo" = a cor de cada triângulo no projeto; "luz" = a luz noturna
// do vidro (ver luzDoVidro); null = sem cor por vértice.
export function geometriaDaFaixa(m: Modelo3D, faixa: Faixa, cores: "modelo" | "luz" | null, semente = 0): THREE.BufferGeometry | null {
  if (!faixa[1]) return null;
  const g = new THREE.BufferGeometry();
  const pos = posicoesDaFaixa(m, faixa);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (cores === "modelo") g.setAttribute("color", new THREE.BufferAttribute(coresDaFaixa(m, faixa), 3));
  if (cores === "luz") g.setAttribute("color", new THREE.BufferAttribute(luzDoVidro(pos, semente), 3));
  g.computeVertexNormals(); // sem índice = normal por face (faces chapadas)
  // Triângulo sem área fica com normal zero, que no shader vira um pixel
  // inválido — e o brilho (bloom) do modo noite espalha esse pixel pela tela
  // inteira. A conversão já tira esses triângulos; isto é a segunda trava.
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    if (!(x * x + y * y + z * z > 0.25)) n.setXYZ(i, 0, 1, 0);
  }
  return g;
}

// Vidro de uma unidade: de dia a cor do material (a da situação); à noite a
// luz vem da "cor" por vértice (um tom por pano), ligada pelo uniforme `noite`
// compartilhado. O three multiplicaria a cor difusa pela cor por vértice: aqui
// ela só entra na luz.
export function materialDoVidro(noite: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35, side: THREE.DoubleSide, emissive: "#000000" });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNoite = noite;
    sh.fragmentShader = "uniform float uNoite;\n" + sh.fragmentShader
      .replace("#include <color_fragment>", "")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= mix( vec3( 1.0 ), vColor, uNoite );");
  };
  return mat;
}
