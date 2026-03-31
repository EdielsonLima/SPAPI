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
