/**
 * Applies server/db/schema.sql to the database in DATABASE_URL (OPS-001).
 * Usage: npm run db:init   (start PostgreSQL first with docker compose up -d postgres)
 */
const fs = require('fs');
const path = require('path');
const { query, closePool } = require('../src/config/db');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

async function main() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await query(sql);
  const { rows } = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log(`Schema applied. Tables: ${rows.map((r) => r.table_name).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(`Schema initialisation failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
