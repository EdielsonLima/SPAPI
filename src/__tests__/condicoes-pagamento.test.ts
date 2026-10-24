// Trava das condições de pagamento e do fluxo (Quadro Espelho 3D › Condições).
import assert from "node:assert/strict";
import { CONDICOES_PADRAO, validarCondicoes, normalizarCondicoes, saldoPct, fluxoDePagamento, mesCurto, resumoDoFluxo, chaveDoEmpreendimento } from "../lib/condicoes-pagamento";

const hoje = new Date(Date.UTC(2026, 9, 24)); // 24/10/2026
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// Padrão fecha em 100%: 10 + 20 + 10 + 10 = 50 → saldo 50.
assert.equal(validarCondicoes(CONDICOES_PADRAO), null);
assert.equal(saldoPct(CONDICOES_PADRAO), 50);

// Validação.
assert.match(validarCondicoes({ ...CONDICOES_PADRAO, sinalPct: 70 })!, /passam de 100/);
assert.match(validarCondicoes({ ...CONDICOES_PADRAO, mensaisQtd: 0 })!, /quantidade/);
assert.match(validarCondicoes({ ...CONDICOES_PADRAO, entrega: "12/2029" })!, /AAAA-MM/);
assert.match(validarCondicoes({ ...CONDICOES_PADRAO, sinalPct: 30, mensaisPct: 30, baloesPct: 20, chavesPct: 20, saldoQtd: 0 }) ?? "", /^$/); // 100% sem saldo: ok
assert.match(validarCondicoes({ ...CONDICOES_PADRAO, saldoQtd: 0 })!, /saldo após as chaves/);
assert.equal(normalizarCondicoes({ sinalPct: 12.345 }).sinalPct, 12.35);
assert.equal(normalizarCondicoes({}).mensaisQtd, 24);

// Fluxo de um apto de R$ 2.000.000 com entrega em dez/2029 (38 meses).
const c = { ...CONDICOES_PADRAO, entrega: "2029-12" };
const f = fluxoDePagamento(2_000_000, c, hoje);
assert.equal(f.entregaEstimada, false);
assert.equal(f.entrega, "2029-12");
const por = Object.fromEntries(f.etapas.map(e => [e.etapa, e]));
assert.equal(por.sinal.total, 200_000);
assert.equal(por.sinal.inicio, "2026-10");
assert.equal(por.mensais.parcelas, 24);
assert.equal(por.mensais.valorParcela, arredTest(400_000 / 24));
assert.equal(por.mensais.inicio, "2026-11");
assert.equal(por.mensais.fim, "2028-10");
assert.equal(por.baloes.parcelas, 2);
assert.equal(por.baloes.valorParcela, 100_000);
assert.equal(por.baloes.inicio, "2027-10");
assert.equal(por.baloes.fim, "2028-10");
assert.equal(por.chaves.total, 200_000);
assert.equal(por.chaves.inicio, "2029-12");
assert.equal(por.saldo.total, 1_000_000);
assert.equal(por.saldo.parcelas, 60);
assert.equal(por.saldo.inicio, "2030-01");
assert.equal(por.saldo.fim, "2034-12");
assert.equal(f.ateChaves, 1_000_000);
assert.equal(f.aposChaves, 1_000_000);
// Soma das etapas = preço (sem perder centavos no total).
assert.equal(f.etapas.reduce((s, e) => s + e.total, 0), 2_000_000);

// Entrega perto (6 meses): mensais e balões seguem depois das chaves; só o que
// cai até as chaves conta em "até as chaves".
const perto = fluxoDePagamento(1_000_000, { ...c, entrega: "2027-04" }, hoje); // 6 meses
assert.equal(perto.etapas.find(e => e.etapa === "mensais")!.parcelas, 24);
assert.equal(perto.etapas.find(e => e.etapa === "mensais")!.rotulo, "Mensais");
assert.equal(perto.ateChaves, arredTest(100_000 + 6 * arredTest(200_000 / 24) + 100_000)); // sinal + 6 mensais + chaves (balões só em 12 meses)
assert.equal(perto.aposChaves, arredTest(1_000_000 - perto.ateChaves));

// Palácio Elizabeth (tabela comercial out/2026): 10% de entrada e saldo em 100×.
const palacio = fluxoDePagamento(4_500_000, { ...CONDICOES_PADRAO, sinalPct: 10, mensaisPct: 90, mensaisQtd: 100, baloesPct: 0, baloesQtd: 0, chavesPct: 0, saldoQtd: 0, entrega: "2030-12" }, hoje);
assert.deepEqual(palacio.etapas.map(e => e.etapa), ["sinal", "mensais"]);
assert.equal(palacio.etapas[0].total, 450_000);
assert.equal(palacio.etapas[1].parcelas, 100);
assert.equal(palacio.etapas[1].valorParcela, 40_500);
assert.equal(palacio.etapas[1].fim, "2035-02");
assert.equal(palacio.ateChaves, 450_000 + 50 * 40_500); // 50 mensais até dez/2030
assert.equal(palacio.aposChaves, 50 * 40_500);

// Sem entrega cadastrada: estima pelo fim das mensais/balões (mín. 12 meses).
const est = fluxoDePagamento(1_000_000, { ...CONDICOES_PADRAO, entrega: "" }, hoje);
assert.equal(est.entregaEstimada, true);
assert.equal(est.entrega, "2028-10"); // 24 meses

// Sem saldo após as chaves: não cria a etapa.
const semSaldo = fluxoDePagamento(1_000_000, { ...c, sinalPct: 40, mensaisPct: 30, baloesPct: 10, chavesPct: 20, saldoQtd: 0 }, hoje);
assert.equal(semSaldo.etapas.some(e => e.etapa === "saldo"), false);
assert.equal(semSaldo.aposChaves, 0);

// Texto.
assert.equal(mesCurto("2029-12"), "dez/2029");
const txt = resumoDoFluxo("AP602", "Palácio Elizabeth", 163, f, c, brl);
assert.match(txt, /apartamento AP602/);
assert.match(txt, /Mensais até as chaves: 24×/);
assert.match(txt, /Até as chaves \(dez\/2029\)/);

// Chave do empreendimento.
assert.equal(chaveDoEmpreendimento("palacio-elizabeth", "PALÁCIO ELIZABETH"), "palacio-elizabeth");
assert.equal(chaveDoEmpreendimento(undefined, "SOLAR DI CAPRI"), "solar-di-capri");
assert.equal(chaveDoEmpreendimento(undefined, "Edifício 135 Jardins"), "edificio-135-jardins");

function arredTest(v: number) { return Math.round(v * 100) / 100; }
console.log("condicoes-pagamento: ok");
