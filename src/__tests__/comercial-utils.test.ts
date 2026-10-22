/**
 * Comercial — valor da unidade no contrato (criado em 2026-10-22)
 *
 * Trava a regra que reparte o valor do contrato entre as unidades dele.
 * Antes cada unidade recebia o contrato inteiro e o "VGV vendido" do Quadro
 * Espelho somava o mesmo contrato N vezes (apto + vaga contava duas vezes).
 *
 * Run: npx tsx src/__tests__/comercial-utils.test.ts
 */

import { valorDaUnidadeNoContrato } from "../lib/comercial-utils";

let passed = 0;
let failed = 0;

function assertEqual(actual: number, expected: number, name: string) {
  if (Math.abs(actual - expected) < 0.005) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: esperado ${expected}, veio ${actual}`);
  }
}

console.log("valorDaUnidadeNoContrato");

const aptoEVaga = [
  { name: "AP1201", participationPercentage: 85 },
  { name: "VG12", participationPercentage: 15 },
];
assertEqual(valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "AP1201"), 850_000, "apto leva a parte dele");
assertEqual(valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "VG12"), 150_000, "vaga leva a parte dela");
assertEqual(
  valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "AP1201") + valorDaUnidadeNoContrato(1_000_000, aptoEVaga, "VG12"),
  1_000_000,
  "as partes somam o contrato (não duplica)",
);
assertEqual(valorDaUnidadeNoContrato(500_000, [{ name: "AP301", participationPercentage: 0 }], "AP301"), 500_000, "unidade única leva o contrato inteiro");
const semParticipacao = [
  { name: "AP1", participationPercentage: 0 },
  { name: "AP2", participationPercentage: 0 },
  { name: "VG1", participationPercentage: 0 },
];
assertEqual(valorDaUnidadeNoContrato(900_000, semParticipacao, "AP2"), 300_000, "participação que não fecha 100% divide igual");
assertEqual(valorDaUnidadeNoContrato(900_000, aptoEVaga, "AP999"), 0, "unidade fora do contrato = 0");
assertEqual(valorDaUnidadeNoContrato(0, aptoEVaga, "AP1201"), 0, "contrato sem valor = 0");

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
