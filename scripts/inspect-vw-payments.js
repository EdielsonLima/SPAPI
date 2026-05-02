// Inspeciona estrutura completa de payments dos credores VOLKSWAGEN, PACOPEDRA,
// MERCADOPAGO, MAGAZINE LUIZA, KOERICH em SILVA PACKER 2024 — onde o PDF Sienge
// mostra Líquido < (Valor baixa - Desconto), indicando redução oculta no Sienge
// que não estamos capturando via API.
//
// Objetivo: descobrir se o cache /outcome tem algum campo (discountAmount,
// taxAmount, monetaryCorrection, etc.) que carrega esse valor que sumiu.
//
// Uso: node scripts/inspect-vw-payments.js

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const fmt = v => `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COMPANY = "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA";
const TARGETS = [
  { name: "VOLKSWAGEN", expectedNet: 28381.00, expectedReduction: 41000.00 },
  { name: "PACOPEDRA", expectedNet: 36055.25, expectedReduction: 38500.00 },
  { name: "MERCADOPAGO", expectedNet: 5656.29, expectedReduction: 4665.45 },
  { name: "MAGAZINE LUIZA", expectedNet: 4904.09, expectedReduction: 6438.09 },
  { name: "KOERICH", expectedNet: 1847.00, expectedReduction: 1788.00 },
];

(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache: ${items.length} itens total\n`);

  for (const target of TARGETS) {
    console.log("=".repeat(100));
    console.log(`CREDOR: ${target.name}`);
    console.log(`Esperado Líquido (PDF Sienge): ${fmt(target.expectedNet)}, redução oculta: ${fmt(target.expectedReduction)}`);
    console.log("=".repeat(100));

    const matches = items.filter(it =>
      it.companyName === COMPANY &&
      (it.creditorName || "").toUpperCase().includes(target.name.toUpperCase())
    );
    console.log(`Encontrados ${matches.length} item(s) outcome\n`);

    let totalNet = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalCorrection = 0;
    let totalGross = 0;

    for (const item of matches.slice(0, 5)) {
      console.log(`--- Item: ${item.documentIdentificationName} ${item.documentNumber || ""} ---`);
      console.log(`  creditorName: ${item.creditorName}`);
      console.log(`  installmentNumber: ${item.installmentNumber}`);
      console.log(`  origAmount: ${fmt(item.originalAmount)} | corrected: ${fmt(item.correctedBalanceAmount)} | discount: ${fmt(item.discountAmount)} | tax: ${fmt(item.taxAmount)}`);
      console.log(`  Payments (${(item.payments || []).length}):`);
      for (const p of (item.payments || [])) {
        if (p.netAmount === 0) continue;
        console.log(`    paymentDate=${p.paymentDate} netAmount=${fmt(p.netAmount)} opType=${p.operationTypeName}`);
        // Print all keys of payment to find anything not used
        const keys = Object.keys(p).filter(k => !["paymentDate", "netAmount", "operationTypeName"].includes(k));
        if (keys.length > 0) {
          const extras = {};
          for (const k of keys) extras[k] = p[k];
          console.log(`      outros campos:`, JSON.stringify(extras));
        }
      }
    }

    // Aggregate all payments for this credor
    for (const item of matches) {
      const docName = (item.documentIdentificationName || "").toUpperCase();
      if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
      for (const p of (item.payments || [])) {
        if (p.netAmount === 0) continue;
        if (["substitui", "cancelamento", "estorno", "abatimento"].some(x => (p.operationTypeName || "").toLowerCase().includes(x))) continue;
        totalNet += p.netAmount || 0;
        totalDiscount += p.discountAmount || 0;
        totalTax += p.taxAmount || 0;
        totalCorrection += p.monetaryCorrectionAmount || 0;
        totalGross += p.grossAmount || 0;
      }
    }

    console.log(`\n  TOTAIS para ${target.name}:`);
    console.log(`    netAmount sum:           ${fmt(totalNet)}`);
    console.log(`    discountAmount sum:      ${fmt(totalDiscount)}`);
    console.log(`    taxAmount sum:           ${fmt(totalTax)}`);
    console.log(`    monetaryCorrection sum:  ${fmt(totalCorrection)}`);
    console.log(`    grossAmount sum:         ${fmt(totalGross)}`);
    console.log(`    netAmount - tax:         ${fmt(totalNet - totalTax)}`);
    console.log(`    netAmount - discount:    ${fmt(totalNet - totalDiscount)}`);
    console.log(`    netAmount - tax - disc:  ${fmt(totalNet - totalTax - totalDiscount)}`);
    console.log(`    PDF esperado:            ${fmt(target.expectedNet)}`);
    console.log(`    diff (net - PDF):        ${fmt(totalNet - target.expectedNet)}`);
    console.log("");
  }

  await pool.end();
})();
