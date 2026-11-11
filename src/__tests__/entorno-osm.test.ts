// Trava do entorno da maquete: npx tsx src/__tests__/entorno-osm.test.ts
// Cidade sintética no formato do Balneário: orla reta inclinada, ruas
// numeradas saindo do mar, avenidas paralelas à orla. SAIDA=<arquivo> grava o
// entorno processado (usado na conferência por imagem).
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { consultaLocalizar, consultaEntorno, localizarLote, processarEntorno, marDaCosta, VERSAO_ENTORNO, type ElementoOSM, type LocalEntorno, type DadosEntorno } from "../lib/entorno-osm";
import { CONFIGS_COM_ENTORNO } from "../lib/torre-3d";

const lat0 = -26.995, lon0 = -48.633, kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110540;
const ang = (20 * Math.PI) / 180;                       // orla 20° a leste do norte
const c = [Math.sin(ang), Math.cos(ang)];               // ao longo da orla (para o norte)
const i = [-Math.cos(ang), Math.sin(ang)];              // para dentro (oeste)
const ll = (ac: number, ai: number) => { const e = c[0] * ac + i[0] * ai, n = c[1] * ac + i[1] * ai; return { lat: lat0 + n / ky, lon: lon0 + e / kx }; };
const via = (nome: string, hw: string, pts: [number, number][]): ElementoOSM => ({ type: "way", tags: { highway: hw, name: nome }, geometry: pts.map(([a, b]) => ll(a, b)) });

const els: ElementoOSM[] = [];
// Costa: terra à esquerda do sentido → anda para o NORTE com o mar a leste (direita).
els.push({ type: "way", tags: { natural: "coastline" }, geometry: [ll(-900, 0), ll(900, 0)] });
els.push({ type: "way", tags: { natural: "beach" }, geometry: [ll(900, 0), ll(900, 50), ll(-900, 50), ll(-900, 0)] });
els.push(via("Avenida Atlântica", "secondary", [[900, 60], [-900, 60]]));
els.push(via("Avenida Brasil", "secondary", [[900, 330], [-900, 330]]));
els.push(via("Terceira Avenida", "tertiary", [[900, 600], [-900, 600]]));
const ruas: [string, number][] = [["Rua 2900", 130], ["Rua 2930", 65], ["Rua 2950", 0], ["Rua 2970", -65], ["Rua 3000", -130], ["Rua 3050", -195]];
ruas.forEach(([n, ac]) => {
  els.push(via(n, "residential", [[ac, 60], [ac, 330]]));       // dois trechos, como no OSM
  els.push(via(n, "residential", [[ac, 330], [ac, 700]]));
});
// Prédios nas quadras (um deles DENTRO do lote: deve sumir).
let semente = 7; const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
for (let ac = -180; ac < 180; ac += 65) for (let ai = 80; ai < 680; ai += 34) {
  if (Math.abs(ai - 330) < 20 || Math.abs(ai - 600) < 20) continue;
  const a0 = ac + 8, a1 = ac + 57 - 8 - rnd() * 10, b0 = ai, b1 = ai + 24;
  els.push({ type: "way", tags: { building: rnd() < 0.6 ? "apartments" : "yes", ...(rnd() < 0.5 ? { "building:levels": String(4 + Math.floor(rnd() * 30)) } : {}) },
    geometry: [ll(a0, b0), ll(a1, b0), ll(a1, b1), ll(a0, b1), ll(a0, b0)] });
}
els.push({ type: "way", tags: { leisure: "park" }, geometry: [ll(-125, 400), ll(-75, 400), ll(-75, 460), ll(-125, 460)] });

const local: LocalEntorno = { chave: "t", rua: "2950", numero: 255, ruaFundos: "2970", bbox: [0, 0, 0, 0] };
const lote = localizarLote(els, local)!;
assert.ok(lote, "achou a rua");
// Número 255 = 255 m da ponta da orla (a rua começa na Atlântica, a 60 m da costa).
const alvo = ll(0, 60 + 255);
const dist = Math.hypot((lote.lon - alvo.lon) * kx, (lote.lat - alvo.lat) * ky);
assert.ok(dist < 1, `lote na altura do nº 255 (erro ${dist.toFixed(2)} m)`);
// Frente aponta do lote (lado da 2970, sul) para a 2950: +c (norte).
assert.ok(lote.frente[0] * c[0] + lote.frente[1] * c[1] > 0.99, "frente para a Rua 2950");

const d = processarEntorno(els, lote, local);
// Rua 2950 no eixo z = 0, correndo em x; a 2970 atrás (z ≈ -65).
const r2950 = d.ruas.filter(r => r.n === "Rua 2950").flatMap(r => r.p);
assert.ok(r2950.every(p => Math.abs(p[1]) < 0.2), "Rua 2950 em z = 0");
const r2970 = d.ruas.filter(r => r.n === "Rua 2970").flatMap(r => r.p);
assert.ok(r2970.every(p => Math.abs(p[1] + 65) < 0.2), "Rua 2970 atrás do lote");
// Olhando o prédio da rua, o mar fica à esquerda (x < 0) e a orla a ~315 m.
const atl = d.ruas.find(r => r.n === "Avenida Atlântica")!.p;
assert.ok(atl.every(p => Math.abs(p[0] + 255) < 0.3), "Atlântica a 255 m, à esquerda");
assert.ok(d.mar.length > 0 && d.mar.every(q => q.reduce((s, p) => s + p[0], 0) / q.length < -300), "mar do lado da orla");
// Nada de prédio dentro do lote; os demais ficam.
assert.ok(d.predios.length > 50);
assert.ok(!d.predios.some(b => { const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length, cz = b.p.reduce((s, p) => s + p[1], 0) / b.p.length; return Math.abs(cx) < 30 && cz < -10 && cz > -50; }));
assert.equal(d.verde.length, 1); assert.equal(d.areia.length, 1);

// Grafias do OSM: "Rua 2.950" e "Rua 2950 - Centro" também acham o lote; "Rua 29500" não.
const so = (nome: string) => localizarLote([els[0], via(nome, "residential", [[0, 60], [0, 900]])], local);
assert.ok(so("Rua 2.950"), "Rua 2.950"); assert.ok(so("Rua 2950 - Centro"), "Rua 2950 - Centro");
assert.equal(so("Rua 29500"), null, "Rua 29500 não é a 2950");
// O Overpass não aceita "\\." dentro de string: o ponto vai como [.].
assert.ok(!consultaLocalizar(local).includes("\\"), "consulta sem barra invertida");

// ── Lote ancorado numa esquina (135 Jardins, 11/11/2026) ──
// Rua que sai da orla, quebra no meio e cruza a Av. Brasil: a régua "número em
// linha reta desde a ponta" cai fora da rua; a âncora na esquina não.
const torta: ElementoOSM[] = [
  via("Rua 3420", "residential", [[-400, 60], [-400, 150], [-430, 240], [-430, 330]]),   // da orla até a Av. Brasil
  via("Rua 3420", "residential", [[-430, 330], [-430, 700]]),                              // segue para o interior
  via("Rua 3500", "residential", [[-480, 60], [-480, 700]]),                               // fundos do lote
];
const els2 = [...els, ...torta];
const naEsquina: LocalEntorno = { chave: "e", rua: "3420", numero: 135, ruaFundos: "3500", esquina: { rua: "Avenida Brasil", distancia: 30 }, bbox: [0, 0, 0, 0] };
const l2 = localizarLote(els2, naEsquina)!;
assert.ok(l2, "achou a esquina");
// 30 m do cruzamento, andando pela 3420 para o lado do mar.
const alvo2 = ll(-430, 300);
const erro2 = Math.hypot((l2.lon - alvo2.lon) * kx, (l2.lat - alvo2.lat) * ky);
assert.ok(erro2 < 1, `origem a 30 m da esquina (erro ${erro2.toFixed(2)} m)`);
// O lote fica do lado da 3500 (sul): a frente aponta dele para a 3420, isto é, +c (norte).
assert.ok(l2.frente[0] * c[0] + l2.frente[1] * c[1] > 0.99, "frente para a Rua 3420");
// Distância maior que o trecho: acompanha a curva da rua (não segue reto).
const l3 = localizarLote(els2, { ...naEsquina, esquina: { rua: "Avenida Brasil", distancia: 90 + Math.hypot(30, 90) + 40 } })!;
const alvo3 = ll(-400, 110);
assert.ok(Math.hypot((l3.lon - alvo3.lon) * kx, (l3.lat - alvo3.lat) * ky) < 1, "anda pela rua, dobrando com ela");
// Sem a esquina, a régua em linha reta erra por dezenas de metros.
const reta = localizarLote(els2, { ...naEsquina, esquina: undefined, numero: 240 })!;
assert.ok(Math.hypot((reta.lon - alvo2.lon) * kx, (reta.lat - alvo2.lat) * ky) > 10, "a régua reta não serve para rua torta");
// Esquina que não existe: não inventa lote.
assert.equal(localizarLote(els2, { ...naEsquina, esquina: { rua: "Avenida Inexistente", distancia: 30 } }), null);
// A consulta pede também a rua da esquina, sem barra invertida.
assert.ok(consultaLocalizar(naEsquina).includes("Avenida Brasil") && !consultaLocalizar(naEsquina).includes("\\"));
// Caixa do lote sob medida: prédio do mapa fora da caixa padrão (34 m para cada lado) também sai.
const d2 = processarEntorno(els, lote, { ...local, lote: { x0: -30, x1: 90, fundo: 50 } });
const dentro = (b: { p: number[][] }, x1: number) => { const cx = b.p.reduce((t, q) => t + q[0], 0) / b.p.length, cz = b.p.reduce((t, q) => t + q[1], 0) / b.p.length; return cx > 34 && cx < x1 && cz < -4 && cz > -50; };
assert.ok(d.predios.some(b => dentro(b, 90)), "com a caixa padrão, o vizinho da direita fica");
assert.ok(!d2.predios.some(b => dentro(b, 90)) && d2.predios.length < d.predios.length, "com a caixa maior, sai");

// ── Mar pela água alcançável (versão 3, 11/11/2026) ──
// Até a versão 2 o mar era uma faixa de 3 km à direita de cada trecho da costa:
// com ilha, ponta e foz de rio as faixas passavam por cima da cidade.
const dentroDe = (x: number, z: number, pol: number[][]) => {
  let d = false;
  for (let a = 0, b = pol.length - 1; a < pol.length; b = a++) {
    const [xa, za] = pol[a], [xb, zb] = pol[b];
    if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) d = !d;
  }
  return d;
};
const noMar = (mar: number[][][], x: number, z: number) => mar.some(pol => dentroDe(x, z, pol));
// Cidade sintética: o mar fica além da orla (x < -315) e a terra fica seca.
assert.ok(noMar(d.mar, -600, 0) && noMar(d.mar, -1500, 900) && noMar(d.mar, -330, -400), "mar depois da orla");
assert.ok(!noMar(d.mar, 0, 0) && !noMar(d.mar, -200, 50) && !noMar(d.mar, 300, -300) && !noMar(d.mar, -280, 700), "terra seca");
// Costa com ilha e com um rio entrando na terra (referencial local: a água fica à direita do sentido, (-dz, dx)).
const costaComRio = [[0, 1500], [0, 30], [-600, 30], [-600, -30], [0, -30], [0, -1500]];   // água em x > 0 e no canal de 60 m
const ilha = [[350, -50], [350, 50], [450, 50], [450, -50], [350, -50]];                     // terra dentro
const mar2 = marDaCosta([costaComRio, ilha], 2000);
assert.ok(noMar(mar2, 200, 0) && noMar(mar2, 900, 400) && noMar(mar2, 600, -700), "mar aberto");
assert.ok(noMar(mar2, -300, 0), "o rio enche pelas duas margens");
assert.ok(!noMar(mar2, 400, 0), "a ilha não alaga");
assert.ok(!noMar(mar2, -300, 200) && !noMar(mar2, -300, -200) && !noMar(mar2, -900, 0) && !noMar(mar2, -100, 800), "a terra em volta do rio não alaga");
// Canal mais estreito que a grade (16 m): a faixa junto à costa cobre.
const canal = marDaCosta([[[0, 1500], [0, 8], [-400, 8], [-400, -8], [0, -8], [0, -1500]]], 2000);
assert.ok(noMar(canal, -200, 0) && !noMar(canal, -200, 60), "canal estreito");
// Costa aberta que acaba no meio do mapa: prolonga reta, sem dar a volta pela ponta.
const curta = marDaCosta([[[0, 600], [0, -600]]], 2000);
assert.ok(noMar(curta, 500, 0) && noMar(curta, 500, 1500) && !noMar(curta, -500, 0) && !noMar(curta, -500, 1500), "costa curta não vaza");
// Trechos que continuam um no outro são um só (como as ways do OSM).
const emDois = marDaCosta([[[0, 1500], [0, 0]], [[0, 0], [0, -1500]]], 2000);
assert.ok(noMar(emDois, 400, 0) && !noMar(emDois, -400, 0), "costa em dois trechos");
// Trava: costa contraditória (uma linha diz que a terra da outra é água) não alaga nada além da faixa da beira.
const errada = marDaCosta([[[0, 1500], [0, -1500]], [[-800, 1500], [-800, -1500]]], 2000);
assert.ok(!noMar(errada, -400, 0) && !noMar(errada, -400, 900), "vazou: fica só a faixa junto à costa");
assert.ok(noMar(errada, 20, 0), "a faixa da beira continua");
// A consulta traz praia e rio também como relação (multipolígono), com a geometria dos trechos.
assert.ok(/relation\["natural"~"beach\|sand\|water"\]/.test(consultaEntorno(-27, -48.6, 900)) && consultaEntorno(-27, -48.6, 900).trim().endsWith("out geom;"));
// Praia como relação de dois trechos: vira UMA chapa de areia.
const praia: ElementoOSM = { type: "relation", tags: { natural: "beach" }, members: [
  { role: "outer", geometry: [ll(900, 0), ll(900, 50), ll(-900, 50)] },
  { role: "outer", geometry: [ll(-900, 50), ll(-900, 0), ll(900, 0)] },
] };
const d3 = processarEntorno([...els.filter(e => e.tags?.natural !== "beach"), praia], lote, local);
assert.equal(d3.areia.length, 1); assert.ok(d3.areia[0].length >= 5, "anel fechado pelos dois trechos");

// ── Mapas prontos (scripts/dados/entorno): o que o migrate carrega no banco ──
const dirMapas = path.join(__dirname, "../../scripts/dados/entorno");
const chaves = CONFIGS_COM_ENTORNO.map(c => c.local!.chave);
for (const arq of readdirSync(dirMapas)) {
  const chave = arq.replace(/\.json$/, "");
  assert.ok(chaves.includes(chave), `${arq}: chave de um empreendimento com mapa`);
  const m = JSON.parse(readFileSync(path.join(dirMapas, arq), "utf-8")) as DadosEntorno;
  assert.ok((m.versao ?? 1) <= VERSAO_ENTORNO && (m.versao ?? 1) >= 3, `${arq}: versão ${m.versao}`);
  assert.ok(m.ruas.length > 300 && m.predios.length > 1000 && m.mar.length > 50 && m.areia.length >= 1 && m.norte, `${arq}: completo`);
  // O lote e a cidade em volta ficam secos; a baía, a 1 km para o lado do mar, é mar.
  assert.ok(!noMar(m.mar, 0, 0) && !noMar(m.mar, 0, -30) && !noMar(m.mar, 60, 20), `${arq}: lote seco`);
  const secos = m.predios.filter(b => !noMar(m.mar, b.p[0][0], b.p[0][1])).length;
  assert.ok(secos / m.predios.length > 0.985, `${arq}: ${m.predios.length - secos} prédio(s) dentro d'água`);
  assert.ok(m.mar.some(pol => pol.length === 4 && Math.abs(pol[0][0] - pol[1][0]) > 500), `${arq}: mar aberto em chapas largas`);
}
// 135 Jardins: esquina da Rua 3420 com a Av. Brasil, a frente para oeste (o norte fica à esquerda de quem olha o prédio).
const m135 = JSON.parse(readFileSync(path.join(dirMapas, "135-jardins.json"), "utf-8")) as DadosEntorno;
assert.ok(Math.abs(m135.lote.lat + 27.00078) < 2e-4 && Math.abs(m135.lote.lon + 48.623737) < 2e-4, "lote do 135 Jardins");
assert.ok(m135.norte![0] < -0.95, "norte à esquerda: a frente olha para oeste");
// Os nós da 3420 dos dois lados do prédio (o cruzamento, a +30 m, e o seguinte para o lado do mar) ficam no eixo z = 0.
const r3420 = m135.ruas.filter(r => r.n === "Rua 3420").flatMap(r => r.p).filter(q => q[0] > -75 && q[0] < 35);
assert.ok(r3420.some(q => q[0] < -40) && r3420.some(q => q[0] > 25) && r3420.every(q => Math.abs(q[1]) < 2), "Rua 3420 passa em z = 0 na frente do prédio");
const brasil = m135.ruas.filter(r => r.n === "Avenida Brasil").flatMap(r => r.p);
assert.ok(brasil.some(q => Math.hypot(q[0] - 30, q[1]) < 4), "Av. Brasil cruza a 3420 a 30 m, à direita");
assert.ok(!m135.predios.some(b => { const cx = b.p.reduce((t, q) => t + q[0], 0) / b.p.length, cz = b.p.reduce((t, q) => t + q[1], 0) / b.p.length; return cx > -27 && cx < 42 && cz < -4 && cz > -38; }), "nenhum prédio do mapa no lugar do nosso");

if (process.env.SAIDA) writeFileSync(process.env.SAIDA, JSON.stringify(d));
console.log("entorno-osm: ok", { ruas: d.ruas.length, predios: d.predios.length, kb: Math.round(JSON.stringify(d).length / 1024) });
