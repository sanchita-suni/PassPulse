process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { Pool } = require('pg');
const app = require('../app');
const db = require('../config/db');
const { createToken } = require('../middleware/auth.middleware');
const { setRedisClient } = require('../config/redis');
const { HOLD_KEY_PREFIX } = require('./booking-hold.service');
const { runExpiryCycle } = require('./hold-expiry.worker');

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

class FakeRedis {
  constructor() {
    this.isOpen = true;
    this.entries = new Map();
    this.failSetOnce = false;
  }

  async set(key, value, options = {}) {
    if (this.failSetOnce) {
      this.failSetOnce = false;
      throw new Error('simulated Redis unavailability');
    }
    this.entries.set(key, { value, expiresAt: options.PXAT });
    return 'OK';
  }

  async del(key) {
    return Number(this.entries.delete(key));
  }

  async *scanIterator({ MATCH }) {
    const prefix = MATCH.replace(/\*$/, '');
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > Date.now() && key.startsWith(prefix)) yield key;
    }
  }
}

describePostgres('FR-015/FR-016 PostgreSQL FIFO waitlist and claims', () => {
  let adminPool;
  let pool;
  let redis;
  let schemaName;
  let organizerId;
  let eventId;
  let tierId;
  let attendees;

  function auth(userId) {
    const attendee = attendees.find((item) => item.id === userId);
    return `Bearer ${createToken({
      userId,
      role: 'ATTENDEE',
      email: attendee.email,
    })}`;
  }

  async function join(userIndex, quantity = 1) {
    return request(app)
      .post('/api/bookings/waitlist')
      .set('Authorization', auth(attendees[userIndex].id))
      .send({ eventId, tierId, quantity });
  }

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  beforeEach(async () => {
    schemaName = `passpulse_waitlist_${process.pid}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
      max: 30,
    });
    db.setPool(pool);
    await pool.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    const { runMigrations } = require('../config/migration-runner');
    await runMigrations({ pool });
    redis = new FakeRedis();
    setRedisClient(redis);

    organizerId = `USR-ORG-${crypto.randomUUID()}`;
    eventId = `EVT-${crypto.randomUUID()}`;
    tierId = `TIER-${crypto.randomUUID()}`;
    attendees = Array.from({ length: 3 }, (_, index) => ({
      id: `USR-ATT-${crypto.randomUUID()}`,
      email: `attendee-${index}-${crypto.randomUUID()}@test.io`,
    }));
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       VALUES ($1, 'Organizer', $2, 'test-hash', 'ORGANIZER'),
              ($3, 'Attendee 1', $4, 'test-hash', 'ATTENDEE'),
              ($5, 'Attendee 2', $6, 'test-hash', 'ATTENDEE'),
              ($7, 'Attendee 3', $8, 'test-hash', 'ATTENDEE')`,
      [
        organizerId, `${organizerId}@test.io`,
        attendees[0].id, attendees[0].email,
        attendees[1].id, attendees[1].email,
        attendees[2].id, attendees[2].email,
      ]
    );
    await pool.query(
      `INSERT INTO events
        (id, organizer_id, title, description, category, venue, event_date, capacity, status)
       VALUES ($1, $2, 'Waitlist Event', '', 'Test', 'Hall', now() + interval '1 day', 3, 'PUBLISHED')`,
      [eventId, organizerId]
    );
    await pool.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota, sold, max_per_order)
       VALUES ($1, $2, 'General', 25, 1, 1, 3)`,
      [tierId, eventId]
    );
  });

  afterEach(async () => {
    setRedisClient(null);
    db.setPool(null);
    if (pool) await pool.end();
    if (adminPool && schemaName) await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    pool = null;
  });

  afterAll(async () => {
    if (adminPool) await adminPool.end();
  });

  test('joins in database FIFO order and rejects a duplicate active entry', async () => {
    const first = await join(0);
    const second = await join(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.waitlist.position).toBe(1);
    expect(second.body.waitlist.position).toBe(2);
    expect(BigInt(first.body.waitlist.entry.queue_position))
      .toBeLessThan(BigInt(second.body.waitlist.entry.queue_position));

    const duplicate = await join(0);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('ACTIVE_WAITLIST_ENTRY_EXISTS');

    const concurrent = await Promise.all([join(2), join(2)]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);

    const invalid = await request(app)
      .post('/api/bookings/waitlist')
      .set('Authorization', auth(attendees[2].id))
      .send({ eventId, tierId, quantity: 0 });
    expect(invalid.status).toBe(400);
  });

  test('allocates released inventory FIFO and expires a claim once before reallocating', async () => {
    const first = await join(0);
    const second = await join(1);
    await pool.query('UPDATE ticket_tiers SET sold = 0 WHERE id = $1', [tierId]);
    await runExpiryCycle({ pool, redis: async () => redis });

    const claims = await pool.query(
      `SELECT claim.id, claim.status, claim.created_at, claim.expires_at,
              entry.user_id, entry.status AS entry_status
       FROM waitlist_claims AS claim
       JOIN waitlist_entries AS entry ON entry.id = claim.waitlist_entry_id
       ORDER BY entry.queue_position`
    );
    expect(claims.rows).toHaveLength(1);
    expect(claims.rows[0].user_id).toBe(attendees[0].id);
    expect(claims.rows[0].entry_status).toBe('CLAIMED');
    expect(new Date(claims.rows[0].expires_at).getTime()
      - new Date(claims.rows[0].created_at).getTime()).toBe(15 * 60 * 1000);
    expect(first.body.waitlist.entry.status).toBe('WAITING');
    expect(second.body.waitlist.entry.status).toBe('WAITING');

    await pool.query(
      `UPDATE waitlist_claims
       SET expires_at = created_at + interval '1 millisecond'
       WHERE id = $1`,
      [claims.rows[0].id]
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await runExpiryCycle({ pool, redis: async () => redis });
    await runExpiryCycle({ pool, redis: async () => redis });

    const finalClaims = await pool.query(
      `SELECT claim.status, claim.user_id, entry.status AS entry_status
       FROM waitlist_claims AS claim
       JOIN waitlist_entries AS entry ON entry.id = claim.waitlist_entry_id
       ORDER BY entry.queue_position`
    );
    expect(finalClaims.rows).toEqual([
      expect.objectContaining({ status: 'EXPIRED', user_id: attendees[0].id, entry_status: 'EXPIRED' }),
      expect.objectContaining({ status: 'ACTIVE', user_id: attendees[1].id, entry_status: 'CLAIMED' }),
    ]);
    expect((await pool.query('SELECT reserved FROM ticket_tiers WHERE id = $1', [tierId])).rows[0].reserved).toBe(1);
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM notifications
       WHERE user_id = $1 AND notification_type = 'CLAIM_EXPIRED'`,
      [attendees[0].id]
    )).rows[0].count).toBe(1);
  });

  test('accepts a claim once, exposes its notification, and confirms through the ticket flow', async () => {
    await pool.query('UPDATE ticket_tiers SET sold = 0 WHERE id = $1', [tierId]);
    const joined = await join(0);
    expect(joined.body.waitlist.entry.status).toBe('CLAIMED');
    const claimId = joined.body.waitlist.claims[0].id;

    const notificationResponse = await request(app)
      .get('/api/bookings/notifications')
      .set('Authorization', auth(attendees[0].id));
    expect(notificationResponse.status).toBe(200);
    expect(notificationResponse.body.notifications[0]).toMatchObject({
      type: 'CLAIM_AVAILABLE',
      claim: { id: claimId, status: 'ACTIVE', event: { id: eventId }, tier: { id: tierId } },
    });

    const wrongOwner = await request(app)
      .post(`/api/bookings/claims/${claimId}/accept`)
      .set('Authorization', auth(attendees[1].id))
      .send({});
    expect(wrongOwner.status).toBe(403);

    const redisError = jest.spyOn(console, 'error').mockImplementation(() => {});
    redis.failSetOnce = true;
    const acceptResponses = await Promise.all([
      request(app).post(`/api/bookings/claims/${claimId}/accept`).set('Authorization', auth(attendees[0].id)).send({}),
      request(app).post(`/api/bookings/claims/${claimId}/accept`).set('Authorization', auth(attendees[0].id)).send({}),
    ]);
    expect(acceptResponses.map((response) => response.status)).toEqual([200, 200]);
    expect(acceptResponses[0].body.claim.hold.holdId)
      .toBe(acceptResponses[1].body.claim.hold.holdId);
    const holdId = acceptResponses[0].body.claim.hold.holdId;
    expect(redis.entries.has(`${HOLD_KEY_PREFIX}${holdId}`)).toBe(false);
    await runExpiryCycle({ pool, redis: async () => redis });
    expect(redis.entries.has(`${HOLD_KEY_PREFIX}${holdId}`)).toBe(true);
    redisError.mockRestore();
    expect(new Date(acceptResponses[0].body.claim.hold.expiresAt).getTime()
      - new Date(acceptResponses[0].body.claim.hold.createdAt).getTime()).toBe(600000);
    expect((await pool.query(
      'SELECT count(*)::int AS count FROM ticket_holds WHERE id = $1',
      [holdId]
    )).rows[0].count).toBe(1);

    const confirmation = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', auth(attendees[0].id))
      .send({ holdId });
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.booking.tickets).toHaveLength(1);
    expect((await pool.query(
      `SELECT tier.sold, tier.reserved, entry.status
       FROM ticket_tiers AS tier
       JOIN waitlist_entries AS entry ON entry.id = $2
       WHERE tier.id = $1`,
      [tierId, joined.body.waitlist.entry.id]
    )).rows[0]).toMatchObject({ sold: 1, reserved: 0, status: 'FULFILLED' });
  });

  test('declining an active claim immediately reallocates its reserved inventory', async () => {
    await pool.query('UPDATE ticket_tiers SET sold = 0 WHERE id = $1', [tierId]);
    const first = await join(0);
    await join(1);
    const claimId = first.body.waitlist.claims[0].id;
    const declined = await request(app)
      .post(`/api/bookings/claims/${claimId}/decline`)
      .set('Authorization', auth(attendees[0].id))
      .send({});

    expect(declined.status).toBe(200);
    const claims = await pool.query(
      `SELECT claim.status, claim.user_id
       FROM waitlist_claims AS claim
       ORDER BY claim.created_at`
    );
    expect(claims.rows).toEqual([
      { status: 'DECLINED', user_id: attendees[0].id },
      { status: 'ACTIVE', user_id: attendees[1].id },
    ]);
    expect((await pool.query('SELECT reserved FROM ticket_tiers WHERE id = $1', [tierId])).rows[0].reserved).toBe(1);
  });

  test('recovers an expired waitlist booking hold and offers its inventory to the next attendee', async () => {
    await pool.query('UPDATE ticket_tiers SET sold = 0 WHERE id = $1', [tierId]);
    const first = await join(0);
    const second = await join(1);
    const claimId = first.body.waitlist.claims[0].id;
    const accepted = await request(app)
      .post(`/api/bookings/claims/${claimId}/accept`)
      .set('Authorization', auth(attendees[0].id))
      .send({});
    expect(accepted.status).toBe(200);
    const holdId = accepted.body.claim.hold.holdId;

    await pool.query(
      `UPDATE ticket_holds
       SET expires_at = created_at + interval '1 millisecond'
       WHERE id = $1`,
      [holdId]
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await runExpiryCycle({ pool, redis: async () => redis });
    await runExpiryCycle({ pool, redis: async () => redis });

    const records = await pool.query(
      `SELECT hold.status AS hold_status, first_entry.status AS first_status,
              second_claim.status AS second_claim_status,
              tier.reserved
       FROM ticket_holds AS hold
       JOIN waitlist_entries AS first_entry ON first_entry.id = $2
       JOIN waitlist_entries AS second_entry ON second_entry.id = $3
       JOIN ticket_tiers AS tier ON tier.id = hold.tier_id
       JOIN waitlist_claims AS second_claim ON second_claim.waitlist_entry_id = second_entry.id
       WHERE hold.id = $1`,
      [holdId, first.body.waitlist.entry.id, second.body.waitlist.entry.id]
    );
    expect(records.rows[0]).toMatchObject({
      hold_status: 'EXPIRED',
      first_status: 'EXPIRED',
      second_claim_status: 'ACTIVE',
      reserved: 1,
    });
    expect((await pool.query(
      `SELECT count(*)::int AS count FROM waitlist_claims WHERE waitlist_entry_id = $1`,
      [second.body.waitlist.entry.id]
    )).rows[0].count).toBe(1);
  });
});
