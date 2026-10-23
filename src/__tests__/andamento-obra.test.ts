// Trava da leitura do andamento da obra: npx tsx src/__tests__/andamento-obra.test.ts
import assert from "node:assert/strict";
import { lerAndamentoDoHtml, etapasValidas, ETAPAS_OBRA, ANDAMENTO_INICIAL } from "../lib/andamento-obra";

const pcts = [100, 100, 55, 15, 2, 2, 0, 0, 0];
// Contador do Elementor: número no atributo, texto ainda 0% antes da animação.
const elementor = `<h2>ANDAMENTO DA OBRA</h2>` + ETAPAS_OBRA.map((e, i) =>
  `<div class="elementor-counter"><span class="elementor-counter-number" data-to-value="${pcts[i]}" data-duration="2000">0</span><span>%</span></div><div class="elementor-counter-title">${e.toUpperCase()}</div>`).join("");
assert.deepEqual(lerAndamentoDoHtml(elementor)!.map(e => e.pct), pcts);
// Texto já renderizado.
const texto = `<p>Andamento da Obra</p>` + ETAPAS_OBRA.map((e, i) => `<div><span>${pcts[i]}%</span><p>${e}</p></div>`).join("");
assert.deepEqual(lerAndamentoDoHtml(texto)!.map(e => e.pct), pcts);
// Faltando etapa, sem a seção, ou tudo zero: não aceita.
assert.equal(lerAndamentoDoHtml(texto.replace("Reboco", "Outra")), null);
assert.equal(lerAndamentoDoHtml("<p>nada</p>"), null);
assert.equal(lerAndamentoDoHtml(texto.replace(/\d+%/g, "0%")), null);
// Gravação manual.
assert.deepEqual(etapasValidas(ANDAMENTO_INICIAL["palacio-elizabeth"]), ANDAMENTO_INICIAL["palacio-elizabeth"]);
assert.equal(etapasValidas([{ etapa: "Projeto", pct: 120 }]), null);
console.log("andamento-obra: ok");
