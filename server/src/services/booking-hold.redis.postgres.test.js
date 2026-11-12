const crypto = require('crypto');
const { performance } = require('perf_hooks');
const db = require('../config/db');
const {
  connectRedis,
  closeRedis,
} = require('../config/redis');
const {
  createPostgresTestDatabase,
} = require('../../tests/helpers/postgres-test-database');
const {
  HOLD_KEY_PREFIX,
  createHold,
} = require('./booking-hold.service');
const {
  reconcileRedisHolds,
  runExpiryCycle,
} = require('./hold-expiry.worker');

const describeRealPostgresAndRedis = process.env.TEST_DATABASE_URL && process.env.REDIS_URL
  ? describe
  : describe.skip;

describeRealPostgresAndRedis('PostgreSQL and Redis ticket hold integration', () => {
  let cleanupTestDatabase;
  let pool;
  let redis;
  const holdKeys = new Set();

  async function createFixture({ quota, attendeeCount = 1 }) {
    const organizerId = `USR-ORG-${crypto.randomUUID()}`;
    const userIds = Array.from({ length: attendeeCount }, () => `USR-ATT-${crypto.randomUUID()}`);
    const eventId = `EVT-${crypto.randomUUID()}`;
    const tierId = `TIER-${crypto.randomUUID()}`;

    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       VALUES ($1, 'Organizer', $2, 'test', 'ORGANIZER')`,
      [organizerId, `${organizerId}@test.invalid`]
    );
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       SELECT id, 'Attendee', id || '@test.invalid', 'test', 'ATTENDEE'
       FROM unnest($1::text[]) AS attendee_ids(id)`,
      [userIds]
    );
    await pool.query(
      `INSERT INTO events
        (id, organizer_id, title, category, venue, event_date, capacity, status)
       VALUES ($1, $2, 'Redis integration', 'Test', 'Test Hall',
               now() + interval '1 day', $3, 'PUBLISHED')`,
      [eventId, organizerId, quota]
    );
    await pool.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota)
       VALUES ($1, $2, 'General', 10, $3)`,
      [tierId, eventId, quota]
    );
    return { organizerId, userIds, eventId, tierId };
  }

  async function createTrackedHold(input) {
    const hold = await createHold(input);
    const key = `${HOLD_KEY_PREFIX}${hold.holdId}`;
    holdKeys.add(key);
    return { hold, key };
  }

  beforeAll(async () => {
    const testDatabaseName = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
    if (!/(^|[_-])test([_-]|$)/i.test(testDatabaseName) || testDatabaseName === 'passpulse_db') {
      throw new Error('Real-service tests require a dedicated database with "test" in its name');
    }
    const redisDatabase = new URL(process.env.REDIS_URL).pathname.slice(1);
    if (redisDatabase !== '15') {
      throw new Error('Real-service tests require isolated Redis database 15');
    }

    cleanupTestDatabase = await createPostgresTestDatabase();
    pool = db.getPool();
    redis = await connectRedis();
  }, 30000);

  afterAll(async () => {
    const cleanupErrors = [];
    try {
      if (redis) {
        await Promise.all([...holdKeys].map((key) => redis.del(key)));
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await closeRedis();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (cleanupTestDatabase) await cleanupTestDatabase();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, 'Real-service integration cleanup failed');
    }
  }, 30000);

  test('uses the 600-second Redis TTL and reconciles an expired Redis projection from PostgreSQL', async () => {
    const { userIds, eventId, tierId } = await createFixture({ quota: 1 });
    const { hold, key } = await createTrackedHold({
      userId: userIds[0],
      eventId,
      tierId,
      quantity: 1,
    });

    const storedHold = await redis.get(key);
    expect(JSON.parse(storedHold)).toMatchObject({
      id: hold.holdId,
      user_id: userIds[0],
      event_id: eventId,
      tier_id: tierId,
      quantity: 1,
      status: 'ACTIVE',
    });
    const initialTtl = await redis.pTTL(key);
    expect(initialTtl).toBeLessThanOrEqual(600000);
    expect(initialTtl).toBeGreaterThan(599000);

    const persisted = (await pool.query(
      `SELECT ticket_holds.status, ticket_holds.created_at, ticket_holds.expires_at,
              ticket_tiers.quota, ticket_tiers.sold, ticket_tiers.reserved
       FROM ticket_holds
       JOIN ticket_tiers ON ticket_tiers.id = ticket_holds.tier_id
       WHERE ticket_holds.id = $1`,
      [hold.holdId]
    )).rows[0];
    expect(persisted).toMatchObject({
      status: 'ACTIVE',
      quota: 1,
      sold: 0,
      reserved: 1,
    });
    expect(new Date(persisted.expires_at).getTime() - new Date(persisted.created_at).getTime())
      .toBe(600000);

    await redis.pExpire(key, 50);
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(await redis.get(key)).toBeNull();
    await expect(reconcileRedisHolds(pool, redis)).resolves.toBe(1);
    expect(JSON.parse(await redis.get(key))).toMatchObject({ id: hold.holdId, status: 'ACTIVE' });
    expect(await redis.pTTL(key)).toBeGreaterThan(599000);
  }, 30000);

  test('expires a hold once in PostgreSQL and recovers Redis cleanup on a later worker cycle', async () => {
    const { userIds, eventId, tierId } = await createFixture({ quota: 1 });
    const { hold, key } = await createTrackedHold({
      userId: userIds[0],
      eventId,
      tierId,
      quantity: 1,
    });
    await pool.query(
      `UPDATE ticket_holds
       SET expires_at = clock_timestamp() - interval '1 millisecond'
       WHERE id = $1`,
      [hold.holdId]
    );

    const expectedRedisFailure = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(runExpiryCycle({
        pool,
        redis: async () => {
          throw new Error('simulated Redis connection failure');
        },
      })).resolves.toEqual([hold.holdId]);
    } finally {
      expectedRedisFailure.mockRestore();
    }

    expect(await redis.get(key)).not.toBeNull();
    expect((await pool.query(
      `SELECT status FROM ticket_holds WHERE id = $1`,
      [hold.holdId]
    )).rows[0]).toEqual({ status: 'EXPIRED' });
    expect((await pool.query(
      `SELECT reserved FROM ticket_tiers WHERE id = $1`,
      [tierId]
    )).rows[0].reserved).toBe(0);

    await expect(runExpiryCycle({ pool, redis: async () => redis })).resolves.toEqual([]);
    await expect(runExpiryCycle({ pool, redis: async () => redis })).resolves.toEqual([]);
    expect(await redis.get(key)).toBeNull();
    expect((await pool.query(
      `SELECT status FROM ticket_holds WHERE id = $1`,
      [hold.holdId]
    )).rows[0]).toEqual({ status: 'EXPIRED' });
    expect((await pool.query(
      `SELECT reserved FROM ticket_tiers WHERE id = $1`,
      [tierId]
    )).rows[0].reserved).toBe(0);
  }, 30000);

  test('measures 200 concurrent hold requests per second across independent inventories', async () => {
    const requestCount = 200;
    const { organizerId, userIds } = await createFixture({
      quota: 1,
      attendeeCount: requestCount,
    });
    const eventIds = userIds.map(() => `EVT-${crypto.randomUUID()}`);
    const tierIds = userIds.map(() => `TIER-${crypto.randomUUID()}`);
    await pool.query(
      `INSERT INTO events
        (id, organizer_id, title, category, venue, event_date, capacity, status)
       SELECT event_id, $2, 'Throughput event', 'Test', 'Test Hall',
              now() + interval '1 day', 1, 'PUBLISHED'
       FROM unnest($1::text[]) AS event_ids(event_id)`,
      [eventIds, organizerId]
    );
    await pool.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota)
       SELECT tier_id, event_id, 'General', 10, 1
       FROM unnest($1::text[], $2::text[]) AS tiers(tier_id, event_id)`,
      [tierIds, eventIds]
    );

    const startedAt = performance.now();
    const initialHoldKeyCount = holdKeys.size;
    const results = await Promise.allSettled(userIds.map(async (userId, index) => {
      const requestStartedAt = performance.now();
      await createTrackedHold({
        userId,
        eventId: eventIds[index],
        tierId: tierIds[index],
        quantity: 1,
      });
      return performance.now() - requestStartedAt;
    }));
    const elapsedMs = performance.now() - startedAt;
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(failures.map((result) => result.reason), 'Booking throughput requests failed');
    }
    const latencies = results.map((result) => result.value);
    const throughputRps = latencies.length / (elapsedMs / 1000);
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const percentile = (fraction) => sortedLatencies[Math.ceil(fraction * requestCount) - 1];
    const reservedInventoryCount = (await pool.query(
      `SELECT count(*)::int AS count
       FROM ticket_tiers AS tier
       WHERE tier.id = ANY($1::text[]) AND tier.reserved = 1`,
      [tierIds]
    )).rows[0].count;

    console.info('NFR-003 booking hold throughput (real PostgreSQL + Redis):', JSON.stringify({
      requests: requestCount,
      independentInventories: requestCount,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      throughputRps: Number(throughputRps.toFixed(2)),
      p50LatencyMs: Number(percentile(0.5).toFixed(2)),
      p95LatencyMs: Number(percentile(0.95).toFixed(2)),
      meets200RequestsPerSecond: throughputRps >= 200,
    }));

    expect(latencies).toHaveLength(requestCount);
    expect(throughputRps).toBeGreaterThanOrEqual(200);
    expect(reservedInventoryCount).toBe(requestCount);
    expect(holdKeys.size - initialHoldKeyCount).toBe(requestCount);
  }, 120000);
});
