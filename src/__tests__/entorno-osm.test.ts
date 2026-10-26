// Trava do entorno da maquete: npx tsx src/__tests__/entorno-osm.test.ts
// Cidade sintética no formato do Balneário: orla reta inclinada, ruas
// numeradas saindo do mar, avenidas paralelas à orla. SAIDA=<arquivo> grava o
// entorno processado (usado na conferência por imagem).
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { consultaLocalizar, localizarLote, processarEntorno, type ElementoOSM, type LocalEntorno } from "../lib/entorno-osm";

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
// Margem de rio marcada como coastline (entra 600 m na cidade, no meio da
// orla) não pode virar mar sobre as quadras: o polígono do mar fica todo do
// lado da orla (x < -300) e não tem nenhum vértice em terra.
{
  const rio: ElementoOSM = { type: "way", tags: { natural: "coastline" }, geometry: [ll(300, 0), ll(300, 600), ll(350, 600), ll(350, 0)] };
  const d2 = processarEntorno([...els, rio], lote, local);
  assert.equal(d2.mar.length, 1, "um polígono de mar só");
  assert.ok(d2.mar[0].every(p => p[0] < -300), "mar não entra na cidade pela margem do rio");
}
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

if (process.env.SAIDA) writeFileSync(process.env.SAIDA, JSON.stringify(d));
console.log("entorno-osm: ok", { ruas: d.ruas.length, predios: d.predios.length, kb: Math.round(JSON.stringify(d).length / 1024) });
