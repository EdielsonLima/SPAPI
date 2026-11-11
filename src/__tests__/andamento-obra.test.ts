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
// Anéis do 135 Jardins (jet-circle-progress, 11/11/2026): o número vem duas
// vezes antes do rótulo (data-value no círculo e data-to-value no contador).
const p135 = [100, 100, 100, 100, 96, 94, 65, 63, 0];
const aneis = `<h2 class="elementor-heading-title">ANDAMENTO DA OBRA</h2>` + ETAPAS_OBRA.map((e, i) =>
  `<div class="elementor-widget-jet-circle-progress" data-settings="{&quot;circle_size&quot;:{&quot;size&quot;:120}}"><svg><circle class="circle-progress__value" r="56.5" data-value="${p135[i]}" style="stroke-dasharray: 354.9;" /></svg>` +
  `<div class="circle-val"><span class="circle-counter__number" data-to-value="${p135[i]}" data-delimiter=",">0</span><span class="circle-counter__suffix">%</span></div>` +
  `<div class="circle-counter__content"> <div class="circle-counter__title">${e.toUpperCase()}</div> </div></div>`).join("");
assert.deepEqual(lerAndamentoDoHtml(aneis)!.map(e => e.pct), p135);
// Faltando etapa, sem a seção, ou tudo zero: não aceita.
assert.equal(lerAndamentoDoHtml(texto.replace("Reboco", "Outra")), null);
assert.equal(lerAndamentoDoHtml("<p>nada</p>"), null);
assert.equal(lerAndamentoDoHtml(texto.replace(/\d+%/g, "0%")), null);
// Gravação manual.
assert.deepEqual(etapasValidas(ANDAMENTO_INICIAL["palacio-elizabeth"]), ANDAMENTO_INICIAL["palacio-elizabeth"]);
assert.equal(etapasValidas([{ etapa: "Projeto", pct: 120 }]), null);
console.log("andamento-obra: ok");
