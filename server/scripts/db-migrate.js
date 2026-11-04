const { runMigrations } = require('../src/config/migration-runner');
const { closePool } = require('../src/config/db');

async function main() {
  const applied = await runMigrations();
  console.log(applied.length
    ? `Applied migrations: ${applied.join(', ')}`
    : 'Database schema is up to date.');
}

main()
  .catch((error) => {
    console.error(`Database migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
