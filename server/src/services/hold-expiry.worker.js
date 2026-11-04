const { getPool } = require('../config/db');
const { connectRedis } = require('../config/redis');
const { HOLD_KEY_PREFIX } = require('./booking-hold.service');

const BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MS = 1000;
let timer;
let activeCycle;

async function expireDueHolds(pool = getPool(), limit = BATCH_SIZE) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const due = await client.query(
      `SELECT id, event_id, tier_id, quantity, hold_type
       FROM ticket_holds
       WHERE status = 'ACTIVE' AND expires_at <= clock_timestamp()
       ORDER BY expires_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    const expired = [];
    for (const hold of due.rows) {
      const result = await client.query(
        `UPDATE ticket_holds
         SET status = 'EXPIRED', updated_at = now()
         WHERE id = $1 AND status = 'ACTIVE' AND expires_at <= clock_timestamp()
         RETURNING id`,
        [hold.id]
      );
      if (!result.rowCount) continue;

      const inventory = await client.query(
        `UPDATE ticket_tiers
         SET reserved = reserved - $2
         WHERE id = $1 AND event_id = $3 AND reserved >= $2`,
        [hold.tier_id, hold.quantity, hold.event_id]
      );
      if (!inventory.rowCount) {
        throw new Error(`Reserved inventory is inconsistent while expiring hold ${hold.id}`);
      }
      if (hold.hold_type === 'WAITLIST_CLAIM') {
        const { expireAcceptedWaitlistHold } = require('./waitlist.service');
        await expireAcceptedWaitlistHold(client, hold.id);
      }
      expired.push(hold.id);
    }

    const {
      processExpiredWaitlistClaims,
      allocateWaitingForAvailableInventory,
    } = require('./waitlist.service');
    await processExpiredWaitlistClaims(client, limit);
    await allocateWaitingForAvailableInventory(client, limit);

    await client.query('COMMIT');
    transactionOpen = false;
    return expired;
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileRedisHolds(pool = getPool(), redisClient) {
  const result = await pool.query(
    `SELECT id, user_id, event_id, tier_id, quantity, status, created_at, expires_at
     FROM ticket_holds
     WHERE status = 'ACTIVE' AND expires_at > clock_timestamp()`
  );
  const activeKeys = new Set();
  for (const hold of result.rows) {
    const key = `${HOLD_KEY_PREFIX}${hold.id}`;
    activeKeys.add(key);
    await redisClient.set(key, JSON.stringify(hold), {
      PXAT: new Date(hold.expires_at).getTime(),
    });
  }

  for await (const key of redisClient.scanIterator({
    MATCH: `${HOLD_KEY_PREFIX}*`,
    COUNT: 500,
  })) {
    if (activeKeys.has(key)) continue;
    const holdId = key.slice(HOLD_KEY_PREFIX.length);
    const currentHold = await pool.query(
      `SELECT 1
       FROM ticket_holds
       WHERE id = $1 AND status = 'ACTIVE' AND expires_at > clock_timestamp()`,
      [holdId]
    );
    if (!currentHold.rowCount) await redisClient.del(key);
  }
  return result.rows.length;
}

async function runExpiryCycle({ pool = getPool(), redis = connectRedis } = {}) {
  if (activeCycle) return activeCycle;
  activeCycle = (async () => {
    const expired = await expireDueHolds(pool);
    try {
      const redisClient = await redis();
      await reconcileRedisHolds(pool, redisClient);
      for (const holdId of expired) {
        await redisClient.del(`${HOLD_KEY_PREFIX}${holdId}`);
      }
    } catch (error) {
      console.error('Hold Redis reconciliation failed; it will be retried:', error.message);
    }
    return expired;
  })();
  try {
    return await activeCycle;
  } finally {
    activeCycle = null;
  }
}

function startHoldExpiryWorker(options = {}) {
  if (timer) return;
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const cycle = () => {
    runExpiryCycle(options).catch((error) => {
      console.error('Ticket hold expiry cycle failed; it will be retried:', error);
    });
  };
  cycle();
  timer = setInterval(cycle, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

async function stopHoldExpiryWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  if (activeCycle) {
    try {
      await activeCycle;
    } catch (error) {
      console.error('Ticket hold expiry cycle failed during shutdown:', error);
    }
  }
}

module.exports = {
  expireDueHolds,
  reconcileRedisHolds,
  runExpiryCycle,
  startHoldExpiryWorker,
  stopHoldExpiryWorker,
};
