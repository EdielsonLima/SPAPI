// Trava das regras da Tabela de Preços (reajustes, leitura de números BR,
// permissão). Rodar: npx tsx src/__tests__/tabela-precos.test.ts (ou npm test).
import {
  aplicarReajuste, fatorReajuste, validarReajuste, descreverReajuste, precoPorM2,
  semVenda, lerValorBR, lerDecimalBR, podeEditarPrecos, emailsEditoresPrecos,
  mascararValorBR, completarCentavosBR,
} from "../lib/tabela-precos";

let falhas = 0;
function check(nome: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FALHOU"}  ${nome}${ok ? "" : `\n        esperado ${JSON.stringify(esperado)}\n        recebido ${JSON.stringify(real)}`}`);
}

// Reajustes
check("percentual +3%", aplicarReajuste(319370.08, { tipo: "percentual", percentual: 3 }), 328951.18);
check("percentual -10%", aplicarReajuste(100000, { tipo: "percentual", percentual: -10 }), 90000);
check("fixo +5.000", aplicarReajuste(319370.08, { tipo: "fixo", valor: 5000 }), 324370.08);
check("fixo desconto", aplicarReajuste(319370.08, { tipo: "fixo", valor: -370.08 }), 319000);
check("cub 3000 → 3090 = +3%", aplicarReajuste(200000, { tipo: "cub", cubBase: 3000, cubNovo: 3090 }), 206000);
check("fator cub", fatorReajuste({ tipo: "cub", cubBase: 2500, cubNovo: 2525 }), 1.01);
check("arredonda centavos", aplicarReajuste(100000.01, { tipo: "percentual", percentual: 0.333 }), 100333.01);

// Validação
check("percentual zero é erro", validarReajuste({ tipo: "percentual", percentual: 0 }) !== null, true);
check("percentual -100 é erro", validarReajuste({ tipo: "percentual", percentual: -100 }) !== null, true);
check("fixo zero é erro", validarReajuste({ tipo: "fixo", valor: 0 }) !== null, true);
check("cub sem base é erro", validarReajuste({ tipo: "cub", cubBase: 0, cubNovo: 3000 }) !== null, true);
check("cub igual é erro", validarReajuste({ tipo: "cub", cubBase: 3000, cubNovo: 3000 }) !== null, true);
check("percentual válido", validarReajuste({ tipo: "percentual", percentual: 2.5 }), null);
check("nulo é erro", validarReajuste(null) !== null, true);

// Descrição (vai para o histórico)
check("descrição percentual", descreverReajuste({ tipo: "percentual", percentual: 3 }), "Reajuste de +3%");
check("descrição cub com rótulo", descreverReajuste({ tipo: "cub", cubBase: 3000, cubNovo: 3090, rotulo: "Ago/2026 → Set/2026" }).startsWith("Reajuste pelo CUB Ago/2026 → Set/2026"), true);

// R$/m²
check("m² × área", precoPorM2(20.3, 15000), 304500);
check("m² sem área", precoPorM2(0, 15000), null);

// Status que aceitam preço de tabela
check("disponível aceita", semVenda("Disponível"), true);
check("proposta aceita", semVenda("Proposta"), true);
check("vendida não", semVenda("Vendida"), false);
check("vendido terceiros não", semVenda("Vendido/Terceiros"), false);
check("estoque Permuta não aceita preço", semVenda("Permuta"), false);

// Números BR
check("BR completo", lerValorBR("319.370,08"), 319370.08);
check("com R$", lerValorBR("R$ 319.370,08"), 319370.08);
check("ponto decimal", lerValorBR("319370.08"), 319370.08);
check("milhar sem vírgula", lerValorBR("319.370"), 319370);
check("inteiro", lerValorBR("319370"), 319370);
check("vazio", lerValorBR(""), null);
check("lixo", lerValorBR("abc"), null);
check("negativo", lerValorBR("-5.000"), -5000);
check("decimal 3,5", lerDecimalBR("3,5"), 3.5);
check("decimal -2%", lerDecimalBR("-2%"), -2);

// Máscara de digitação
check("máscara milhar", mascararValorBR("320000"), "320.000");
check("máscara milhão", mascararValorBR("1234567"), "1.234.567");
check("máscara decimal", mascararValorBR("320000,5"), "320.000,5");
check("máscara 2 casas", mascararValorBR("320000,567"), "320.000,56");
check("máscara redigitada", mascararValorBR("320.0001"), "3.200.001");
check("máscara ignora letras", mascararValorBR("R$ 12a3"), "123");
check("máscara zero à esquerda", mascararValorBR("00012"), "12");
check("máscara só vírgula", mascararValorBR(","), "0,");
check("máscara vazia", mascararValorBR(""), "");
check("máscara negativo permitido", mascararValorBR("-5000", true), "-5.000");
check("máscara negativo barrado", mascararValorBR("-5000"), "5.000");
check("máscara lida de volta", lerValorBR(mascararValorBR("1234567,8")), 1234567.8);
check("completa centavos", completarCentavosBR("320.000"), "320.000,00");
check("completa decimal curto", completarCentavosBR("320.000,5"), "320.000,50");
check("completa vazio fica vazio", completarCentavosBR(""), "");

// Permissão: lista própria; sem ela, a da reserva
process.env.TABELA_PRECOS_EMAILS = "";
process.env.RESERVA_UNIDADE_EMAILS = "administrativo@levenconstrutora.com.br, Edielson@dtconsultorias.com";
check("herda lista da reserva", emailsEditoresPrecos(), ["administrativo@levenconstrutora.com.br", "edielson@dtconsultorias.com"]);
check("e-mail autorizado (caixa)", podeEditarPrecos("EDIELSON@dtconsultorias.com"), true);
process.env.TABELA_PRECOS_EMAILS = "comercial@levenconstrutora.com.br";
check("lista própria substitui", podeEditarPrecos("edielson@dtconsultorias.com"), false);
check("lista própria autoriza", podeEditarPrecos("comercial@levenconstrutora.com.br"), true);
check("sem e-mail", podeEditarPrecos(""), false);

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nTabela de preços: tudo certo.");
