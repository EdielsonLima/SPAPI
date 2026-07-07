/**
 * Database migration script — runs schema.sql against DATABASE_URL.
 * Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT).
 *
 * Usage:  npm run db:migrate
 * Called automatically during Railway build.
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Carrega .env.local automaticamente (mesma precedência do Next.js: shell > .env.local)
function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[migrate] DATABASE_URL not set — skipping migration.");
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.app") || databaseUrl.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : false,
  });

  const schemaPath = path.join(__dirname, "..", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.log("[migrate] schema.sql not found — skipping.");
    process.exit(0);
  }

  const sql = fs.readFileSync(schemaPath, "utf-8");

  try {
    console.log("[migrate] Running schema.sql...");
    await pool.query(sql);
    console.log("[migrate] Done — all tables ready.");

    // Migration: ensure dre_excel_supplementary has month column in PK
    try {
      const { rows } = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'dre_excel_supplementary' AND column_name = 'month'
      `);
      if (rows.length === 0) {
        console.log("[migrate] Adding month column to dre_excel_supplementary...");
        await pool.query(`ALTER TABLE dre_excel_supplementary ADD COLUMN month VARCHAR(2) NOT NULL DEFAULT '00'`);
      }
      // Check if PK includes month (4 columns = correct, 3 = old)
      const pkCols = await pool.query(`
        SELECT COUNT(*) as cnt FROM information_schema.key_column_usage
        WHERE table_name = 'dre_excel_supplementary' AND constraint_name LIKE '%pkey%'
      `);
      if (parseInt(pkCols.rows[0].cnt) < 4) {
        console.log("[migrate] Recreating PK with month column...");
        await pool.query(`ALTER TABLE dre_excel_supplementary DROP CONSTRAINT IF EXISTS dre_excel_supplementary_pkey`);
        await pool.query(`ALTER TABLE dre_excel_supplementary ADD PRIMARY KEY (year, month, company_id, financial_plan_id)`);
        console.log("[migrate] PK updated successfully.");
      }
    } catch (pkErr) {
      console.log("[migrate] PK migration note:", pkErr.message);
    }
    // Migration: ensure company_settings has controla_orcamento column
    try {
      const { rows } = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'company_settings' AND column_name = 'controla_orcamento'
      `);
      if (rows.length === 0) {
        console.log("[migrate] Adding controla_orcamento column to company_settings...");
        await pool.query(`ALTER TABLE company_settings ADD COLUMN controla_orcamento BOOLEAN NOT NULL DEFAULT FALSE`);
      }
    } catch (coErr) {
      console.log("[migrate] controla_orcamento migration note:", coErr.message);
    }
    // Migration: ensure dre_mappings has company_mode column and composite unique constraint
    try {
      const { rows } = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'dre_mappings' AND column_name = 'company_mode'
      `);
      if (rows.length === 0) {
        console.log("[migrate] Adding company_mode column to dre_mappings...");
        await pool.query(`ALTER TABLE dre_mappings ADD COLUMN company_mode VARCHAR(20) NOT NULL DEFAULT 'sp'`);
        
        console.log("[migrate] Dropping old constraint on dre_mappings...");
        await pool.query(`ALTER TABLE dre_mappings DROP CONSTRAINT IF EXISTS dre_mappings_dre_category_financial_plan_id_key`);
        
        console.log("[migrate] Adding new unique constraint on dre_mappings...");
        await pool.query(`ALTER TABLE dre_mappings ADD CONSTRAINT dre_mappings_dre_category_financial_plan_id_company_mode_key UNIQUE (dre_category, financial_plan_id, company_mode)`);
        console.log("[migrate] dre_mappings table updated successfully.");
      }
    } catch (dmErr) {
      console.log("[migrate] dre_mappings migration note:", dmErr.message);
    }
    // Migration (2026-07-07): restaura os mapeamentos do Silva Packer ("sp").
    // Ao separar a DRE da Holding, os mapeamentos originais (operacionais/SP)
    // acabaram todos com company_mode='holding' e o 'sp' zerou, quebrando o
    // drill-down e a aba "DRE API" no modo Silva Packer. Se 'sp' está vazio e
    // 'holding' tem mapeamentos, copia holding->sp (aditivo, não altera 'holding'
    // nem valores exibidos — que vêm do Excel). Idempotente: uma vez populado, pula.
    try {
      const sp = await pool.query(`SELECT COUNT(*)::int AS n FROM dre_mappings WHERE company_mode = 'sp'`);
      const hol = await pool.query(`SELECT COUNT(*)::int AS n FROM dre_mappings WHERE company_mode = 'holding'`);
      if (sp.rows[0].n === 0 && hol.rows[0].n > 0) {
        console.log("[migrate] dre_mappings 'sp' vazio — copiando de 'holding' p/ restaurar DRE Silva Packer...");
        const res = await pool.query(`
          INSERT INTO dre_mappings (dre_category, financial_plan_id, financial_plan_name, company_mode)
          SELECT dre_category, financial_plan_id, financial_plan_name, 'sp'
          FROM dre_mappings WHERE company_mode = 'holding'
          ON CONFLICT (dre_category, financial_plan_id, company_mode) DO NOTHING
        `);
        console.log(`[migrate] dre_mappings 'sp' restaurado: ${res.rowCount} mapeamentos copiados.`);
      }
    } catch (spErr) {
      console.log("[migrate] dre_mappings sp restore note:", spErr.message);
    }
    // Seed default users (only if not already present)
    try {
      const bcrypt = require("bcryptjs");
      const defaultUsers = [
        { name: "Carlos Humberto", email: "carlos@silvapacker.com.br", password: "silvapacker@carlos" },
      ];
      for (const u of defaultUsers) {
        const exists = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
        if (exists.rows.length === 0) {
          const hash = await bcrypt.hash(u.password, 10);
          await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)",
            [u.name, u.email, hash]
          );
          console.log(`[migrate] User "${u.name}" (${u.email}) created.`);
        }
      }
    } catch (seedErr) {
      console.log("[migrate] User seed note:", seedErr.message);
    }
  } catch (err) {
    console.error("[migrate] Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
