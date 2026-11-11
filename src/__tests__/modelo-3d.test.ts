// Trava da maquete do projeto (SketchUp convertido): npx tsx src/__tests__/modelo-3d.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { ehGzip, lerModelo, posicoesDaFaixa, coresDaFaixa, unidadesPorChave, chaveDaUnidade, type Faixa } from "../lib/modelo-3d";
import { existsSync } from "node:fs";
import { andarNoModelo, andarEFinal, ordenarFinais, configDoEmpreendimento, plantaDaUnidade, obraDaConfig, obraDaChave, CONFIG_135, CONFIG_PADRAO, CONFIG_PALACIO, CONFIGS_COM_ENTORNO } from "../lib/torre-3d";
import { ANDAMENTO_INICIAL, ANDAMENTO_INICIAL_EM, etapasValidas } from "../lib/andamento-obra";
import { chaveDoEmpreendimento } from "../lib/condicoes-pagamento";

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

// ── Andamento da obra, fotos e planta (11/11/2026) ──
// A chave vem do mapa da cidade (`local`); sem mapa, viria de `obra`.
assert.deepEqual(obraDaConfig(CONFIG_135), { chave: "135-jardins", site: "https://silvapacker.com.br/empreendimentos/135-jardins/" });
assert.deepEqual(obraDaConfig({ ...CONFIG_PADRAO, obra: { chave: "x" } }), { chave: "x" });
// Mapa da cidade: lote na esquina da Rua 3420 com a Av. Brasil, fundos para a 3500.
assert.ok(CONFIGS_COM_ENTORNO.includes(CONFIG_135));
assert.equal(CONFIG_135.local!.rua, "3420"); assert.equal(CONFIG_135.local!.ruaFundos, "3500");
assert.deepEqual(CONFIG_135.local!.esquina, { rua: "Avenida Brasil", distancia: 30 });
assert.equal(obraDaConfig(CONFIG_PALACIO)!.chave, "palacio-elizabeth");
assert.equal(obraDaConfig(CONFIG_PADRAO), null);
assert.equal(obraDaChave("135-jardins")!.site, CONFIG_135.local!.site);
assert.equal(obraDaChave("palacio-elizabeth")!.chave, "palacio-elizabeth");
assert.equal(obraDaChave("outro"), null);
// A chave é a mesma que as condições de pagamento já usavam para "135 JARDINS" (nada se perde).
assert.equal(chaveDoEmpreendimento(undefined, "135 JARDINS"), "135-jardins");
// Partida do andamento = o site em 11/11/2026.
assert.deepEqual(ANDAMENTO_INICIAL["135-jardins"].map(e => e.pct), [100, 100, 100, 100, 96, 94, 65, 63, 0]);
assert.deepEqual(etapasValidas(ANDAMENTO_INICIAL["135-jardins"]), ANDAMENTO_INICIAL["135-jardins"]);
assert.equal(ANDAMENTO_INICIAL_EM["135-jardins"], "2026-11-11");
// Planta: o pavimento inteiro numa imagem só, sem espelhar; o título diz qual é o apartamento.
const p01 = plantaDaUnidade(CONFIG_135, "2801")!, p02 = plantaDaUnidade(CONFIG_135, "2802")!;
assert.equal(p01.url, "/modelos/135-jardins-planta-tipo.webp");
assert.ok(existsSync(path.join(__dirname, "../../public", p01.url)), "a imagem da planta está publicada");
assert.equal(p01.espelhada, false); assert.equal(p02.espelhada, false);
assert.match(p01.lado!, /esquerda/); assert.match(p02.lado!, /direita/);
// Fotos da galeria: manifesto da carga única confere com os arquivos.
const dirFotos = path.join(__dirname, "../../scripts/dados/fotos-135-jardins");
const manifesto = JSON.parse(readFileSync(path.join(dirFotos, "fotos.json"), "utf-8")) as { ajuste: string; chave: string; fotos: { arquivo: string; titulo: string }[] };
assert.equal(manifesto.chave, obraDaConfig(CONFIG_135)!.chave);
assert.equal(manifesto.fotos.length, 25);
manifesto.fotos.forEach(f => {
  const b = readFileSync(path.join(dirFotos, f.arquivo));
  assert.ok(b.length > 10_000 && b.length < 8 * 1024 * 1024, f.arquivo);
  assert.ok(b[0] === 0xff && b[1] === 0xd8, `${f.arquivo} é JPEG`);
  assert.ok(f.titulo.length > 2 && f.titulo.length <= 120);
});

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
// y = 0 é a calçada: só o terreno desenhado em volta desce um pouco abaixo.
assert.ok(cab.min[1] < -0.3 && cab.min[1] > -1, `fundo do terreno em ${cab.min[1]}`);
assert.ok(cab.terreno && cab.terreno[1] > 100, "o terreno vem em faixa própria");
{
  const t = posicoesDaFaixa(m, cab.terreno!);
  let maxY = -Infinity, larg = 0, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < t.length; i += 3) { maxY = Math.max(maxY, t[i + 1]); minX = Math.min(minX, t[i]); maxX = Math.max(maxX, t[i]); }
  larg = maxX - minX;
  assert.ok(maxY < 1 && larg > 100, `terreno baixo e largo (até ${maxY.toFixed(2)} m, ${larg.toFixed(0)} m)`);
  // A rua da frente do terreno do projeto fica onde o mapa da cidade encosta (zRua).
  assert.ok(CONFIG_135.modelo!.zRua > 9.5 && CONFIG_135.modelo!.zRua < 14.7);
}

// As faixas cobrem o arquivo inteiro, sem buraco nem sobreposição.
const faixas: Faixa[] = [cab.casca.opaco, cab.casca.vidro, cab.terreno!, ...cab.unidades.flatMap(u => [u.opaco, u.vidro])];
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
