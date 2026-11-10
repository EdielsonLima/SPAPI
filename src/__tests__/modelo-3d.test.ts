// Trava da maquete do projeto (SketchUp convertido): npx tsx src/__tests__/modelo-3d.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { ehGzip, lerModelo, posicoesDaFaixa, coresDaFaixa, unidadesPorChave, chaveDaUnidade, type Faixa } from "../lib/modelo-3d";
import { andarNoModelo, andarEFinal, ordenarFinais, configDoEmpreendimento, CONFIG_135, CONFIG_PADRAO } from "../lib/torre-3d";

// ── De qual empreendimento é a maquete e onde cada unidade cai nela ──
assert.equal(configDoEmpreendimento("135 JARDINS"), CONFIG_135);
assert.equal(configDoEmpreendimento("135 JARDINS - COMERCIAL"), CONFIG_135);
assert.equal(configDoEmpreendimento("135 JARDINS -  PERMUTA"), CONFIG_PADRAO);
assert.equal(configDoEmpreendimento("SERENITY"), CONFIG_PADRAO);
// O andar na maquete vem do número, não do pavimento do cadastro (101 = 10º no Sienge).
assert.equal(andarNoModelo("101"), 0);
assert.equal(andarNoModelo("2802"), 27);
assert.equal(andarNoModelo("3102"), 30);
assert.equal(andarNoModelo("AP 1201"), 11);
assert.equal(andarNoModelo("PER-AREQUIPA.102"), null); // permuta: apartamento de outro prédio
assert.equal(andarNoModelo("G 108"), null);
assert.deepEqual(andarEFinal("2802", "37º"), { andar: 37, final: "02" });
// Final 01 à esquerda (lado 0), 02 à direita (lado 1), olhando a frente.
assert.deepEqual(ordenarFinais(["02", "01"], CONFIG_135), ["01", "02"]);

// ── O arquivo publicado ──
const arq = readFileSync(path.join(__dirname, "../../public", CONFIG_135.modelo!.url));
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
assert.ok(ehGzip(ab(arq)), "o .m3d é gzip por dentro");
assert.ok(arq.length < 2_500_000, `maquete pesada demais para a web: ${arq.length} bytes`);
const m = lerModelo(ab(gunzipSync(arq)));
const { cab } = m;
assert.equal(cab.versao, 1);
assert.equal(m.posicoes.length, cab.triangulos * 9);
assert.equal(m.cores.length, cab.triangulos * 3);
assert.ok(cab.triangulos > 100_000 && cab.triangulos < 400_000, `triângulos: ${cab.triangulos}`);

// 31 pavimentos × 2 lados = os 62 apartamentos do Sienge (101 a 3102).
assert.equal(cab.andares.length, 31);
assert.equal(cab.unidades.length, 62);
const fatias = unidadesPorChave(m);
for (let andar = 0; andar < 31; andar++) for (const lado of [0, 1]) assert.ok(fatias.has(chaveDaUnidade(andar, lado)), `falta ${andar}:${lado}`);
// Pavimentos de 3,24 m piso a piso (o último é o diferenciado, mais alto).
for (let i = 1; i < 31; i++) assert.ok(Math.abs(cab.andares[i].piso - cab.andares[i - 1].piso - 3.24) < 0.02, `piso do ${i}`);
// Altura do prédio = a que a câmera usa antes de o arquivo chegar.
assert.ok(Math.abs(cab.max[1] - CONFIG_135.modelo!.altura) < 0.5, `altura ${cab.max[1]}`);
assert.ok(Math.abs(cab.min[1]) < 0.01, "a rua fica em y = 0");

// As faixas cobrem o arquivo inteiro, sem buraco nem sobreposição.
const faixas: Faixa[] = [cab.casca.opaco, cab.casca.vidro, ...cab.unidades.flatMap(u => [u.opaco, u.vidro])];
let cursor = 0;
faixas.forEach(([ini, qtd]) => { assert.equal(ini, cursor); cursor += qtd; });
assert.equal(cursor, cab.triangulos);

// Cada apartamento fica do seu lado do eixo da torre, tem corpo e vidro, e a
// caixa dele é a dos próprios triângulos.
cab.unidades.forEach(u => {
  assert.ok(u.opaco[1] > 500 && u.vidro[1] > 50, `unidade ${u.andar}:${u.lado} vazia`);
  const [x0, y0, z0, x1, y1, z1] = u.caixa;
  if (u.lado === 0) assert.ok(x1 <= 0.01 && x0 < -10, `lado esquerdo ${u.andar}`); else assert.ok(x0 >= -0.01 && x1 > 10, `lado direito ${u.andar}`);
  assert.ok(y0 >= cab.andares[u.andar].piso - 0.01 && y1 <= cab.andares[u.andar].topo + 0.01);
  assert.ok(z1 - z0 > 10 && z1 > 5, "a frente (sacadas) fica em +z");
  const p = posicoesDaFaixa(m, u.opaco);
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); }
  assert.ok(minX >= x0 - 0.02 && maxX <= x1 + 0.02);
});
// Os dois lados de um andar são espelhados: mesmo tamanho.
const e = fatias.get("10:0")!, d = fatias.get("10:1")!;
assert.ok(Math.abs((e.caixa[3] - e.caixa[0]) - (d.caixa[3] - d.caixa[0])) < 0.3);

// Cores por vértice: a do triângulo repetida 3 vezes, em linear (0–1).
const c = coresDaFaixa(m, [0, 2]);
assert.equal(c.length, 18);
assert.deepEqual(Array.from(c.slice(0, 3)), Array.from(c.slice(3, 6)));
c.forEach(v => assert.ok(v >= 0 && v <= 1));

// Arquivo estragado não passa calado.
assert.throws(() => lerModelo(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer));
assert.throws(() => lerModelo(ab(gunzipSync(arq).subarray(0, 5000))));
console.log(`modelo-3d: ok (${cab.triangulos} triângulos, ${arq.length} bytes)`);
