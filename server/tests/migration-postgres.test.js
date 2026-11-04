const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { runMigrations } = require('../src/config/migration-runner');

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describePostgres('PostgreSQL database migrations', () => {
  let adminPool;
  let databasePool;
  let migrationDirectory;
  let schemaName;

  beforeAll(async () => {
    schemaName = `passpulse_test_${process.pid}_${Date.now()}`;
    adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    databasePool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
    });

    await databasePool.query(
      fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
    );
    await databasePool.query(`
      INSERT INTO users (id, full_name, email, password_hash, role)
      VALUES
        ('USR-ORG-PG', 'Organizer', 'organizer-pg@test.io', 'hash', 'ORGANIZER'),
        ('USR-ATT-PG', 'Attendee', 'attendee-pg@test.io', 'hash', 'ATTENDEE'),
        ('USR-ATT2-PG', 'Attendee 2', 'attendee2-pg@test.io', 'hash', 'ATTENDEE')
    `);
    await databasePool.query(`
      INSERT INTO events (id, organizer_id, title, category, venue, event_date, capacity)
      VALUES ('EVT-PG', 'USR-ORG-PG', 'Postgres test', 'Tech', 'Hall', now() + interval '1 day', 1)
    `);
    await databasePool.query(`
      INSERT INTO ticket_tiers (id, event_id, name, price, quota)
      VALUES ('TIER-PG', 'EVT-PG', 'Single seat', 10, 1),
             ('TIER-PG-OTHER', 'EVT-PG', 'Other tier', 20, 1)
    `);
    await databasePool.query(`
      INSERT INTO bookings (id, user_id, event_id, total_amount)
      VALUES ('BKG-PG', 'USR-ATT-PG', 'EVT-PG', 10)
    `);
    await databasePool.query(`
      INSERT INTO tickets (id, booking_id, tier_id)
      VALUES ('TKT-PG', 'BKG-PG', 'TIER-PG')
    `);
    await databasePool.query(`
      INSERT INTO check_in_logs (ticket_id, event_id)
      VALUES ('TKT-PG', 'EVT-PG')
    `);
    await databasePool.query(`
      INSERT INTO audit_log (actor_id, action, target)
      VALUES ('USR-ATT-PG', 'TEST', 'BKG-PG')
    `);

    await runMigrations({ pool: databasePool });
    await databasePool.query('BEGIN');
    try {
      const migrationFiles = fs.readdirSync(path.join(__dirname, '..', 'db', 'migrations'))
        .filter((name) => name.endsWith('.sql'))
        .sort();
      for (const migrationFile of migrationFiles) {
        await databasePool.query(
          fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', migrationFile), 'utf8')
        );
      }
      await databasePool.query('COMMIT');
    } catch (error) {
      await databasePool.query('ROLLBACK');
      throw error;
    }
  });

  afterAll(async () => {
    if (databasePool) await databasePool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
    if (migrationDirectory) fs.rmSync(migrationDirectory, { recursive: true, force: true });
  });

  test('preserves legacy records and does not reapply applied migrations', async () => {
    await expect(runMigrations({ pool: databasePool })).resolves.toEqual([]);

    const records = await databasePool.query(`
      SELECT
        (SELECT count(*) FROM bookings WHERE id = 'BKG-PG') AS bookings,
        (SELECT count(*) FROM tickets WHERE id = 'TKT-PG') AS tickets,
        (SELECT count(*) FROM check_in_logs WHERE ticket_id = 'TKT-PG') AS checkins,
        (SELECT count(*) FROM audit_log WHERE target = 'BKG-PG') AS audits
    `);
    expect(Object.values(records.rows[0]).map(Number)).toEqual([1, 1, 1, 1]);

    const migrations = await databasePool.query('SELECT migration_id, checksum FROM schema_migrations');
    expect(migrations.rows).toHaveLength(2);
    expect(migrations.rows.every((row) => /^[a-f0-9]{64}$/.test(row.checksum))).toBe(true);
  });

  test('enforces inventory bounds, persistent foreign keys, FIFO and claim expiry', async () => {
    await expect(databasePool.query(`
      INSERT INTO ticket_holds (id, user_id, event_id, tier_id, quantity, expires_at)
      VALUES ('HOLD-BAD-USER', 'MISSING', 'EVT-PG', 'TIER-PG', 1, now() + interval '10 minutes')
    `)).rejects.toMatchObject({ code: '23503' });

    await expect(databasePool.query(`
      INSERT INTO ticket_holds (id, user_id, event_id, tier_id, quantity, expires_at)
      VALUES ('HOLD-BAD-EVENT', 'USR-ATT-PG', 'MISSING', 'TIER-PG', 1, now() + interval '10 minutes')
    `)).rejects.toMatchObject({ code: '23503' });
    await expect(databasePool.query(`
      INSERT INTO ticket_holds (id, user_id, event_id, tier_id, quantity, expires_at)
      VALUES ('HOLD-BAD-TIER-EVENT', 'USR-ATT-PG', 'EVT-PG', 'MISSING', 1, now() + interval '10 minutes')
    `)).rejects.toMatchObject({ code: '23503' });

    await databasePool.query("UPDATE ticket_tiers SET reserved = 1 WHERE id = 'TIER-PG'");
    await expect(databasePool.query("UPDATE ticket_tiers SET sold = 1 WHERE id = 'TIER-PG'"))
      .rejects.toMatchObject({ code: '23514' });
    await expect(databasePool.query("UPDATE ticket_tiers SET quota = 0 WHERE id = 'TIER-PG'"))
      .rejects.toMatchObject({ code: '23514' });

    await databasePool.query(`
      INSERT INTO waitlist_entries (id, user_id, event_id, tier_id)
      VALUES ('WAIT-PG-1', 'USR-ATT-PG', 'EVT-PG', 'TIER-PG')
    `);
    await databasePool.query(`
      INSERT INTO waitlist_entries (id, user_id, event_id, tier_id)
      VALUES ('WAIT-PG-2', 'USR-ATT2-PG', 'EVT-PG', 'TIER-PG')
    `);
    const positions = await databasePool.query(
      "SELECT queue_position FROM waitlist_entries WHERE id IN ('WAIT-PG-1', 'WAIT-PG-2') ORDER BY queue_position"
    );
    expect(BigInt(positions.rows[0].queue_position)).toBeLessThan(BigInt(positions.rows[1].queue_position));

    await expect(databasePool.query(`
      INSERT INTO waitlist_entries (id, user_id, event_id, tier_id)
      VALUES ('WAIT-PG-DUP', 'USR-ATT-PG', 'EVT-PG', 'TIER-PG')
    `)).rejects.toMatchObject({ code: '23505' });
    await expect(databasePool.query(`
      INSERT INTO waitlist_claims
        (id, waitlist_entry_id, user_id, event_id, tier_id, quantity, token_hash, expires_at)
      VALUES ('CLAIM-LATE', 'WAIT-PG-1', 'USR-ATT-PG', 'EVT-PG', 'TIER-PG', 1,
              'hash-late', now() + interval '16 minutes')
    `)).rejects.toMatchObject({ code: '23514' });
    await databasePool.query(`
      INSERT INTO ticket_holds (id, user_id, event_id, tier_id, quantity, expires_at)
      VALUES ('HOLD-PG-OTHER-TIER', 'USR-ATT-PG', 'EVT-PG', 'TIER-PG-OTHER', 1, now() + interval '10 minutes')
    `);
    await expect(databasePool.query(`
      INSERT INTO waitlist_claims
        (id, waitlist_entry_id, hold_id, user_id, event_id, tier_id, quantity, token_hash)
      VALUES ('CLAIM-WRONG-TIER', 'WAIT-PG-1', 'HOLD-PG-OTHER-TIER',
              'USR-ATT-PG', 'EVT-PG', 'TIER-PG', 1, 'hash-wrong-tier')
    `)).rejects.toMatchObject({ code: '23503' });
  });

  test('blocks early delete, truncation, and changes to retention timestamps', async () => {
    await databasePool.query(`
      INSERT INTO bookings (id, user_id, event_id, total_amount)
      VALUES ('BKG-RETENTION', 'USR-ATT-PG', 'EVT-PG', 0)
    `);
    await expect(databasePool.query("DELETE FROM bookings WHERE id = 'BKG-RETENTION'"))
      .rejects.toMatchObject({ code: '23001' });
    await expect(databasePool.query("TRUNCATE audit_log"))
      .rejects.toMatchObject({ code: '23001' });
    await expect(databasePool.query("UPDATE bookings SET created_at = now() - interval '2 years' WHERE id = 'BKG-RETENTION'"))
      .rejects.toMatchObject({ code: '23514' });
    await expect(databasePool.query("UPDATE bookings SET retained_until = now() WHERE id = 'BKG-RETENTION'"))
      .rejects.toMatchObject({ code: '23514' });
    await expect(databasePool.query("UPDATE check_in_logs SET event_id = 'EVT-OTHER' WHERE ticket_id = 'TKT-PG'"))
      .rejects.toMatchObject({ code: '23514' });
    await expect(databasePool.query("UPDATE audit_log SET action = 'ALTERED' WHERE target = 'BKG-PG'"))
      .rejects.toMatchObject({ code: '23514' });
  });

  test('serializes concurrent migration runners and detects migration drift', async () => {
    migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'passpulse-postgres-migrations-'));
    const sourceDirectory = path.join(__dirname, '..', 'db', 'migrations');
    for (const migrationFile of fs.readdirSync(sourceDirectory).filter((name) => name.endsWith('.sql'))) {
      fs.copyFileSync(
        path.join(sourceDirectory, migrationFile),
        path.join(migrationDirectory, migrationFile)
      );
    }
    fs.writeFileSync(path.join(migrationDirectory, '0003_concurrent.sql'), 'SELECT pg_sleep(0.1);');

    const outcomes = await Promise.all([
      runMigrations({ pool: databasePool, directory: migrationDirectory }),
      runMigrations({ pool: databasePool, directory: migrationDirectory }),
    ]);
    expect(outcomes.flat()).toHaveLength(1);

    fs.writeFileSync(path.join(migrationDirectory, '0003_concurrent.sql'), 'SELECT 1;');
    await expect(runMigrations({ pool: databasePool, directory: migrationDirectory }))
      .rejects.toThrow('Applied migration has been modified: 0003_concurrent.sql');
  });
});
