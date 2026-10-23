// Trava da geometria da maquete: npx tsx src/__tests__/torre-3d.test.ts
import assert from "node:assert/strict";
import { andarEFinal, ordenarFinais, sacadaDaUnidade, blocoDaUnidade, cotaDoAndar, configDoEmpreendimento, CONFIG_PALACIO, CONFIG_PADRAO, janelasDaUnidade, alturaEmbasamento, baseDaTorre } from "../lib/torre-3d";

assert.deepEqual(andarEFinal("AP3001"), { andar: 30, final: "01" });
assert.deepEqual(andarEFinal("AP 302"), { andar: 3, final: "02" });
assert.deepEqual(andarEFinal("AP1201", "12º Pavimento"), { andar: 12, final: "01" });
assert.equal(andarEFinal("VG26"), null);
assert.equal(configDoEmpreendimento("PALÁCIO ELIZABETH - OBRA"), CONFIG_PALACIO);
assert.deepEqual(ordenarFinais(["02", "01"], CONFIG_PALACIO), ["01", "02"]);
// Palácio: 2 por andar, sacadas encostadas no meio da frente
const e = sacadaDaUnidade(0, 2, 10, 6, CONFIG_PALACIO), d = sacadaDaUnidade(1, 2, 10, 6, CONFIG_PALACIO);
assert.ok(e.x < 0 && d.x > 0 && Math.abs(e.x + d.x) < 1e-9);
assert.ok(e.z > CONFIG_PALACIO.profundidade / 2);
// corpo: metade esquerda e metade direita; cota sobe um pé-direito por andar
assert.ok(blocoDaUnidade(0, 2, 10, 6, CONFIG_PALACIO).x < 0);
assert.ok(Math.abs(cotaDoAndar(11, 6, CONFIG_PALACIO) - cotaDoAndar(10, 6, CONFIG_PALACIO) - CONFIG_PALACIO.peDireito) < 1e-9);
// Janelas da planta tipo: 4 na frente (2 suítes + 2 BWC), 1 na lateral, 5 nos fundos + porta da sacada
const je = janelasDaUnidade(0, 2, 10, 1, CONFIG_PALACIO), jd = janelasDaUnidade(1, 2, 10, 1, CONFIG_PALACIO);
const conta = (js: typeof je, f: string, porta = false) => js.filter(j => j.face === f && !!j.porta === porta).length;
assert.equal(conta(je, "frente"), 4); assert.equal(conta(je, "frente", true), 1);
assert.equal(conta(je, "esquerda"), 1); assert.equal(conta(je, "direita"), 0); assert.equal(conta(jd, "direita"), 1);
assert.equal(conta(je, "fundos"), 5);
// final 02 é o espelho do 01
je.forEach((j, i) => { assert.ok(Math.abs(j.x + jd[i].x) < 1e-9 && j.z === jd[i].z); });
// janela da frente fica fora da sacada e dentro da torre
je.filter(j => j.face === "frente" && !j.porta).forEach(j => { assert.ok(j.x < -CONFIG_PALACIO.larguraSacada && j.x > -CONFIG_PALACIO.largura / 2); });
// Palácio pelos cortes AA/BB: lazer a +16,00; AP101 (7º do projeto) a +21,04,
// AP301 (9º) a +27,52, AP3602 (42º) a +134,44
const c = (a: number) => Math.round(cotaDoAndar(a, 1, CONFIG_PALACIO) * 100) / 100;
assert.equal(c(1), 21.04); assert.equal(c(3), 27.52); assert.equal(c(36), 134.44);
assert.equal(Math.round(alturaEmbasamento(1, CONFIG_PALACIO) * 100) / 100, 21.04);
assert.equal(CONFIG_PALACIO.base!.altura, 16);
// contorno das garagens: 60,24 m de comprimento, 22,7 + 16 m de fundo; a torre
// e a sacada cabem dentro, núcleo também
const xs = CONFIG_PALACIO.base!.contorno.map(p => p[0]), zs = CONFIG_PALACIO.base!.contorno.map(p => p[1]);
assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 60.24) < 0.5);
assert.ok(Math.abs(Math.max(...zs) - Math.min(...zs) - 38.75) < 1);
assert.ok(Math.min(...xs) < -16.25 && Math.max(...xs) > 16.25);
assert.ok(Math.max(...zs) > 5 + CONFIG_PALACIO.sacada && Math.min(...zs) < -5 - 4.3);
// sem base própria: retângulo em volta da torre, altura pelos andares de baixo
assert.equal(baseDaTorre(6, CONFIG_PADRAO).altura, 15);
assert.equal(baseDaTorre(6, CONFIG_PADRAO).contorno.length, 4);
console.log("torre-3d: ok");
