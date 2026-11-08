process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const request = require('supertest');
const { Pool } = require('pg');
const app = require('../app');
const db = require('../config/db');
const { createToken } = require('../middleware/auth.middleware');
const { setRedisClient } = require('../config/redis');
const UserModel = require('../models/user.model');
const {
  clearTickets,
  getTicketById,
  initializeDefaultTickets,
} = require('./ticket.service');
const {
  HOLD_KEY_PREFIX,
  createHold,
} = require('./booking-hold.service');
const {
  expireDueHolds,
  reconcileRedisHolds,
  runExpiryCycle,
  startHoldExpiryWorker,
  stopHoldExpiryWorker,
} = require('./hold-expiry.worker');

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

class FakeRedis {
  constructor() {
    this.isOpen = true;
    this.entries = new Map();
    this.failSetAfterWrite = false;
    this.failDelete = false;
    this.beforeScan = null;
    this.expireAfterSet = false;
  }

  async set(key, value, options = {}) {
    const now = Date.now();
    if (options.NX && this.entries.has(key) && this.entries.get(key).expiresAt > now) return null;
    if (!Number.isFinite(options.PXAT)) throw new Error('PXAT expiry is required');
    this.entries.set(key, { value, expiresAt: options.PXAT });
    if (this.expireAfterSet) {
      this.expireAfterSet = false;
      jest.spyOn(Date, 'now').mockReturnValue(options.PXAT);
    }
    if (this.failSetAfterWrite) throw new Error('simulated Redis response loss after write');
    return 'OK';
  }

  async del(key) {
    if (this.failDelete) throw new Error('simulated Redis delete failure');
    return Number(this.entries.delete(key));
  }

  async get(key) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async *scanIterator({ MATCH }) {
    if (this.beforeScan) {
      const callback = this.beforeScan;
      this.beforeScan = null;
      await callback();
    }
    const prefix = MATCH.replace(/\*$/, '');
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= Date.now()) {
        this.entries.delete(key);
      } else if (key.startsWith(prefix)) {
        yield key;
      }
    }
  }
}

describePostgres('FR-008/FR-009 PostgreSQL and Redis-backed ticket holds', () => {
  let adminPool;
  let pool;
  let redis;
  let schemaName;
  let userId;
  let eventId;
  let tierId;
  let token;
  let otherToken;
  let organizerId;
  let otherUserId;
  let userEmail;

  async function inventory() {
    const { rows } = await pool.query(
      'SELECT quota, sold, reserved FROM ticket_tiers WHERE id = $1',
      [tierId]
    );
    return rows[0];
  }

  async function addExpiredHold(status = 'ACTIVE') {
    const id = `HOLD-EXPIRED-${crypto.randomUUID()}`;
    await pool.query(
      `UPDATE ticket_tiers SET quota = quota + 1, reserved = reserved + 1 WHERE id = $1`,
      [tierId]
    );
    await pool.query(
      `INSERT INTO ticket_holds
        (id, user_id, event_id, tier_id, quantity, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, 1, $5, now() - interval '11 minutes', now() - interval '1 minute')`,
      [id, userId, eventId, tierId, status]
    );
    return id;
  }

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  beforeEach(async () => {
    schemaName = `passpulse_holds_${process.pid}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
      max: 40,
    });
    db.setPool(pool);
    await pool.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    const { runMigrations } = require('../config/migration-runner');
    await runMigrations({ pool });
    redis = new FakeRedis();
    setRedisClient(redis);
    organizerId = `USR-ORG-${crypto.randomUUID()}`;
    userId = `USR-ATT-${crypto.randomUUID()}`;
    userEmail = `${crypto.randomUUID()}@test.io`;
    eventId = `EVT-${crypto.randomUUID()}`;
    tierId = `TIER-${crypto.randomUUID()}`;

    await UserModel.clearAll();
    await UserModel.create({
      id: userId,
      fullName: 'Hold Test Attendee',
      email: userEmail,
      passwordHash: 'test-hash',
      role: 'ATTENDEE',
    });
    token = createToken({ userId, role: 'ATTENDEE', email: userEmail });
    otherUserId = `USR-ATT-${crypto.randomUUID()}`;
    otherToken = createToken({
      userId: otherUserId,
      role: 'ATTENDEE',
      email: `${otherUserId}@test.io`,
    });

    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       VALUES ($1, 'Hold Test Organizer', $2, 'test-hash', 'ORGANIZER'),
              ($3, 'Hold Test Attendee', $4, 'test-hash', 'ATTENDEE'),
              ($5, 'Other Attendee', $6, 'test-hash', 'ATTENDEE')`,
      [organizerId, `${organizerId}@test.io`, userId, userEmail, otherUserId, `${otherUserId}@test.io`]
    );
    await pool.query(
      `INSERT INTO events
        (id, organizer_id, title, description, category, venue, event_date, capacity, status)
       VALUES ($1, $2, 'Hold Test Event', '', 'Test', 'Hall', now() + interval '1 day', 10, 'PUBLISHED')`,
      [eventId, organizerId]
    );
    await pool.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota, max_per_order)
       VALUES ($1, $2, 'General', 100, 1, 5)`,
      [tierId, eventId]
    );
    clearTickets();
    initializeDefaultTickets();
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

  test('POST /api/bookings/hold persists a 600-second hold and sets Redis absolute expiry', async () => {
    const response = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventId, tierId, quantity: 1 });

    expect(response.status).toBe(201);
    expect(response.body.hold).toMatchObject({
      eventId,
      tierId,
      quantity: 1,
      status: 'ACTIVE',
      expiresInSeconds: 600,
    });
    const { holdId, createdAt, expiresAt } = response.body.hold;
    expect(new Date(expiresAt).getTime() - new Date(createdAt).getTime()).toBe(600000);
    expect(redis.entries.get(`${HOLD_KEY_PREFIX}${holdId}`).expiresAt).toBe(new Date(expiresAt).getTime());
    expect(await inventory()).toMatchObject({ quota: 1, sold: 0, reserved: 1 });
    const { rows } = await pool.query('SELECT user_id, event_id, tier_id, quantity, status FROM ticket_holds WHERE id = $1', [holdId]);
    expect(rows[0]).toMatchObject({ user_id: userId, event_id: eventId, tier_id: tierId, quantity: 1, status: 'ACTIVE' });
  });

  test('rejects invalid requests, missing authentication, and unavailable inventory', async () => {
    const invalid = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventId, tierId, quantity: 1.5 });
    expect(invalid.status).toBe(400);

    const unauthenticated = await request(app)
      .post('/api/bookings/hold')
      .send({ eventId, tierId, quantity: 1 });
    expect(unauthenticated.status).toBe(401);

    const held = await createHold({ userId, eventId, tierId, quantity: 1 });
    expect(held.holdId).toBeTruthy();
    const unavailable = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventId, tierId, quantity: 1 });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.code).toBe('INSUFFICIENT_INVENTORY');
    expect(await inventory()).toMatchObject({ quota: 1, sold: 0, reserved: 1 });
  });

  test('validates hold inputs, mirrored references, and active account status', async () => {
    const invalidRequests = [
      { userId: null, eventId, tierId, quantity: 1 },
      { userId, eventId: null, tierId, quantity: 1 },
      { userId, eventId: ' ', tierId, quantity: 1 },
      { userId, eventId, tierId: null, quantity: 1 },
      { userId, eventId, tierId: ' ', quantity: 1 },
      { userId, eventId, tierId, quantity: 1.5 },
      { userId, eventId, tierId, quantity: 0 },
    ];
    for (const requestData of invalidRequests) {
      await expect(createHold(requestData)).rejects.toMatchObject({
        status: requestData.userId ? 400 : 401,
        code: requestData.userId ? 'INVALID_HOLD_REQUEST' : 'UNAUTHENTICATED',
      });
    }

    await expect(createHold({
      userId: `USR-MISSING-${crypto.randomUUID()}`,
      eventId,
      tierId,
      quantity: 1,
    })).rejects.toMatchObject({ status: 401, code: 'USER_NOT_FOUND' });

    await expect(createHold({
      userId,
      eventId: `EVT-MISSING-${crypto.randomUUID()}`,
      tierId,
      quantity: 1,
    })).rejects.toMatchObject({ status: 404, code: 'EVENT_NOT_FOUND' });

    await expect(createHold({
      userId,
      eventId,
      tierId: `TIER-MISSING-${crypto.randomUUID()}`,
      quantity: 1,
    })).rejects.toMatchObject({ status: 404, code: 'TIER_NOT_FOUND' });

    await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);
    await expect(createHold({ userId, eventId, tierId, quantity: 1 }))
      .rejects.toMatchObject({ status: 403, code: 'ACCOUNT_DEACTIVATED' });
  });

  test('rejects holds for unpublished or flagged events and over-limit quantities', async () => {
    await pool.query('UPDATE events SET status = $2 WHERE id = $1', [eventId, 'DRAFT']);
    await expect(createHold({ userId, eventId, tierId, quantity: 1 }))
      .rejects.toMatchObject({ status: 409, code: 'EVENT_NOT_ON_SALE' });

    await pool.query(
      'UPDATE events SET status = $2, is_flagged = TRUE WHERE id = $1',
      [eventId, 'PUBLISHED']
    );
    await expect(createHold({ userId, eventId, tierId, quantity: 1 }))
      .rejects.toMatchObject({ status: 409, code: 'EVENT_NOT_ON_SALE' });

    await pool.query('UPDATE events SET is_flagged = FALSE WHERE id = $1', [eventId]);
    await expect(createHold({ userId, eventId, tierId, quantity: 6 }))
      .rejects.toMatchObject({ status: 400, code: 'ORDER_LIMIT_EXCEEDED' });
  });

  test('NFR-003: one of 200 distinct attendees reserves the only available seat', async () => {
    const attendees = Array.from({ length: 200 }, () => {
      const id = `USR-NFR003-${crypto.randomUUID()}`;
      return {
        id,
        token: createToken({ userId: id, role: 'ATTENDEE', email: `${id}@test.io` }),
      };
    });
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       SELECT user_id, 'NFR-003 Attendee', user_id || '@test.io', 'test-hash', 'ATTENDEE'
       FROM unnest($1::text[]) AS users(user_id)`,
      [attendees.map((attendee) => attendee.id)]
    );

    const startedAt = performance.now();
    const timedResponses = await Promise.all(attendees.map((attendee) => {
      const requestStartedAt = performance.now();
      return request(app)
        .post('/api/bookings/hold')
        .set('Authorization', `Bearer ${attendee.token}`)
        .send({ eventId, tierId, quantity: 1 })
        .then((response) => ({
          response,
          durationMs: performance.now() - requestStartedAt,
          userId: attendee.id,
        }));
    }));
    const totalDurationMs = performance.now() - startedAt;
    const successes = timedResponses.filter(({ response }) => response.status === 201);
    const conflicts = timedResponses.filter(({ response }) => response.status === 409);
    const unexpected = timedResponses.filter(
      ({ response }) => response.status !== 201 && response.status !== 409
    );
    const averageRequestDurationMs = timedResponses.reduce(
      (total, result) => total + result.durationMs,
      0
    ) / timedResponses.length;

    expect(timedResponses).toHaveLength(200);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(199);
    expect(unexpected).toEqual([]);
    expect(successes[0].response.body.hold).toMatchObject({
      eventId,
      tierId,
      quantity: 1,
      status: 'ACTIVE',
    });

    const inventoryState = await pool.query(
      `SELECT quota, sold, reserved, quota - sold - reserved AS available
       FROM ticket_tiers WHERE id = $1 AND event_id = $2`,
      [tierId, eventId]
    );
    expect(inventoryState.rows[0]).toMatchObject({
      quota: 1,
      sold: 0,
      reserved: 1,
      available: 0,
    });
    const activeHolds = await pool.query(
      `SELECT count(*)::integer AS count,
              COALESCE(sum(quantity), 0)::integer AS quantity,
              count(DISTINCT user_id)::integer AS distinct_users
       FROM ticket_holds
       WHERE event_id = $1 AND tier_id = $2 AND status = 'ACTIVE'`,
      [eventId, tierId]
    );
    expect(activeHolds.rows[0]).toEqual({ count: 1, quantity: 1, distinct_users: 1 });
    const duplicateReservations = await pool.query(
      `SELECT count(*)::integer AS count
       FROM (
         SELECT tier_id FROM ticket_holds
         WHERE event_id = $1 AND tier_id = $2 AND status = 'ACTIVE'
         GROUP BY tier_id
         HAVING count(*) > 1 OR sum(quantity) > 1
       ) AS duplicate_active_reservations`,
      [eventId, tierId]
    );
    expect(duplicateReservations.rows[0].count).toBe(0);

    console.info('NFR-003 measured results:', JSON.stringify({
      totalRequests: timedResponses.length,
      successes: successes.length,
      conflicts: conflicts.length,
      unexpectedErrors: unexpected.length,
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
      averageRequestDurationMs: Number(averageRequestDurationMs.toFixed(2)),
    }));

    const winner = attendees.find((attendee) => attendee.id === successes[0].userId);
    const repeatRequest = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${winner.token}`)
      .send({ eventId, tierId, quantity: 1 });
    expect(repeatRequest.status).toBe(409);
    expect((await inventory()).reserved).toBe(1);

    const winnerHoldId = successes[0].response.body.hold.holdId;
    await pool.query(
      `UPDATE ticket_holds SET expires_at = created_at + INTERVAL '1 millisecond'
       WHERE id = $1`,
      [winnerHoldId]
    );
    const firstExpiryCycle = await runExpiryCycle({ pool, redis: async () => redis });
    const secondExpiryCycle = await runExpiryCycle({ pool, redis: async () => redis });
    expect(firstExpiryCycle).toContain(winnerHoldId);
    expect(secondExpiryCycle).not.toContain(winnerHoldId);
    expect((await inventory()).reserved).toBe(0);
    expect((await pool.query(
      'SELECT status FROM ticket_holds WHERE id = $1',
      [winnerHoldId]
    )).rows[0].status).toBe('EXPIRED');

    const replacement = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${attendees[1].token}`)
      .send({ eventId, tierId, quantity: 1 });
    expect(replacement.status).toBe(201);
    expect((await inventory()).reserved).toBe(1);
    const finalActiveHolds = await pool.query(
      `SELECT count(*)::integer AS count, COALESCE(sum(quantity), 0)::integer AS quantity
       FROM ticket_holds WHERE event_id = $1 AND tier_id = $2 AND status = 'ACTIVE'`,
      [eventId, tierId]
    );
    expect(finalActiveHolds.rows[0]).toEqual({ count: 1, quantity: 1 });
  });

  test('compensates PostgreSQL when the Redis write succeeds but its response fails', async () => {
    redis.failSetAfterWrite = true;
    redis.failDelete = true;
    const result = await request(app)
      .post('/api/bookings/hold')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventId, tierId, quantity: 1 });

    expect(result.status).toBe(503);
    expect((await inventory()).reserved).toBe(0);
    const holds = await pool.query('SELECT status FROM ticket_holds WHERE event_id = $1', [eventId]);
    expect(holds.rows).toHaveLength(1);
    expect(holds.rows[0].status).toBe('RELEASED');
    expect(redis.entries.size).toBe(1);

    redis.failDelete = false;
    await runExpiryCycle({ pool, redis: async () => redis });
    expect(redis.entries.size).toBe(0);
  });

  test('does not report success if Redis publication finishes after the hold deadline', async () => {
    redis.expireAfterSet = true;
    try {
      const response = await request(app)
        .post('/api/bookings/hold')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventId, tierId, quantity: 1 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('HOLD_EXPIRED');
      expect((await inventory()).reserved).toBe(0);
      const holds = await pool.query('SELECT status FROM ticket_holds WHERE event_id = $1', [eventId]);
      expect(holds.rows[0].status).toBe('RELEASED');
    } finally {
      jest.restoreAllMocks();
    }
  });

  test('recovers active Redis keys and expires durable holds exactly once', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    redis.entries.clear();
    expect(await reconcileRedisHolds(pool, redis)).toBe(1);
    expect(await redis.get(`${HOLD_KEY_PREFIX}${hold.holdId}`)).toBeTruthy();

    const expiredId = await addExpiredHold();
    const first = await expireDueHolds(pool);
    const second = await expireDueHolds(pool);
    expect(first).toContain(expiredId);
    expect(second).not.toContain(expiredId);
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [expiredId])).rows[0].status).toBe('EXPIRED');
    expect((await inventory()).reserved).toBe(1);
  });

  test('does not delete a hold published while Redis reconciliation is scanning', async () => {
    const concurrentId = `HOLD-CONCURRENT-${crypto.randomUUID()}`;
    redis.beforeScan = async () => {
      await pool.query('UPDATE ticket_tiers SET reserved = reserved + 1 WHERE id = $1', [tierId]);
      await pool.query(
        `INSERT INTO ticket_holds
          (id, user_id, event_id, tier_id, quantity, status, expires_at)
         VALUES ($1, $2, $3, $4, 1, 'ACTIVE', now() + interval '10 minutes')`,
        [concurrentId, userId, eventId, tierId]
      );
      await redis.set(`${HOLD_KEY_PREFIX}${concurrentId}`, 'new-active-hold', {
        PXAT: Date.now() + 600000,
      });
    };

    await reconcileRedisHolds(pool, redis);

    expect(await redis.get(`${HOLD_KEY_PREFIX}${concurrentId}`)).toBe('new-active-hold');
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [concurrentId])).rows[0].status).toBe('ACTIVE');
  });

  test('expiry cycle releases expired holds but never releases confirmed holds', async () => {
    const expiredId = await addExpiredHold('ACTIVE');
    const confirmedId = await addExpiredHold('CONFIRMED');
    const expiredRedisKey = `${HOLD_KEY_PREFIX}${expiredId}`;
    const confirmedRedisKey = `${HOLD_KEY_PREFIX}${confirmedId}`;
    await redis.set(expiredRedisKey, 'expired', { PXAT: Date.now() + 600000 });
    await redis.set(confirmedRedisKey, 'confirmed', { PXAT: Date.now() + 600000 });

    await runExpiryCycle({ pool, redis: async () => redis });

    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [expiredId])).rows[0].status).toBe('EXPIRED');
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [confirmedId])).rows[0].status).toBe('CONFIRMED');
    expect(await redis.get(expiredRedisKey)).toBeNull();
    expect(await redis.get(confirmedRedisKey)).toBeNull();
    expect((await inventory()).reserved).toBe(1);
  });

  test('releases due holds after worker restart and reconciles stale Redis keys', async () => {
    const expiredId = await addExpiredHold();
    const staleKey = `${HOLD_KEY_PREFIX}${expiredId}`;
    await redis.set(staleKey, 'stale', { PXAT: Date.now() + 600000 });

    const restartedRedis = new FakeRedis();
    const expired = await runExpiryCycle({ pool, redis: async () => restartedRedis });

    expect(expired).toContain(expiredId);
    expect(await restartedRedis.get(staleKey)).toBeNull();
    expect((await inventory()).reserved).toBe(0);
  });

  test('waits for the active expiry cycle before stopping the worker', async () => {
    let beginCycle;
    let finishCycle;
    const cycleStarted = new Promise((resolve) => {
      beginCycle = resolve;
    });
    const cycleGate = new Promise((resolve) => {
      finishCycle = resolve;
    });
    const workerPool = {
      connect: async () => ({
        query: async (sql) => {
          if (sql === 'BEGIN') {
            beginCycle();
            await cycleGate;
          }
          if (sql.includes('FOR UPDATE SKIP LOCKED')) return { rows: [] };
          return { rows: [] };
        },
        release: () => {},
      }),
      query: async () => ({ rows: [] }),
    };

    startHoldExpiryWorker({ pool: workerPool, redis: async () => redis, intervalMs: 60000 });
    await cycleStarted;
    let stopped = false;
    const stop = stopHoldExpiryWorker().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    expect(stopped).toBe(false);
    finishCycle();
    await stop;
    expect(stopped).toBe(true);
  });

  test('confirms an owned hold atomically and returns trusted-priced tickets usable by the QR API', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId, totalAmount: 0 });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    const booking = response.body.booking;
    expect(booking).toMatchObject({
      id: expect.any(String),
      userId,
      eventId,
      status: 'CONFIRMED',
      totalAmount: '100.00',
    });
    expect(booking.tickets).toHaveLength(1);
    expect(booking.tickets[0]).toMatchObject({
      ticketId: expect.stringMatching(/^TKT-/),
      userId,
      eventId,
      ticketTier: 'General',
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
    });

    const holdRow = await pool.query(
      'SELECT status, booking_id FROM ticket_holds WHERE id = $1',
      [hold.holdId]
    );
    expect(holdRow.rows[0]).toMatchObject({ status: 'CONFIRMED', booking_id: booking.id });
    expect(await inventory()).toMatchObject({ quota: 1, sold: 1, reserved: 0 });
    expect(getTicketById(booking.tickets[0].ticketId)).toBeDefined();

    const pass = await request(app)
      .get(`/api/qr/pass/${booking.tickets[0].ticketId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(pass.status).toBe(200);
    expect(pass.body.data.ticketId).toBe(booking.tickets[0].ticketId);
    expect(pass.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(redis.entries.has(`${HOLD_KEY_PREFIX}${hold.holdId}`)).toBe(false);
  });

  test('requires an authenticated attendee and a holdId for confirmation', async () => {
    const unauthenticated = await request(app)
      .post('/api/bookings/confirm')
      .send({ holdId: 'HOLD-UNKNOWN' });
    expect(unauthenticated.status).toBe(401);

    const invalid = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_CONFIRMATION_REQUEST');

    const missing = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: 'HOLD-NOT-FOUND' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('HOLD_NOT_FOUND');
  });

  test('rejects confirmation by another user and permits the owner', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    const forbidden = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ holdId: hold.holdId });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('HOLD_NOT_OWNED');
    expect((await inventory()).reserved).toBe(1);

    const owner = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });
    expect(owner.status).toBe(200);
  });

  test('expires a due hold during confirmation and releases its inventory once', async () => {
    const expiredId = await addExpiredHold();
    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: expiredId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HOLD_EXPIRED');
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [expiredId])).rows[0].status).toBe('EXPIRED');
    expect(await inventory()).toMatchObject({ sold: 0, reserved: 0 });
    expect((await pool.query('SELECT count(*)::int AS count FROM bookings')).rows[0].count).toBe(0);
  });

  test.each(['RELEASED', 'CANCELLED'])('rejects a %s hold without changing inventory', async (status) => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    await pool.query('UPDATE ticket_tiers SET reserved = reserved - 1 WHERE id = $1', [tierId]);
    await pool.query('UPDATE ticket_holds SET status = $2 WHERE id = $1', [hold.holdId, status]);

    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HOLD_NOT_ACTIVE');
    expect(await inventory()).toMatchObject({ sold: 0, reserved: 0 });
  });

  test('rejects confirmation when the event is no longer on sale', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    await pool.query("UPDATE events SET status = 'CANCELLED' WHERE id = $1", [eventId]);

    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EVENT_NOT_ON_SALE');
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [hold.holdId])).rows[0].status).toBe('ACTIVE');
    expect(await inventory()).toMatchObject({ sold: 0, reserved: 1 });
  });

  test('converts the full held quantity and prices all tickets from the database tier', async () => {
    await pool.query('UPDATE ticket_tiers SET quota = 2 WHERE id = $1', [tierId]);
    const hold = await createHold({ userId, eventId, tierId, quantity: 2 });
    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId, amount: 0 });

    expect(response.status).toBe(200);
    expect(response.body.booking.totalAmount).toBe('200.00');
    expect(response.body.booking.tickets).toHaveLength(2);
    expect(await inventory()).toMatchObject({ quota: 2, sold: 2, reserved: 0 });
  });

  test('makes repeated confirmation and two concurrent confirmations idempotent', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    const sendConfirmation = () => request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });

    const [first, concurrent] = await Promise.all([sendConfirmation(), sendConfirmation()]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    expect(first.body.booking.id).toBe(concurrent.body.booking.id);
    expect(first.body.booking.tickets.map((ticket) => ticket.ticketId))
      .toEqual(concurrent.body.booking.tickets.map((ticket) => ticket.ticketId));

    const retry = await sendConfirmation();
    expect(retry.status).toBe(200);
    expect(retry.body.booking.id).toBe(first.body.booking.id);
    expect((await pool.query('SELECT count(*)::int AS count FROM bookings')).rows[0].count).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS count FROM tickets')).rows[0].count).toBe(1);
    expect(await inventory()).toMatchObject({ sold: 1, reserved: 0 });
  });

  test('rolls back booking, tickets, hold status and inventory when ticket creation fails', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    await pool.query(`
      CREATE FUNCTION reject_test_ticket_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'simulated ticket insert failure';
      END;
      $$;
      CREATE TRIGGER reject_test_ticket_insert
      BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION reject_test_ticket_insert();
    `);

    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });

    expect(response.status).toBe(500);
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [hold.holdId])).rows[0].status).toBe('ACTIVE');
    expect((await pool.query('SELECT count(*)::int AS count FROM bookings')).rows[0].count).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS count FROM tickets')).rows[0].count).toBe(0);
    expect(await inventory()).toMatchObject({ sold: 0, reserved: 1 });
  });

  test('keeps a committed booking when Redis cleanup fails and reconciliation removes the stale key', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    redis.failDelete = true;
    const response = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });

    expect(response.status).toBe(200);
    expect((await pool.query('SELECT status FROM ticket_holds WHERE id = $1', [hold.holdId])).rows[0].status).toBe('CONFIRMED');
    expect(redis.entries.has(`${HOLD_KEY_PREFIX}${hold.holdId}`)).toBe(true);

    redis.failDelete = false;
    await runExpiryCycle({ pool, redis: async () => redis });
    expect(redis.entries.has(`${HOLD_KEY_PREFIX}${hold.holdId}`)).toBe(false);
  });

  test('restores persisted tickets to the attendee pass, ticket list, and check-in flows', async () => {
    const hold = await createHold({ userId, eventId, tierId, quantity: 1 });
    const confirmation = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: hold.holdId });
    expect(confirmation.status).toBe(200);
    const [ticket] = confirmation.body.booking.tickets;

    clearTickets();
    const pass = await request(app)
      .get(`/api/qr/pass/${ticket.ticketId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(pass.status).toBe(200);

    clearTickets();
    const tickets = await request(app)
      .get('/api/qr/tickets')
      .set('Authorization', `Bearer ${token}`);
    expect(tickets.status).toBe(200);
    expect(tickets.body.data.map((item) => item.ticketId)).toContain(ticket.ticketId);

    clearTickets();
    const gateToken = createToken({ userId: 'USR-GATE-TEST', role: 'GATE_STAFF' });
    const checkin = await request(app)
      .post('/api/checkin/verify')
      .set('Authorization', `Bearer ${gateToken}`)
      .send({
        qrData: pass.body.data.qrData,
        eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });
    expect(checkin.status).toBe(200);
    expect(checkin.body.data.ticketId).toBe(ticket.ticketId);
  });
});
