// Foto aérea no chão do mapa do 3D (ver src/lib/foto-aerea.ts): baixa os tiles
// pelo nosso servidor, junta num mosaico, gira para o referencial da rua, tira
// o mar (fica o desenhado, sem nuvem nem água escura) e esfuma a borda, para
// emendar com o mapa desenhado que continua em volta.
//
// Leve: ~50 imagens pequenas (cerca de 1 MB), só quando ligam o botão, e na
// cena vira UMA textura numa chapa.

import * as THREE from "three";
import type { DadosEntorno } from "@/lib/entorno-osm";
import { gradeDaFoto, LADO_TILE, RAIO_FOTO } from "@/lib/foto-aerea";

const LADO = 2048;      // px da textura: 0,88 m por pixel
const EM_PARALELO = 8;  // pedidos ao mesmo tempo

export async function texturaDaFoto(d: DadosEntorno): Promise<THREE.CanvasTexture> {
  if (!d.norte) throw new Error("mapa sem direção");
  const g = gradeDaFoto(d.lote, d.norte, LADO);

  // 1) Mosaico sem girar: tiles lado a lado, em posição inteira (sem emenda).
  const mosaico = document.createElement("canvas");
  mosaico.width = g.colunas * LADO_TILE; mosaico.height = g.linhas * LADO_TILE;
  const cm = mosaico.getContext("2d")!;
  const fila = g.tiles.slice();
  let falhas = 0;
  await Promise.all(Array.from({ length: EM_PARALELO }, async () => {
    for (let t = fila.pop(); t; t = fila.pop()) {
      try {
        const r = await fetch(`/api/foto-aerea/${g.z}/${t.y}/${t.x}`);
        if (!r.ok) throw new Error(String(r.status));
        const img = await createImageBitmap(await r.blob());
        cm.drawImage(img, (t.x - g.x0) * LADO_TILE, (t.y - g.y0) * LADO_TILE, LADO_TILE, LADO_TILE);
        img.close();
      } catch { falhas++; }
    }
  }));
  // Um ou outro tile que falte deixa um buraco, por onde aparece o mapa
  // desenhado; faltando muitos, melhor avisar do que mostrar uma colcha.
  if (falhas > g.tiles.length / 5) throw new Error(`foto aérea: ${falhas} de ${g.tiles.length} partes não vieram`);

  // 2) Gira para o referencial da rua: x da maquete para a direita, fundo do lote no alto.
  const c = document.createElement("canvas");
  c.width = c.height = LADO;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(...g.transformacao);
  ctx.drawImage(mosaico, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 3) Onde o mapa tem mar, a foto fica transparente. Os polígonos vão um a um
  // para uma máscara (num caminho só, dois de sentido contrário se anulariam).
  const px = (v: number) => (v + RAIO_FOTO) / g.metrosPorPixel;
  const masc = document.createElement("canvas");
  masc.width = masc.height = LADO;
  const cmasc = masc.getContext("2d")!;
  for (const pol of d.mar) {
    if (pol.length < 3) continue;
    cmasc.beginPath();
    pol.forEach(([x, z], k) => (k ? cmasc.lineTo(px(x), px(z)) : cmasc.moveTo(px(x), px(z))));
    cmasc.closePath();
    cmasc.fill();
  }
  ctx.globalCompositeOperation = "destination-out";
  ctx.filter = "blur(3px)"; // navegador sem filtro de canvas: a beira do mar fica seca, sem erro
  ctx.drawImage(masc, 0, 0);
  ctx.filter = "none";

  // 4) Borda redonda em degradê (16 % do raio).
  ctx.globalCompositeOperation = "destination-in";
  const borda = ctx.createRadialGradient(LADO / 2, LADO / 2, 0.84 * (LADO / 2), LADO / 2, LADO / 2, LADO / 2);
  for (let k = 0; k <= 8; k++) { const t = k / 8; borda.addColorStop(t, `rgba(0,0,0,${(1 - t * t * (3 - 2 * t)).toFixed(3)})`); }
  ctx.fillStyle = borda;
  ctx.fillRect(0, 0, LADO, LADO);
  ctx.globalCompositeOperation = "source-over";

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
