/**
 * Bootstraps the legacy core schema, then applies pending versioned migrations.
 * Usage: npm run db:init   (start PostgreSQL first with docker compose up -d postgres)
 */
const fs = require('fs');
const path = require('path');
const { query, closePool } = require('../src/config/db');
const { runMigrations } = require('../src/config/migration-runner');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

async function main() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await query(sql);
  const applied = await runMigrations();
  const { rows } = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log(`Core schema is ready. Applied migrations: ${applied.length ? applied.join(', ') : 'none'}`);
  console.log(`Tables: ${rows.map((r) => r.table_name).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(`Schema initialisation failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
