const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPool } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');
const MIGRATION_LOCK_ID = '742129385101';

function listMigrations(directory = MIGRATIONS_DIR) {
  const files = fs.readdirSync(directory)
    .filter((name) => /^\d{4,}_[a-z0-9_-]+\.sql$/i.test(name))
    .sort((a, b) => {
      const versionA = BigInt(a.slice(0, a.indexOf('_')));
      const versionB = BigInt(b.slice(0, b.indexOf('_')));
      return versionA < versionB ? -1 : versionA > versionB ? 1 : a.localeCompare(b);
    });
  const versions = new Set();

  for (const name of files) {
    const version = BigInt(name.slice(0, name.indexOf('_'))).toString();
    if (versions.has(version)) {
      throw new Error(`Duplicate migration version: ${version}`);
    }
    versions.add(version);
  }

  return files;
}

async function runMigrations({ pool = getPool(), directory = MIGRATIONS_DIR } = {}) {
  const migrations = listMigrations(directory);
  const client = await pool.connect();
  let locked = false;
  let operationError;

  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_ID]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
    const { rows } = await client.query('SELECT migration_id, checksum FROM schema_migrations');
    const applied = new Map(rows.map((row) => [row.migration_id, row.checksum]));
    const available = new Set(migrations);
    for (const migrationId of applied.keys()) {
      if (!available.has(migrationId)) {
        throw new Error(`Applied migration is missing from disk: ${migrationId}`);
      }
    }

    const completed = [];
    for (const migrationId of migrations) {
      const sql = fs.readFileSync(path.join(directory, migrationId), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      if (applied.has(migrationId)) {
        const recordedChecksum = applied.get(migrationId);
        if (recordedChecksum && recordedChecksum !== checksum) {
          throw new Error(`Applied migration has been modified: ${migrationId}`);
        }
        if (!recordedChecksum) {
          await client.query(
            'UPDATE schema_migrations SET checksum = $2 WHERE migration_id = $1 AND checksum IS NULL',
            [migrationId, checksum]
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_id, checksum) VALUES ($1, $2)',
          [migrationId, checksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `Migration ${migrationId} failed and rollback failed`,
            { cause: error }
          );
        }
        throw new Error(`Migration ${migrationId} failed: ${error.message}`, { cause: error });
      }
      completed.push(migrationId);
    }

    return completed;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let cleanupError;
    try {
      if (locked) {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_ID]);
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      client.release(cleanupError);
    }
    if (cleanupError && !operationError) {
      throw cleanupError;
    }
  }
}

module.exports = { listMigrations, runMigrations, MIGRATIONS_DIR };
