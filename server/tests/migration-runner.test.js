const fs = require('fs');
const os = require('os');
const path = require('path');
const { runMigrations } = require('../src/config/migration-runner');
const db = require('../src/config/db');

function makeMigrationPool() {
  const applied = [];
  const executed = [];
  const counters = { begins: 0, commits: 0, rollbacks: 0, locks: 0, unlocks: 0, releases: 0 };
  let transactionApplied = null;
  let failLock = false;
  let failUnlock = false;
  let failRollback = false;

  const client = {
    async query(sql, params = []) {
      const statement = sql.trim();
      if (statement.startsWith('SELECT pg_advisory_lock')) {
        counters.locks += 1;
        if (failLock) throw new Error('test lock failure');
      }
      else if (statement.startsWith('SELECT pg_advisory_unlock')) {
        counters.unlocks += 1;
        if (failUnlock) throw new Error('test unlock failure');
      }
      else if (statement.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) return { rows: [] };
      else if (statement.startsWith('ALTER TABLE schema_migrations')) return { rows: [] };
      else if (statement.startsWith('SELECT migration_id, checksum')) {
        return { rows: [...applied] };
      } else if (statement === 'BEGIN') {
        counters.begins += 1;
        transactionApplied = applied.map((row) => ({ ...row }));
      } else if (statement === 'COMMIT') {
        counters.commits += 1;
        transactionApplied = null;
      } else if (statement === 'ROLLBACK') {
        counters.rollbacks += 1;
        if (failRollback) throw new Error('test rollback failure');
        applied.splice(0, applied.length, ...transactionApplied);
        transactionApplied = null;
      } else if (statement.startsWith('INSERT INTO schema_migrations')) {
        applied.push({ migration_id: params[0], checksum: params[1] });
      } else if (statement.startsWith('UPDATE schema_migrations SET checksum')) {
        const row = applied.find((item) => item.migration_id === params[0]);
        if (row && !row.checksum) row.checksum = params[1];
      } else if (statement.includes('FAIL MIGRATION')) {
        throw new Error('test migration failure');
      } else {
        executed.push(statement);
      }
      return { rows: [] };
    },
    release(error) {
      counters.releases += 1;
      if (error) counters.releaseErrors = (counters.releaseErrors || 0) + 1;
    },
  };

  return {
    pool: { connect: async () => client },
    applied,
    executed,
    counters,
    failLock(value) { failLock = value; },
    failUnlock(value) { failUnlock = value; },
    failRollback(value) { failRollback = value; },
  };
}

describe('versioned database migration runner', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'passpulse-migrations-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('applies migrations in order once and records their versions', async () => {
    fs.writeFileSync(path.join(directory, '0002_second.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(directory, '0001_first.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(directory, 'README.md'), 'not a migration');
    const fixture = makeMigrationPool();

    await expect(runMigrations({ pool: fixture.pool, directory })).resolves.toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    await expect(runMigrations({ pool: fixture.pool, directory })).resolves.toEqual([]);

    expect(fixture.applied.map((row) => row.migration_id)).toEqual(['0001_first.sql', '0002_second.sql']);
    expect(fixture.applied.every((row) => /^[a-f0-9]{64}$/.test(row.checksum))).toBe(true);
    expect(fixture.executed).toEqual(['SELECT 1;', 'SELECT 2;']);
    expect(fixture.counters).toMatchObject({ begins: 2, commits: 2, rollbacks: 0, locks: 2, unlocks: 2, releases: 2 });
  });

  test('rolls back a failed migration, leaves it unapplied, and unlocks', async () => {
    fs.writeFileSync(path.join(directory, '0001_failing.sql'), 'FAIL MIGRATION');
    const fixture = makeMigrationPool();

    await expect(runMigrations({ pool: fixture.pool, directory }))
      .rejects.toThrow('Migration 0001_failing.sql failed: test migration failure');

    expect(fixture.applied).toEqual([]);
    expect(fixture.counters).toMatchObject({ begins: 1, commits: 0, rollbacks: 1, locks: 1, unlocks: 1, releases: 1 });
  });

  test('detects changed applied migrations and releases the client if unlocking fails', async () => {
    fs.writeFileSync(path.join(directory, '0001_first.sql'), 'SELECT 1;');
    const fixture = makeMigrationPool();
    await runMigrations({ pool: fixture.pool, directory });
    fs.writeFileSync(path.join(directory, '0001_first.sql'), 'SELECT 2;');
    fixture.failUnlock(true);

    await expect(runMigrations({ pool: fixture.pool, directory }))
      .rejects.toThrow('Applied migration has been modified: 0001_first.sql');
    expect(fixture.counters.releases).toBe(2);
  });

  test('reports both migration and rollback errors', async () => {
    fs.writeFileSync(path.join(directory, '0001_failing.sql'), 'FAIL MIGRATION');
    const fixture = makeMigrationPool();
    fixture.failRollback(true);

    await expect(runMigrations({ pool: fixture.pool, directory })).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Migration 0001_failing.sql failed and rollback failed',
    });
    expect(fixture.counters.releases).toBe(1);
  });

  test('sorts numeric versions and rejects duplicate numeric versions', async () => {
    fs.writeFileSync(path.join(directory, '10000_latest.sql'), 'SELECT 10000;');
    fs.writeFileSync(path.join(directory, '9999_previous.sql'), 'SELECT 9999;');
    const fixture = makeMigrationPool();

    await expect(runMigrations({ pool: fixture.pool, directory })).resolves.toEqual([
      '9999_previous.sql',
      '10000_latest.sql',
    ]);

    fs.writeFileSync(path.join(directory, '09999_duplicate.sql'), 'SELECT 0;');
    await expect(runMigrations({ pool: fixture.pool, directory })).rejects.toThrow('Duplicate migration version: 9999');
  });

  test('uses the configured default pool and migration directory', async () => {
    const fixture = makeMigrationPool();
    db.setPool(fixture.pool);
    try {
      await expect(runMigrations()).resolves.toEqual([
        '0001_booking_and_retention_foundation.sql',
        '0002_fifo_waitlist_claim_allocations.sql',
      ]);
    } finally {
      db.setPool(null);
    }
  });

  test('rejects applied migrations missing from disk and fills legacy checksums', async () => {
    const missingFixture = makeMigrationPool();
    missingFixture.applied.push({ migration_id: '0001_missing.sql', checksum: 'abc' });
    await expect(runMigrations({ pool: missingFixture.pool, directory }))
      .rejects.toThrow('Applied migration is missing from disk: 0001_missing.sql');

    fs.writeFileSync(path.join(directory, '0001_legacy.sql'), 'SELECT 1;');
    const legacyFixture = makeMigrationPool();
    legacyFixture.applied.push({ migration_id: '0001_legacy.sql', checksum: null });
    await expect(runMigrations({ pool: legacyFixture.pool, directory })).resolves.toEqual([]);
    expect(legacyFixture.applied[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test('releases the migration client when locking or unlocking fails', async () => {
    const lockFixture = makeMigrationPool();
    lockFixture.failLock(true);
    await expect(runMigrations({ pool: lockFixture.pool, directory }))
      .rejects.toThrow('test lock failure');
    expect(lockFixture.counters).toMatchObject({ locks: 1, unlocks: 0, releases: 1 });

    const unlockFixture = makeMigrationPool();
    unlockFixture.failUnlock(true);
    await expect(runMigrations({ pool: unlockFixture.pool, directory }))
      .rejects.toThrow('test unlock failure');
    expect(unlockFixture.counters).toMatchObject({ locks: 1, unlocks: 1, releases: 1 });
  });
});
