process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { Pool } = require('pg');
const app = require('../src/app');
const db = require('../src/config/db');
const { createToken } = require('../src/middleware/auth.middleware');
const { setRedisClient } = require('../src/config/redis');
const { clearTickets } = require('../src/services/ticket.service');
const {
  getPersistentCheckInRecord,
} = require('../src/services/checkin.service');
const { createHold } = require('../src/services/booking-hold.service');
const { confirmBooking } = require('../src/services/booking-confirmation.service');
const { getAttendeePass } = require('../src/services/ticket.service');

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describePostgres('NFR-007 durable booking, check-in, and audit retention', () => {
  let adminPool;
  let pool;
  let schemaName;
  let userId;
  let gateId;
  let organizerId;
  let eventId;
  let tierId;
  let gateToken;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  beforeEach(async () => {
    schemaName = `passpulse_retention_${process.pid}_${crypto.randomUUID().replace(/-/g, '')}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
    });
    db.setPool(pool);
    await pool.query(fs.readFileSync(
      path.join(__dirname, '..', 'db', 'schema.sql'),
      'utf8'
    ));
    const { runMigrations } = require('../src/config/migration-runner');
    await runMigrations({ pool });

    organizerId = `USR-ORG-${crypto.randomUUID()}`;
    userId = `USR-ATT-${crypto.randomUUID()}`;
    gateId = `USR-GATE-${crypto.randomUUID()}`;
    eventId = `EVT-${crypto.randomUUID()}`;
    tierId = `TIER-${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       VALUES ($1, 'Organizer', $2, 'test', 'ORGANIZER'),
              ($3, 'Attendee', $4, 'test', 'ATTENDEE'),
              ($5, 'Gate Staff', $6, 'test', 'GATE_STAFF')`,
      [
        organizerId, `${organizerId}@test.io`,
        userId, `${userId}@test.io`,
        gateId, `${gateId}@test.io`,
      ]
    );
    await pool.query(
      `INSERT INTO events
        (id, organizer_id, title, description, category, venue, event_date, capacity, status)
       VALUES ($1, $2, 'Retention Event', '', 'Test', 'Hall',
               now() + interval '1 day', 10, 'PUBLISHED')`,
      [eventId, organizerId]
    );
    await pool.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota, max_per_order)
       VALUES ($1, $2, 'General', 125, 1, 1)`,
      [tierId, eventId]
    );
    setRedisClient({
      isOpen: true,
      set: async () => 'OK',
      del: async () => 1,
    });
    gateToken = createToken({ userId: gateId, role: 'GATE_STAFF' });
    clearTickets();
  });

  afterEach(async () => {
    setRedisClient(null);
    db.setPool(null);
    if (pool) await pool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    pool = null;
  });

  afterAll(async () => {
    if (adminPool) await adminPool.end();
  });

  test('booking, tickets, check-in and audit survive PostgreSQL reconnects; retention blocks early deletion', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    const booking = await confirmBooking({ userId, holdId: hold.holdId });
    const [ticket] = booking.tickets;
    expect(booking.status).toBe('CONFIRMED');
    expect(ticket.ticketStatus).toBe('VALID');

    db.setPool(null);
    await pool.end();
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
    });
    db.setPool(pool);
    clearTickets();

    const pass = await getAttendeePass({
      ticketId: ticket.ticketId,
      requestingUser: { userId, role: 'ATTENDEE' },
    });
    expect(pass.success).toBe(true);

    const checkedIn = await request(app)
      .post('/api/checkin/verify')
      .set('Authorization', `Bearer ${gateToken}`)
      .send({
        qrData: pass.pass.qrData,
        eventId,
        ticketStatus: 'CANCELLED',
        bookingConfirmationStatus: 'PENDING',
      });
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body.data.ticketId).toBe(ticket.ticketId);

    const duplicate = await request(app)
      .post('/api/checkin/verify')
      .set('Authorization', `Bearer ${gateToken}`)
      .send({
        qrData: pass.pass.qrData,
        eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('DUPLICATE_ENTRY');

    db.setPool(null);
    await pool.end();
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
    });
    db.setPool(pool);

    const persistedCheckIn = await getPersistentCheckInRecord(ticket.ticketId);
    expect(persistedCheckIn).toMatchObject({
      ticketId: ticket.ticketId,
      eventId,
      userId,
      scannedBy: gateId,
    });
    const retainedRecords = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM bookings WHERE id = $1) AS bookings,
         (SELECT count(*)::int FROM tickets WHERE id = $2) AS tickets,
         (SELECT count(*)::int FROM check_in_logs WHERE ticket_id = $2) AS check_ins,
         (SELECT count(*)::int FROM audit_log
           WHERE (action = 'BOOKING_CONFIRMED' AND target = $1)
              OR (action = 'CHECK_IN_ACCEPTED' AND target = $2)
              OR (action = 'CHECK_IN_REJECTED' AND target = $2)) AS audit_events`,
      [booking.id, ticket.ticketId]
    );
    expect(retainedRecords.rows[0]).toEqual({
      bookings: 1,
      tickets: 1,
      check_ins: 1,
      audit_events: 3,
    });

    const { runMigrations } = require('../src/config/migration-runner');
    expect(await runMigrations({ pool })).toEqual([]);
    expect((await pool.query(
      'SELECT count(*)::int AS count FROM check_in_logs WHERE ticket_id = $1',
      [ticket.ticketId]
    )).rows[0].count).toBe(1);

    for (const [sql, params] of [
      ['DELETE FROM bookings WHERE id = $1', [booking.id]],
      ['DELETE FROM tickets WHERE id = $1', [ticket.ticketId]],
      ['DELETE FROM check_in_logs WHERE ticket_id = $1', [ticket.ticketId]],
      [`DELETE FROM audit_log WHERE target = $1 AND action = 'BOOKING_CONFIRMED'`, [booking.id]],
    ]) {
      await expect(pool.query(sql, params)).rejects.toMatchObject({ code: '23001' });
    }

    await expect(pool.query(
      `UPDATE bookings SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
      [booking.id]
    )).resolves.toMatchObject({ rowCount: 1 });
  });
});
