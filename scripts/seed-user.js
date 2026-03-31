/**
 * Seed a user into the database.
 * Usage: node scripts/seed-user.js "Nome" "email" "senha"
 * Example: node scripts/seed-user.js "Carlos Humberto" "carlos@silvapacker.com.br" "silvapacker@carlos"
 */

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function seedUser(name, email, password) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = $1, password_hash = $2`,
    [name, email, hash]
  );
  console.log(`User "${name}" (${email}) created/updated successfully.`);
}

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.log('Usage: node scripts/seed-user.js "Nome" "email" "senha"');
  process.exit(1);
}

seedUser(name, email, password)
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
