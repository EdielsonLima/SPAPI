// Foto aérea no chão do mapa da cidade do 3D (botão "Foto aérea").
// Edielson, 11/11/2026: "B, foto recente" = imagem de satélite recente na
// terra e na areia, com o mar desenhado do mapa por cima.
//
// A imagem é o World Imagery da Esri. A licença pede conta e chave (ArcGIS
// Location Platform, permissão Location services > Basemaps) e a imagem não
// pode ir guardada no repositório. Por isso o navegador pede os quadradinhos
// ("tiles") ao NOSSO servidor (/api/foto-aerea/z/y/x), que busca na Esri com a
// chave ARCGIS_API_KEY, e monta a foto na hora, já girada para o referencial
// da rua (torre-3d-foto.ts). Sem a chave no servidor o botão nem aparece.
//
// Aqui fica só a conta, pura (trava: foto-aerea.test.ts).

export const ZOOM_FOTO = 17;   // ~1,06 m por pixel em Balneário Camboriú; ~50 tiles por foto
export const RAIO_FOTO = 900;  // m em volta do lote (o mesmo raio dos prédios do mapa)
export const LADO_TILE = 256;
export const SERVICO_ESRI = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer";
// Crédito exigido pela Esri (copyrightText do serviço, conferido em 11/11/2026).
export const CREDITO_FOTO = "Powered by Esri · foto: Esri, Vantor, Earthstar Geographics, GIS User Community";

/** Posição de um ponto na grade de tiles do zoom z (Web Mercator), com fração. */
export function tileDe(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z, f = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.asinh(Math.tan(f)) / Math.PI) / 2) * n];
}

export interface GradeFoto {
  z: number;
  x0: number; y0: number;              // tile do canto noroeste do mosaico
  colunas: number; linhas: number;     // tamanho do mosaico, em tiles
  tiles: { x: number; y: number }[];   // só os que tocam o círculo da foto
  metrosPorPixel: number;              // da foto pronta
  // Leva um pixel do mosaico (u para leste, v para sul) ao pixel da foto pronta
  // (i = x da maquete, j = z; o alto da foto é o fundo do lote). É o
  // [a, b, c, d, e, f] do setTransform do canvas: i = a·u + c·v + e, j = b·u + d·v + f.
  transformacao: [number, number, number, number, number, number];
}

/**
 * Quais tiles baixar e como girá-los para a foto quadrada de `lado` px e
 * 2 × raio metros, centrada no lote. `norte` é o do mapa (entorno-osm.ts):
 * a direção da frente do prédio em (leste, norte).
 */
export function gradeDaFoto(lote: { lat: number; lon: number }, norte: [number, number], lado: number, raio = RAIO_FOTO, z = ZOOM_FOTO): GradeFoto {
  const L = Math.hypot(norte[0], norte[1]) || 1, fe = norte[0] / L, fn = norte[1] / L; // eixo z da maquete
  const xe = -fn, xn = fe;                                                             // eixo x da maquete
  const cos = Math.cos((lote.lat * Math.PI) / 180), n = 2 ** z;
  const kx = cos * 111320, ky = 110540;            // metros por grau: os mesmos do mapa desenhado
  const su = (LADO_TILE * n) / (360 * kx);         // px do mosaico por metro para leste
  const sv = (LADO_TILE * n) / (360 * cos * ky);   // px do mosaico por metro para norte (v cresce para o sul)
  const [tx, ty] = tileDe(lote.lat, lote.lon, z);
  const rx = (raio * su) / LADO_TILE, ry = (raio * sv) / LADO_TILE;
  const x0 = Math.floor(tx - rx), x1 = Math.floor(tx + rx), y0 = Math.floor(ty - ry), y1 = Math.floor(ty + ry);
  const tiles: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    // distância do lote ao quadrado do tile, em metros
    const dx = (Math.max(x - tx, 0, tx - (x + 1)) * LADO_TILE) / su, dy = (Math.max(y - ty, 0, ty - (y + 1)) * LADO_TILE) / sv;
    if (Math.hypot(dx, dy) <= raio) tiles.push({ x, y });
  }
  const u0 = (tx - x0) * LADO_TILE, v0 = (ty - y0) * LADO_TILE, m = (2 * raio) / lado;
  return {
    z, x0, y0, colunas: x1 - x0 + 1, linhas: y1 - y0 + 1, tiles, metrosPorPixel: m,
    transformacao: [
      xe / (su * m), fe / (su * m),
      -xn / (sv * m), -fn / (sv * m),
      (raio - (xe * u0) / su + (xn * v0) / sv) / m, (raio - (fe * u0) / su + (fn * v0) / sv) / m,
    ],
  };
}

/**
 * O tile está na região de um empreendimento com mapa? `bbox` = sul, oeste,
 * norte, leste (o mesmo de LocalEntorno). O servidor só busca esses, para a
 * rota não virar um repassador aberto de imagens da Esri.
 */
export function tileNaArea(z: number, x: number, y: number, bbox: [number, number, number, number]): boolean {
  if (z !== ZOOM_FOTO || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  const [sul, oeste, norte, leste] = bbox;
  const [xa, ya] = tileDe(norte, oeste, z), [xb, yb] = tileDe(sul, leste, z);
  return x >= Math.floor(xa) && x <= Math.floor(xb) && y >= Math.floor(ya) && y <= Math.floor(yb);
}

export const urlDoTile = (z: number, y: number, x: number, chave: string) =>
  `${SERVICO_ESRI}/tile/${z}/${y}/${x}?token=${encodeURIComponent(chave)}`;

/** O que a Esri respondeu no lugar da imagem, em uma linha (ela devolve erro em JSON, às vezes com HTTP 200). */
export function erroDaEsri(status: number, corpo: string): string {
  try {
    const e = (JSON.parse(corpo) as { error?: { code?: number; message?: string } }).error;
    if (e) return `Esri ${e.code ?? status}: ${e.message ?? "erro"}`;
  } catch { /* não era JSON */ }
  return `Esri HTTP ${status}`;
}
