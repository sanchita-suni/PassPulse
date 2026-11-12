const crypto = require('crypto');
const { getPool } = require('../config/db');
const { connectRedis } = require('../config/redis');
const {
  HOLD_KEY_PREFIX,
  HOLD_TTL_SECONDS,
  ensurePersistentReferences,
  createWaitlistClaimHold,
} = require('./booking-hold.service');

class WaitlistError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hashClaimToken() {
  return crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
}

async function createNotification(client, { userId, claimId, type, payload }) {
  await client.query(
    `INSERT INTO notifications (id, user_id, claim_id, notification_type, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [makeId('NOTIF'), userId, claimId || null, type, JSON.stringify(payload || {})]
  );
}

async function createClaim(client, entry, quantity, tier) {
  const claimId = makeId('CLAIM');
  const claimResult = await client.query(
    `WITH claim_time AS (
       SELECT date_trunc('milliseconds', clock_timestamp()) AS created_at
     )
     INSERT INTO waitlist_claims
       (id, waitlist_entry_id, user_id, event_id, tier_id, quantity, token_hash,
        status, created_at, expires_at, retained_until)
     SELECT $1, $2, $3, $4, $5, $6, $7, 'ACTIVE', claim_time.created_at,
            claim_time.created_at + INTERVAL '15 minutes',
            claim_time.created_at + INTERVAL '1 year'
     FROM claim_time
     RETURNING id, status, created_at, expires_at`,
    [
      claimId,
      entry.id,
      entry.user_id,
      entry.event_id,
      entry.tier_id,
      quantity,
      hashClaimToken(),
    ]
  );

  await client.query(
    `UPDATE waitlist_entries SET status = 'CLAIMED', updated_at = now()
     WHERE id = $1 AND status = 'WAITING'`,
    [entry.id]
  );
  const claim = claimResult.rows[0];
  await createNotification(client, {
    userId: entry.user_id,
    claimId,
    type: 'CLAIM_AVAILABLE',
    payload: {
      claimId,
      eventId: entry.event_id,
      eventName: tier.event_name,
      tierId: entry.tier_id,
      tierName: tier.tier_name,
      quantity,
      expiresAt: claim.expires_at,
      message: `Tickets are available and your claim expires in 15 minutes.`,
    },
  });
  return {
    id: claim.id,
    status: claim.status,
    quantity,
    createdAt: claim.created_at,
    expiresAt: claim.expires_at,
  };
}

async function allocateTier(client, { eventId, tierId }) {
  const tierResult = await client.query(
    `SELECT tier.id, tier.event_id, tier.quota, tier.sold, tier.reserved,
            tier.name AS tier_name, event.title AS event_name
     FROM ticket_tiers AS tier
     JOIN events AS event ON event.id = tier.event_id
     WHERE tier.id = $1 AND tier.event_id = $2
     FOR UPDATE OF tier`,
    [tierId, eventId]
  );
  if (!tierResult.rowCount) return [];
  const tier = tierResult.rows[0];
  let available = Number(tier.quota) - Number(tier.sold) - Number(tier.reserved);
  const claims = [];

  while (available > 0) {
    const entryResult = await client.query(
      `SELECT id, user_id, event_id, tier_id, quantity, queue_position
       FROM waitlist_entries
       WHERE tier_id = $1 AND event_id = $2 AND status = 'WAITING'
       ORDER BY queue_position
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [tierId, eventId]
    );
    if (!entryResult.rowCount) break;

    const entry = entryResult.rows[0];
    const quantity = Math.min(Number(entry.quantity), available);
    const inventory = await client.query(
      `UPDATE ticket_tiers
       SET reserved = reserved + $2
       WHERE id = $1 AND sold + reserved + $2 <= quota
       RETURNING id`,
      [tierId, quantity]
    );
    if (!inventory.rowCount) break;

    claims.push(await createClaim(client, entry, quantity, tier));
    available -= quantity;
  }
  return claims;
}

async function allocateAvailableWaitlist(client, { eventId, tierId }) {
  return allocateTier(client, { eventId, tierId });
}

async function allocateWaitingForAvailableInventory(client, limit = 100) {
  const tiers = await client.query(
    `SELECT tier.id AS tier_id, tier.event_id
     FROM ticket_tiers AS tier
     WHERE tier.sold + tier.reserved < tier.quota
       AND EXISTS (
         SELECT 1 FROM waitlist_entries AS entry
         WHERE entry.tier_id = tier.id AND entry.status = 'WAITING'
       )
     ORDER BY (
       SELECT min(entry.queue_position)
       FROM waitlist_entries AS entry
       WHERE entry.tier_id = tier.id AND entry.status = 'WAITING'
     )
     LIMIT $1
     FOR UPDATE OF tier SKIP LOCKED`,
    [limit]
  );
  const claims = [];
  for (const tier of tiers.rows) {
    claims.push(...await allocateTier(client, {
      eventId: tier.event_id,
      tierId: tier.tier_id,
    }));
  }
  return claims;
}

async function joinWaitlist({ userId, eventId, tierId, quantity }) {
  if (!userId) throw new WaitlistError(401, 'UNAUTHENTICATED', 'Authentication is required');
  if (typeof eventId !== 'string' || !eventId.trim()
      || typeof tierId !== 'string' || !tierId.trim()
      || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new WaitlistError(400, 'INVALID_WAITLIST_REQUEST', 'eventId, tierId and a positive integer quantity are required');
  }

  const pool = getPool();
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await ensurePersistentReferences(client, { userId, eventId, tierId });
    const tierResult = await client.query(
      `SELECT tier.id, tier.max_per_order, tier.quota, tier.sold, tier.reserved,
              event.status AS event_status, event.is_flagged
       FROM ticket_tiers AS tier
       JOIN events AS event ON event.id = tier.event_id
       WHERE tier.id = $1 AND tier.event_id = $2
       FOR UPDATE OF tier, event`,
      [tierId, eventId]
    );
    if (!tierResult.rowCount) {
      throw new WaitlistError(404, 'TIER_NOT_FOUND', 'Ticket tier not found for this event');
    }
    const tier = tierResult.rows[0];
    if (!['PUBLISHED', 'LIVE'].includes(tier.event_status) || tier.is_flagged) {
      throw new WaitlistError(409, 'EVENT_NOT_AVAILABLE', 'This event is not available for waitlisting');
    }
    if (quantity > tier.max_per_order) {
      throw new WaitlistError(400, 'ORDER_LIMIT_EXCEEDED', `Quantity cannot exceed ${tier.max_per_order} for this tier`);
    }
    if (Number(tier.quota) - Number(tier.sold) - Number(tier.reserved) > 0) {
      throw new WaitlistError(409, 'WAITLIST_NOT_REQUIRED', 'Join the waitlist only when this ticket tier is sold out');
    }

    const duplicate = await client.query(
      `SELECT id FROM waitlist_entries
       WHERE user_id = $1 AND tier_id = $2 AND status IN ('WAITING', 'CLAIMED')
       FOR UPDATE`,
      [userId, tierId]
    );
    if (duplicate.rowCount) {
      throw new WaitlistError(409, 'ACTIVE_WAITLIST_ENTRY_EXISTS', 'You already have an active waitlist entry for this ticket tier');
    }

    const entryId = makeId('WAIT');
    await client.query(
      `INSERT INTO waitlist_entries
         (id, user_id, event_id, tier_id, quantity, status, joined_at, retained_until)
       VALUES ($1, $2, $3, $4, $5, 'WAITING', clock_timestamp(), clock_timestamp() + INTERVAL '1 year')
       RETURNING id, user_id, event_id, tier_id, quantity, status, queue_position, joined_at`,
      [entryId, userId, eventId, tierId, quantity]
    );
    const claims = await allocateTier(client, { eventId, tierId });
    const currentEntryResult = await client.query(
      `SELECT id, user_id, event_id, tier_id, quantity, status, queue_position, joined_at
       FROM waitlist_entries WHERE id = $1`,
      [entryId]
    );
    const positionResult = await client.query(
      `SELECT count(*)::integer AS position
       FROM waitlist_entries
      WHERE tier_id = $1 AND status IN ('WAITING', 'CLAIMED')
         AND queue_position <= (SELECT queue_position FROM waitlist_entries WHERE id = $2)`,
      [tierId, entryId]
    );
    await client.query('COMMIT');
    transactionOpen = false;
    return {
      entry: currentEntryResult.rows[0],
      position: Number(positionResult.rows[0].position),
      claims,
    };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listNotifications(userId) {
  if (!userId) throw new WaitlistError(401, 'UNAUTHENTICATED', 'Authentication is required');
  const { rows } = await getPool().query(
    `SELECT notification.id, notification.notification_type, notification.payload,
            notification.created_at, notification.read_at,
            claim.id AS claim_id, claim.status AS claim_status, claim.quantity,
            claim.expires_at, claim.created_at AS claim_created_at,
            claim.event_id, event.title AS event_name, event.event_date, event.venue,
            claim.tier_id, tier.name AS tier_name, tier.price
     FROM notifications AS notification
     LEFT JOIN waitlist_claims AS claim ON claim.id = notification.claim_id
     LEFT JOIN events AS event ON event.id = claim.event_id
     LEFT JOIN ticket_tiers AS tier
       ON tier.id = claim.tier_id AND tier.event_id = claim.event_id
     WHERE notification.user_id = $1
     ORDER BY notification.created_at DESC, notification.id`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.notification_type,
    payload: row.payload,
    createdAt: row.created_at,
    readAt: row.read_at,
    claim: row.claim_id ? {
      id: row.claim_id,
      status: row.claim_status,
      quantity: row.quantity,
      createdAt: row.claim_created_at,
      expiresAt: row.expires_at,
      event: {
        id: row.event_id,
        title: row.event_name,
        eventDate: row.event_date,
        venue: row.venue,
      },
      tier: {
        id: row.tier_id,
        name: row.tier_name,
        price: Number(row.price),
      },
    } : null,
  }));
}

async function notifyClaimResolution(client, claim, type, message) {
  await createNotification(client, {
    userId: claim.user_id,
    claimId: claim.id,
    type,
    payload: {
      claimId: claim.id,
      eventId: claim.event_id,
      tierId: claim.tier_id,
      quantity: claim.quantity,
      message,
    },
  });
}

async function releaseClaimAllocation(client, claim, status, notificationType) {
  const changed = await client.query(
    `UPDATE waitlist_claims
     SET status = $2, resolved_at = clock_timestamp()
     WHERE id = $1 AND status = 'ACTIVE'
     RETURNING id`,
    [claim.id, status]
  );
  if (!changed.rowCount) return false;
  await client.query(
    `UPDATE waitlist_entries SET status = 'EXPIRED', updated_at = now()
     WHERE id = $1 AND status = 'CLAIMED'`,
    [claim.waitlist_entry_id]
  );
  const inventory = await client.query(
    `UPDATE ticket_tiers
     SET reserved = reserved - $2
     WHERE id = $1 AND event_id = $3 AND reserved >= $2
     RETURNING id`,
    [claim.tier_id, claim.quantity, claim.event_id]
  );
  if (!inventory.rowCount) {
    throw new Error(`Reserved inventory is inconsistent while releasing claim ${claim.id}`);
  }
  await notifyClaimResolution(
    client,
    claim,
    notificationType,
    status === 'DECLINED' ? 'Your ticket claim was declined.' : 'Your ticket claim expired.'
  );
  return true;
}

async function processExpiredWaitlistClaims(client, limit = 100) {
  const result = await client.query(
    `SELECT id, waitlist_entry_id, user_id, event_id, tier_id, quantity
     FROM waitlist_claims
     WHERE status = 'ACTIVE' AND expires_at <= clock_timestamp()
     ORDER BY expires_at
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  const released = [];
  for (const claim of result.rows) {
    const tier = await client.query(
      'SELECT id FROM ticket_tiers WHERE id = $1 AND event_id = $2 FOR UPDATE',
      [claim.tier_id, claim.event_id]
    );
    if (!tier.rowCount) throw new Error(`Waitlist claim ${claim.id} references a missing tier`);
    if (await releaseClaimAllocation(client, claim, 'EXPIRED', 'CLAIM_EXPIRED')) {
      released.push({ eventId: claim.event_id, tierId: claim.tier_id });
    }
  }
  return released;
}

async function expireAcceptedWaitlistHold(client, holdId) {
  const result = await client.query(
    `SELECT claim.id, claim.waitlist_entry_id, claim.user_id, claim.event_id,
            claim.tier_id, claim.quantity
     FROM waitlist_claims AS claim
     WHERE claim.hold_id = $1 AND claim.status = 'ACCEPTED'
     FOR UPDATE`,
    [holdId]
  );
  if (!result.rowCount) return false;
  const claim = result.rows[0];
  await client.query(
    `UPDATE waitlist_entries SET status = 'EXPIRED', updated_at = now()
     WHERE id = $1 AND status = 'CLAIMED'`,
    [claim.waitlist_entry_id]
  );
  await notifyClaimResolution(
    client,
    claim,
    'WAITLIST_HOLD_EXPIRED',
    'Your 10-minute booking hold expired. The tickets were offered to the next attendee.'
  );
  return true;
}

async function acceptClaim({ userId, claimId }) {
  if (!userId) throw new WaitlistError(401, 'UNAUTHENTICATED', 'Authentication is required');
  if (typeof claimId !== 'string' || !claimId.trim()) {
    throw new WaitlistError(400, 'INVALID_CLAIM_REQUEST', 'A claim ID is required');
  }

  const pool = getPool();
  const client = await pool.connect();
  let transactionOpen = false;
  let result;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const claimResult = await client.query(
      `SELECT claim.id, claim.waitlist_entry_id, claim.user_id, claim.event_id,
              claim.tier_id, claim.quantity, claim.status, claim.hold_id,
              claim.expires_at <= clock_timestamp() AS is_expired,
              entry.status AS entry_status
       FROM waitlist_claims AS claim
       JOIN waitlist_entries AS entry ON entry.id = claim.waitlist_entry_id
       WHERE claim.id = $1
       FOR UPDATE OF claim`,
      [claimId]
    );
    if (!claimResult.rowCount) throw new WaitlistError(404, 'CLAIM_NOT_FOUND', 'Waitlist claim not found');
    const claim = claimResult.rows[0];
    if (claim.user_id !== userId) {
      throw new WaitlistError(403, 'CLAIM_NOT_OWNED', 'You are not authorized to accept this claim');
    }
    if (claim.entry_status !== 'CLAIMED') {
      throw new WaitlistError(409, 'CLAIM_NOT_ACTIVE', 'The waitlist entry is no longer claimable');
    }

    if (claim.status === 'ACCEPTED' && claim.hold_id) {
      const existing = await client.query(
        `SELECT id, user_id, event_id, tier_id, quantity, status, created_at, expires_at
         FROM ticket_holds
         WHERE id = $1 AND status = 'ACTIVE' AND expires_at > clock_timestamp()`,
        [claim.hold_id]
      );
      if (existing.rowCount) {
        result = { claimId, hold: existing.rows[0], idempotent: true };
        await client.query('COMMIT');
        transactionOpen = false;
      } else {
        throw new WaitlistError(409, 'CLAIM_ALREADY_ACCEPTED', 'The claim was already accepted or its booking hold expired');
      }
    } else if (claim.status !== 'ACTIVE') {
      throw new WaitlistError(409, 'CLAIM_NOT_ACTIVE', `This claim is ${claim.status.toLowerCase()}`);
    } else if (claim.is_expired) {
      const tier = await client.query(
        'SELECT id FROM ticket_tiers WHERE id = $1 AND event_id = $2 FOR UPDATE',
        [claim.tier_id, claim.event_id]
      );
      if (!tier.rowCount) throw new Error(`Waitlist claim ${claim.id} references a missing tier`);
      await releaseClaimAllocation(client, claim, 'EXPIRED', 'CLAIM_EXPIRED');
      await allocateTier(client, { eventId: claim.event_id, tierId: claim.tier_id });
      await client.query('COMMIT');
      transactionOpen = false;
      throw new WaitlistError(409, 'CLAIM_EXPIRED', 'This waitlist claim has expired');
    } else {
      const tierResult = await client.query(
        `SELECT tier.id, tier.event_id, tier.reserved,
                event.status AS event_status, event.is_flagged
         FROM ticket_tiers AS tier
         JOIN events AS event ON event.id = tier.event_id
         WHERE tier.id = $1 AND tier.event_id = $2
         FOR UPDATE OF tier, event`,
        [claim.tier_id, claim.event_id]
      );
      if (!tierResult.rowCount
          || !['PUBLISHED', 'LIVE'].includes(tierResult.rows[0].event_status)
          || tierResult.rows[0].is_flagged) {
        throw new WaitlistError(409, 'EVENT_NOT_AVAILABLE', 'The event or ticket tier is no longer available');
      }
      if (Number(tierResult.rows[0].reserved) < Number(claim.quantity)) {
        throw new WaitlistError(409, 'CLAIM_ALLOCATION_UNAVAILABLE', 'The reserved inventory for this claim is unavailable');
      }
      const hold = await createWaitlistClaimHold(client, {
        userId,
        eventId: claim.event_id,
        tierId: claim.tier_id,
        quantity: claim.quantity,
      });
      const updated = await client.query(
        `UPDATE waitlist_claims
         SET status = 'ACCEPTED', hold_id = $2, resolved_at = clock_timestamp()
         WHERE id = $1 AND status = 'ACTIVE' AND expires_at > clock_timestamp()
         RETURNING id`,
        [claimId, hold.id]
      );
      if (!updated.rowCount) {
        const error = new Error(`Waitlist claim ${claimId} expired during acceptance`);
        error.code = 'WAITLIST_CLAIM_EXPIRED_DURING_ACCEPTANCE';
        throw error;
      }
      await client.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, clock_timestamp())
         WHERE claim_id = $1 AND user_id = $2 AND notification_type = 'CLAIM_AVAILABLE'`,
        [claimId, userId]
      );
      result = { claimId, hold, idempotent: false };
      await client.query('COMMIT');
      transactionOpen = false;
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    if (error.code === 'WAITLIST_CLAIM_EXPIRED_DURING_ACCEPTANCE') {
      await expireClaimAndReallocate(pool, claimId);
      throw new WaitlistError(409, 'CLAIM_EXPIRED', 'This waitlist claim has expired');
    }
    throw error;
  } finally {
    client.release();
  }

  if (!result.idempotent) {
    const hold = result.hold;
    try {
      const redis = await connectRedis();
      const redisResult = await redis.set(
        `${HOLD_KEY_PREFIX}${hold.id}`,
        JSON.stringify(hold),
        { NX: true, PXAT: new Date(hold.expires_at).getTime() }
      );
      if (redisResult !== 'OK') {
        console.error(`Redis refused the persisted waitlist hold ${hold.id}; reconciliation will retry`);
      }
    } catch (error) {
      console.error(`Waitlist hold ${hold.id} committed but Redis publication failed; reconciliation will retry:`, error.message);
    }
  }

  return {
    claimId: result.claimId,
    hold: {
      holdId: result.hold.id,
      id: result.hold.id,
      eventId: result.hold.event_id,
      tierId: result.hold.tier_id,
      quantity: result.hold.quantity,
      status: result.hold.status,
      createdAt: result.hold.created_at,
      expiresAt: result.hold.expires_at,
      expiresInSeconds: HOLD_TTL_SECONDS,
    },
    idempotent: result.idempotent,
  };
}

async function expireClaimAndReallocate(pool, claimId) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await client.query(
      `SELECT id, waitlist_entry_id, user_id, event_id, tier_id, quantity
       FROM waitlist_claims
       WHERE id = $1 AND status = 'ACTIVE' AND expires_at <= clock_timestamp()
       FOR UPDATE`,
      [claimId]
    );
    if (result.rowCount) {
      const claim = result.rows[0];
      await client.query(
        'SELECT id FROM ticket_tiers WHERE id = $1 AND event_id = $2 FOR UPDATE',
        [claim.tier_id, claim.event_id]
      );
      await releaseClaimAllocation(client, claim, 'EXPIRED', 'CLAIM_EXPIRED');
      await allocateTier(client, { eventId: claim.event_id, tierId: claim.tier_id });
    }
    await client.query('COMMIT');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function declineClaim({ userId, claimId }) {
  if (!userId) throw new WaitlistError(401, 'UNAUTHENTICATED', 'Authentication is required');
  if (typeof claimId !== 'string' || !claimId.trim()) {
    throw new WaitlistError(400, 'INVALID_CLAIM_REQUEST', 'A claim ID is required');
  }

  const client = await getPool().connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await client.query(
      `SELECT id, waitlist_entry_id, user_id, event_id, tier_id, quantity,
              status, expires_at <= clock_timestamp() AS is_expired
       FROM waitlist_claims WHERE id = $1 FOR UPDATE`,
      [claimId]
    );
    if (!result.rowCount) throw new WaitlistError(404, 'CLAIM_NOT_FOUND', 'Waitlist claim not found');
    const claim = result.rows[0];
    if (claim.user_id !== userId) {
      throw new WaitlistError(403, 'CLAIM_NOT_OWNED', 'You are not authorized to decline this claim');
    }
    if (claim.status !== 'ACTIVE') {
      throw new WaitlistError(409, 'CLAIM_NOT_ACTIVE', `This claim is ${claim.status.toLowerCase()}`);
    }
    const tier = await client.query(
      'SELECT id FROM ticket_tiers WHERE id = $1 AND event_id = $2 FOR UPDATE',
      [claim.tier_id, claim.event_id]
    );
    if (!tier.rowCount) throw new Error(`Waitlist claim ${claim.id} references a missing tier`);
    const expired = claim.is_expired;
    const status = expired ? 'EXPIRED' : 'DECLINED';
    await releaseClaimAllocation(
      client,
      claim,
      status,
      expired ? 'CLAIM_EXPIRED' : 'CLAIM_DECLINED'
    );
    await allocateTier(client, { eventId: claim.event_id, tierId: claim.tier_id });
    await client.query('COMMIT');
    transactionOpen = false;
    if (expired) throw new WaitlistError(409, 'CLAIM_EXPIRED', 'This waitlist claim has expired');
    return { claimId, status: 'DECLINED' };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  WaitlistError,
  joinWaitlist,
  listNotifications,
  acceptClaim,
  declineClaim,
  allocateAvailableWaitlist,
  allocateWaitingForAvailableInventory,
  processExpiredWaitlistClaims,
  expireAcceptedWaitlistHold,
};
