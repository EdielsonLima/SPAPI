// Trava da foto aérea do 3D: npx tsx src/__tests__/foto-aerea.test.ts
// Confere a conta que escolhe os tiles e gira a foto para o referencial da rua
// (src/lib/foto-aerea.ts), nos dois mapas que vão prontos no deploy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gradeDaFoto, tileDe, tileNaArea, urlDoTile, erroDaEsri, ZOOM_FOTO, RAIO_FOTO, LADO_TILE, SERVICO_ESRI } from "../lib/foto-aerea";
import { CONFIGS_COM_ENTORNO } from "../lib/torre-3d";
import type { DadosEntorno } from "../lib/entorno-osm";

const LADO = 2048;
const perto = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} × ${b}`);

// 1. Grade de tiles do Web Mercator: pontos conhecidos.
assert.deepEqual(tileDe(0, 0, 1), [1, 1]);
assert.deepEqual(tileDe(0, -180, 3), [0, 4]);
perto(tileDe(85.0511287798, 0, 0)[1], 0, 1e-6, "topo do mundo");

for (const cfg of CONFIGS_COM_ENTORNO) {
  const local = cfg.local!;
  const d = JSON.parse(readFileSync(path.join(__dirname, "../../scripts/dados/entorno", `${local.chave}.json`), "utf8")) as DadosEntorno;
  assert.ok(d.norte, `${local.chave}: mapa sem norte`);
  const g = gradeDaFoto(d.lote, d.norte!, LADO);
  const [a, b, c, dd, e, f] = g.transformacao;
  const paraFoto = (u: number, v: number): [number, number] => [a * u + c * v + e, b * u + dd * v + f];
  // pixel do mosaico de um ponto (lat, lon), pela conta exata do Mercator
  const noMosaico = (lat: number, lon: number): [number, number] => { const [tx, ty] = tileDe(lat, lon, g.z); return [(tx - g.x0) * LADO_TILE, (ty - g.y0) * LADO_TILE]; };
  // (x, z) da maquete → (lat, lon), como o mapa desenhado faz (entorno-osm.ts)
  const L = Math.hypot(d.norte![0], d.norte![1]), fe = d.norte![0] / L, fn = d.norte![1] / L, xe = -fn, xn = fe;
  const kx = Math.cos((d.lote.lat * Math.PI) / 180) * 111320, ky = 110540;
  const latLon = (x: number, z: number): [number, number] => [d.lote.lat + (x * xn + z * fn) / ky, d.lote.lon + (x * xe + z * fe) / kx];
  const m = (2 * RAIO_FOTO) / LADO;

  // 2. O lote cai no meio da foto.
  const centro = paraFoto(...noMosaico(d.lote.lat, d.lote.lon));
  perto(centro[0], LADO / 2, 1e-6, `${local.chave}: centro i`);
  perto(centro[1], LADO / 2, 1e-6, `${local.chave}: centro j`);

  // 3. Qualquer ponto do mapa cai no pixel certo: x da maquete para a direita,
  // z para baixo (o alto da foto é o fundo do lote). Erro abaixo de 1 pixel
  // até a borda (a conta é linear; o Mercator, quase).
  for (const [x, z] of [[100, 0], [0, 100], [-300, 250], [600, -600], [-880, 0], [0, 880], [630, 630]]) {
    const [i, j] = paraFoto(...noMosaico(...latLon(x, z)));
    perto(i, (x + RAIO_FOTO) / m, 1, `${local.chave}: i de (${x}, ${z})`);
    perto(j, (z + RAIO_FOTO) / m, 1, `${local.chave}: j de (${x}, ${z})`);
  }

  // 4. Gira sem espelhar e sem esticar: escala igual à do zoom nos dois eixos (0,7 % de folga, o achatamento da Terra).
  assert.ok(a * dd - b * c > 0, `${local.chave}: a foto sairia espelhada`);
  const escala = (40075016.686 * Math.cos((d.lote.lat * Math.PI) / 180)) / (2 ** g.z * LADO_TILE) / m; // px da foto por px do tile
  perto(Math.hypot(a, b), escala, escala * 0.01, `${local.chave}: escala leste`);
  perto(Math.hypot(c, dd), escala, escala * 0.01, `${local.chave}: escala norte`);

  // 5. Os tiles cobrem o círculo inteiro e só ele: todo ponto do círculo tem o
  // seu tile na lista; os cantos do quadrado, fora do círculo, não entram.
  const tem = new Set(g.tiles.map(t => `${t.x},${t.y}`));
  for (let k = 0; k < 720; k++) for (const r of [RAIO_FOTO * 0.999, RAIO_FOTO * 0.6, 50]) {
    const ang = (k * Math.PI) / 360, [tx, ty] = tileDe(...latLon(r * Math.cos(ang), r * Math.sin(ang)), g.z);
    assert.ok(tem.has(`${Math.floor(tx)},${Math.floor(ty)}`), `${local.chave}: falta o tile de um ponto a ${r} m`);
  }
  assert.ok(g.tiles.length < g.colunas * g.linhas, `${local.chave}: os cantos deviam ficar de fora`);
  assert.ok(g.tiles.length >= 35 && g.tiles.length <= 64, `${local.chave}: ${g.tiles.length} tiles (esperado ~50: é o peso da foto)`);
  assert.ok(g.colunas * LADO_TILE <= 2560 && g.linhas * LADO_TILE <= 2560, `${local.chave}: mosaico grande demais`);
  assert.equal(new Set(g.tiles.map(t => `${t.x},${t.y}`)).size, g.tiles.length);

  // 6. O servidor aceita todos os tiles da foto deste prédio…
  for (const t of g.tiles) assert.ok(tileNaArea(g.z, t.x, t.y, local.bbox), `${local.chave}: tile ${t.x},${t.y} fora da região`);
  console.log(`${local.chave}: ${g.tiles.length} tiles (mosaico ${g.colunas} × ${g.linhas}), ${m.toFixed(2)} m por pixel`);
}

// 7. …e recusa o resto: outro zoom, outra cidade, número quebrado.
const bbox = CONFIGS_COM_ENTORNO[0].local!.bbox;
const [bx, by] = tileDe((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, ZOOM_FOTO).map(Math.floor);
assert.ok(tileNaArea(ZOOM_FOTO, bx, by, bbox));
assert.ok(!tileNaArea(ZOOM_FOTO + 1, bx * 2, by * 2, bbox), "outro zoom");
assert.ok(!tileNaArea(ZOOM_FOTO, ...(tileDe(-23.55, -46.63, ZOOM_FOTO).map(Math.floor) as [number, number]), bbox), "São Paulo");
assert.ok(!tileNaArea(ZOOM_FOTO, bx + 0.5, by, bbox), "número quebrado");
assert.ok(!tileNaArea(ZOOM_FOTO, NaN, by, bbox), "não é número");

// 8. Endereço na Esri: linha (y) antes da coluna (x), chave escapada.
assert.equal(urlDoTile(17, 75752, 47832, "a b&c"), `${SERVICO_ESRI}/tile/17/75752/47832?token=a%20b%26c`);

// 9. Erro da Esri em uma linha (ela responde JSON, às vezes com HTTP 200).
assert.equal(erroDaEsri(200, '{"error":{"code":499,"message":"Token Required.","details":[]}}'), "Esri 499: Token Required.");
assert.equal(erroDaEsri(403, "<html>negado</html>"), "Esri HTTP 403");

console.log("foto-aerea: ok");
