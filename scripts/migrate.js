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
  } catch (err) {
    console.error("[migrate] Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
