// Refresh do cache Outcome + BMs avulsos direto do Sienge Bulk API.
// Usa o mesmo período/parâmetros do painel para que o cache fique consistente
// com o que o painel mostra.
//
// Uso: node scripts/refresh-cache-pagas.js

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const m = (k) => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const DATABASE_URL = m("DATABASE_URL");
const SIENGE_BULK_API_URL = m("SIENGE_BULK_API_URL");
const SIENGE_USERNAME = m("SIENGE_USERNAME");
const SIENGE_PASSWORD = m("SIENGE_PASSWORD");

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const auth = "Basic " + Buffer.from(`${SIENGE_USERNAME}:${SIENGE_PASSWORD}`).toString("base64");

const START = "2016-01-01";
const END = "2031-12-31";

async function fetchWithRetry(url, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const resp = await fetch(url, {
        headers: { Authorization: auth, "Content-Type": "application/json" },
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (resp.status === 429) {
        const wait = (attempt + 1) * 5000;
        console.warn(`  ${label} 429 — aguardando ${wait}ms (tentativa ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) throw new Error(`${label} ${resp.status} ${resp.statusText}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(t);
      if (attempt === 3) throw e;
      console.warn(`  ${label} erro: ${e.message} — retry ${attempt + 1}/3`);
      await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
    }
  }
}

(async () => {
  const t0 = Date.now();

  // 1. Outcome
  console.log(`[1/2] Outcome ${START}..${END} ...`);
  const outcomeUrl = new URL(`${SIENGE_BULK_API_URL}/outcome`);
  outcomeUrl.searchParams.set("startDate", START);
  outcomeUrl.searchParams.set("endDate", END);
  outcomeUrl.searchParams.set("selectionType", "D");
  outcomeUrl.searchParams.set("correctionIndexerId", "0");
  const today = new Date();
  outcomeUrl.searchParams.set("correctionDate", `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  outcomeUrl.searchParams.set("withAuthorizations", "false");
  outcomeUrl.searchParams.set("withBankMovements", "true");

  const outcomeData = await fetchWithRetry(outcomeUrl.toString(), "outcome");
  const outcomeN = (outcomeData?.data || []).length;
  await pool.query(
    `INSERT INTO cached_outcome (start_date, end_date, data, cached_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (start_date, end_date) DO UPDATE SET data = $3, cached_at = NOW()`,
    [START, END, JSON.stringify(outcomeData)]
  );
  console.log(`  ✓ outcome: ${outcomeN.toLocaleString("pt-BR")} itens cacheados`);

  // 2. Bank movements (somente avulsos)
  console.log(`[2/2] Bank movements avulsos ${START}..${END} ...`);
  const bmUrl = new URL(`${SIENGE_BULK_API_URL}/bank-movement`);
  bmUrl.searchParams.set("startDate", START);
  bmUrl.searchParams.set("endDate", END);
  bmUrl.searchParams.set("selectionType", "M");
  bmUrl.searchParams.set("onlyDetachedMovement", "S");

  const bmData = await fetchWithRetry(bmUrl.toString(), "bank-movement");
  const bmN = (bmData?.data || []).length;
  await pool.query(
    `INSERT INTO cached_bank_movements (start_date, end_date, data, cached_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (start_date, end_date) DO UPDATE SET data = $3, cached_at = NOW()`,
    [START, END, JSON.stringify(bmData)]
  );
  console.log(`  ✓ bank-movement avulsos: ${bmN.toLocaleString("pt-BR")} itens cacheados`);

  console.log(`\nConcluído em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await pool.end();
})().catch(e => {
  console.error("ERRO:", e);
  process.exit(1);
});
