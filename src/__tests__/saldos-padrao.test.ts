// Trava do "Resetar padrão" da aba Saldos (src/lib/saldos-padrao.ts).
// Rodar: npx tsx src/__tests__/saldos-padrao.test.ts
import assert from "node:assert/strict";
import { resetContasSaldos } from "../lib/saldos-padrao";

const padrao = ["1:A", "1:B", "2:C"];
const todas = [...padrao, "1:CASH", "3:COFRE"];

// 1. Seleção igual ao padrão e nada diferente salvo: nada a fazer.
{
  const r = resetContasSaldos({ selecionadas: padrao, todas, padrao, salvo: JSON.stringify(padrao) });
  assert.equal(r.igualAoPadrao, true);
  assert.equal(r.trocaPadraoSalvo, false);
  assert.deepEqual(r.entram, []);
  assert.deepEqual(r.saem, []);
}

// 2. Seleção vazia = todas as contas: sair do vazio tira as que não são da relação.
{
  const r = resetContasSaldos({ selecionadas: [], todas, padrao, salvo: "[]" });
  assert.equal(r.atuais, 5);
  assert.deepEqual(r.saem, ["1:CASH", "3:COFRE"]);
  assert.deepEqual(r.entram, []);
  assert.equal(r.igualAoPadrao, false);
  assert.equal(r.trocaPadraoSalvo, true);
}

// 3. Seleção pessoal (só uma conta, salva como padrão): entram as que faltam.
{
  const r = resetContasSaldos({ selecionadas: ["2:C"], todas, padrao, salvo: JSON.stringify(["2:C"]) });
  assert.equal(r.atuais, 1);
  assert.deepEqual(r.entram, ["1:A", "1:B"]);
  assert.deepEqual(r.saem, []);
  assert.equal(r.trocaPadraoSalvo, true);
}

// 4. Contas não carregadas (padrão vazio): não pode resetar.
{
  const r = resetContasSaldos({ selecionadas: ["1:A"], todas: [], padrao: [], salvo: null });
  assert.equal(r.semPadrao, true);
  assert.equal(r.igualAoPadrao, false);
}

// 5. Salvo ilegível conta como "nada salvo" (não quebra a tela).
{
  const r = resetContasSaldos({ selecionadas: padrao, todas, padrao, salvo: "{quebrado" });
  assert.equal(r.trocaPadraoSalvo, false);
  assert.equal(r.igualAoPadrao, true);
}

// 6. Mesma seleção do padrão, mas o padrão salvo é outro: ainda há o que resetar.
{
  const r = resetContasSaldos({ selecionadas: padrao, todas, padrao, salvo: JSON.stringify(["2:C"]) });
  assert.equal(r.igualAoPadrao, true);
  assert.equal(r.trocaPadraoSalvo, true);
}

// 7. Id salvo que não existe mais na lista do Sienge não entra na conta nem em "saem".
{
  const r = resetContasSaldos({ selecionadas: [...padrao, "9:VELHA"], todas, padrao, salvo: null });
  assert.equal(r.atuais, 3);
  assert.deepEqual(r.saem, []);
  assert.equal(r.igualAoPadrao, true);
}

console.log("saldos-padrao: ok");
