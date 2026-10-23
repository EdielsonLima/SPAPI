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
// base do Palácio: 21 m + lazer; a torre cabe dentro do contorno
assert.equal(alturaEmbasamento(1, CONFIG_PALACIO), 25.5);
const xs = CONFIG_PALACIO.base!.contorno.map(p => p[0]), zs = CONFIG_PALACIO.base!.contorno.map(p => p[1]);
assert.ok(Math.min(...xs) < -17 && Math.max(...xs) > 17 && Math.min(...zs) < -8.5 && Math.max(...zs) > 8.5 + 2.4);
// sem base própria: retângulo em volta da torre, altura pelos andares de baixo
assert.equal(baseDaTorre(6, CONFIG_PADRAO).altura, 15);
assert.equal(baseDaTorre(6, CONFIG_PADRAO).contorno.length, 4);
console.log("torre-3d: ok");
