// Trava da geometria da maquete: npx tsx src/__tests__/torre-3d.test.ts
import assert from "node:assert/strict";
import { andarEFinal, ordenarFinais, sacadaDaUnidade, blocoDaUnidade, cotaDoAndar, configDoEmpreendimento, CONFIG_PALACIO } from "../lib/torre-3d";

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
console.log("torre-3d: ok");
