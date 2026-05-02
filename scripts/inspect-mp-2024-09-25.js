// Inspeciona o pagamento MERCADOPAGO 2024-09-25 R$ 1.325,92 que está no cache
// mas não aparece no PDF Sienge "Contas Pagas (por Credor) Sintético" SILVA PACKER 2024.
//
// Hipóteses:
// 1. Item foi cancelado/substituído no Sienge depois mas cache ainda tem o original
// 2. Item está em situação de "PREVISAO" mas não tem prefixo PREVISÃO no doc name
// 3. Diferença no recorte do relatório (alguma flag de filtro)

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const r = await pool.query("SELECT data, cached_at FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  console.log(`Cache cached_at: ${r.rows[0].cached_at}`);
  console.log(`Total items: ${items.length}\n`);

  // Find all MERCADOPAGO items in SILVA PACKER 2024
  const COMPANY = "SILVA PACKER CONSTRUTORA E INCORPORADORA LTDA";
  const matches = items.filter(it => {
    if (it.companyName !== COMPANY) return false;
    if (!(it.creditorName || "").toUpperCase().includes("MERCADOPAGO")) return false;
    return (it.payments || []).some(p =>
      p.paymentDate && p.paymentDate.startsWith("2024") && Math.abs((p.netAmount || 0) - 1325.92) < 0.01
    );
  });

  console.log(`Items MERCADOPAGO com pagamento R$ 1.325,92 em 2024:`);
  console.log("=".repeat(80));
  for (const item of matches) {
    console.log(JSON.stringify(item, null, 2));
    console.log("-".repeat(80));
  }

  // Also list ALL MERCADOPAGO items in 2024 with full details for context
  console.log("\n=== Todos MERCADOPAGO em SILVA PACKER 2024 (resumo) ===");
  const all2024 = items.filter(it =>
    it.companyName === COMPANY &&
    (it.creditorName || "").toUpperCase().includes("MERCADOPAGO")
  );
  for (const item of all2024) {
    const payments2024 = (item.payments || []).filter(p => p.paymentDate && p.paymentDate.startsWith("2024"));
    if (payments2024.length === 0) continue;
    console.log(`\nDoc: ${item.documentIdentificationName} ${item.documentNumber || ""} (id=${item.creditorId})`);
    console.log(`  origAmount=${item.originalAmount} corrected=${item.correctedBalanceAmount} balance=${item.balanceAmount}`);
    console.log(`  status=${item.status || "(none)"} dueDate=${item.dueDate}`);
    payments2024.forEach(p => {
      console.log(`  payment ${p.paymentDate} net=${p.netAmount} op=${p.operationTypeName} (opId=${p.operationTypeId}) seq=${p.sequencialNumber}`);
    });
  }

  await pool.end();
})();
