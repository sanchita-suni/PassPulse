/**
 * OPS-001: schema integrity checks.
 * Runs db/schema.sql against pg-mem, an in-memory PostgreSQL engine, so the
 * constraints are verified without needing a database server.
 */
const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');
const db = require('../src/config/db');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

let pool;

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  db.setPool(pool);
  await db.query(schema);

  await db.query(
    "INSERT INTO users (id, full_name, email, password_hash, role) VALUES ('USR-ORG-1', 'Org', 'org@x.io', '$2a$10$h', 'ORGANIZER'), ('USR-ATT-1', 'Att', 'att@x.io', '$2a$10$h', 'ATTENDEE')"
  );
  await db.query(
    "INSERT INTO events (id, organizer_id, title, category, venue, event_date, capacity) VALUES ('EVT-1', 'USR-ORG-1', 'Tech Talk', 'Tech', 'Hall A', '2026-11-20T10:00:00Z', 100)"
  );
});

afterEach(async () => {
  await db.closePool();
});

async function expectReject(sql) {
  await expect(db.query(sql)).rejects.toThrow();
}

describe('OPS-001 PostgreSQL schema', () => {
  test('creates all core tables', async () => {
    const tables = ['users', 'events', 'ticket_tiers', 'bookings', 'tickets', 'check_in_logs', 'audit_log'];
    for (const t of tables) {
      const { rows } = await db.query(`SELECT COUNT(*) AS n FROM ${t}`);
      expect(rows).toHaveLength(1);
    }
  });

  test('new events default to DRAFT and are not flagged', async () => {
    const { rows } = await db.query("SELECT status, is_flagged FROM events WHERE id = 'EVT-1'");
    expect(rows[0].status).toBe('DRAFT');
    expect(rows[0].is_flagged).toBe(false);
  });

  test('rejects a duplicate user email', async () => {
    await expectReject(
      "INSERT INTO users (id, full_name, email, password_hash) VALUES ('USR-X', 'Dup', 'org@x.io', 'h')"
    );
  });

  test('rejects an unknown role', async () => {
    await expectReject(
      "INSERT INTO users (id, full_name, email, password_hash, role) VALUES ('USR-Y', 'Bad', 'bad@x.io', 'h', 'ROOT')"
    );
  });

  test('rejects an event whose organizer does not exist', async () => {
    await expectReject(
      "INSERT INTO events (id, organizer_id, title, category, venue, event_date, capacity) VALUES ('EVT-2', 'NOPE', 'T', 'C', 'V', now(), 10)"
    );
  });

  test('rejects an illegal event status and zero capacity', async () => {
    await expectReject(
      "INSERT INTO events (id, organizer_id, title, category, venue, event_date, capacity, status) VALUES ('EVT-3', 'USR-ORG-1', 'T', 'C', 'V', now(), 10, 'OPEN')"
    );
    await expectReject(
      "INSERT INTO events (id, organizer_id, title, category, venue, event_date, capacity) VALUES ('EVT-4', 'USR-ORG-1', 'T', 'C', 'V', now(), 0)"
    );
  });

  test('ticket tiers reject zero quota, negative price, duplicate names and overselling', async () => {
    await db.query("INSERT INTO ticket_tiers (id, event_id, name, price, quota) VALUES ('TIER-1', 'EVT-1', 'VIP', 799, 10)");
    await expectReject("INSERT INTO ticket_tiers (id, event_id, name, price, quota) VALUES ('TIER-2', 'EVT-1', 'General', 499, 0)");
    await expectReject("INSERT INTO ticket_tiers (id, event_id, name, price, quota) VALUES ('TIER-3', 'EVT-1', 'Early', -1, 5)");
    await expectReject("INSERT INTO ticket_tiers (id, event_id, name, price, quota) VALUES ('TIER-4', 'EVT-1', 'VIP', 100, 5)");
    await expectReject("UPDATE ticket_tiers SET sold = 11 WHERE id = 'TIER-1'");
  });

  test('allows only one check-in per ticket', async () => {
    await db.query("INSERT INTO ticket_tiers (id, event_id, name, price, quota) VALUES ('TIER-1', 'EVT-1', 'VIP', 799, 10)");
    await db.query("INSERT INTO bookings (id, user_id, event_id, total_amount) VALUES ('BKG-1', 'USR-ATT-1', 'EVT-1', 799)");
    await db.query("INSERT INTO tickets (id, booking_id, tier_id) VALUES ('TKT-1', 'BKG-1', 'TIER-1')");
    await db.query("INSERT INTO check_in_logs (ticket_id, event_id) VALUES ('TKT-1', 'EVT-1')");
    await expectReject("INSERT INTO check_in_logs (ticket_id, event_id) VALUES ('TKT-1', 'EVT-1')");
  });

  test('deleting an event removes its tiers', async () => {
    await db.query("INSERT INTO ticket_tiers (id, event_id, name, price, quota) VALUES ('TIER-1', 'EVT-1', 'VIP', 799, 10)");
    await db.query("DELETE FROM events WHERE id = 'EVT-1'");
    const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM ticket_tiers");
    expect(Number(rows[0].n)).toBe(0);
  });

  test('getPool requires DATABASE_URL when no pool is set', async () => {
    await db.closePool();
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(() => db.getPool()).toThrow('DATABASE_URL is not configured');
    process.env.DATABASE_URL = saved;
    if (saved === undefined) delete process.env.DATABASE_URL;
  });
});
