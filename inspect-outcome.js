const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query("SELECT data FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  const items = r.rows[0].data?.data || r.rows[0].data || [];

  // Print all top-level fields on a sample item
  console.log('=== ALL FIELDS ON FIRST ITEM ===');
  const sample = items[0];
  console.log(Object.keys(sample));
  console.log('\n=== FULL SAMPLE ITEM ===');
  console.log(JSON.stringify(sample, null, 2));
  await pool.end();
})();
