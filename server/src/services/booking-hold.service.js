const crypto = require('crypto');
const { getPool } = require('../config/db');
const { connectRedis } = require('../config/redis');
const EventModel = require('../models/event.model');
const UserModel = require('../models/user.model');

const HOLD_TTL_SECONDS = 600;
const HOLD_TTL_MILLISECONDS = HOLD_TTL_SECONDS * 1000;
const HOLD_KEY_PREFIX = 'passpulse:ticket-hold:';

class BookingHoldError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function makeHoldId() {
  return `HOLD-${crypto.randomUUID()}`;
}

async function mirrorUser(client, userId) {
  const present = await client.query('SELECT id, is_active FROM users WHERE id = $1', [userId]);
  if (present.rowCount) {
    if (!present.rows[0].is_active) {
      throw new BookingHoldError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated');
    }
    return;
  }

  const user = await UserModel.findById(userId);
  if (!user || !user.passwordHash) {
    throw new BookingHoldError(401, 'USER_NOT_FOUND', 'Authenticated user is not present in the user repository');
  }

  await client.query(
    `INSERT INTO users (id, full_name, email, password_hash, role, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      user.id,
      user.fullName,
      user.email,
      user.passwordHash,
      user.role,
      user.isActive !== false,
      user.createdAt || new Date().toISOString(),
    ]
  );
}

async function mirrorEvent(client, event) {
  const organizerResult = await client.query('SELECT id FROM users WHERE id = $1', [event.organizerId]);
  if (!organizerResult.rowCount) {
    const organizer = await UserModel.findById(event.organizerId);
    if (!organizer || !organizer.passwordHash) {
      throw new BookingHoldError(409, 'EVENT_NOT_PERSISTED', 'Event organizer is not present in the user repository');
    }
    await client.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        organizer.id,
        organizer.fullName,
        organizer.email,
        organizer.passwordHash,
        organizer.role,
        organizer.isActive !== false,
        organizer.createdAt || new Date().toISOString(),
      ]
    );
  }

  await client.query(
    `INSERT INTO events
      (id, organizer_id, title, description, category, venue, event_date, capacity, status, is_flagged, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [
      event.id,
      event.organizerId,
      event.title,
      event.description || '',
      event.category,
      event.venue,
      event.eventDate,
      event.capacity,
      event.status,
      event.isFlagged === true,
      event.createdAt || new Date().toISOString(),
      event.updatedAt || new Date().toISOString(),
    ]
  );

  for (const tier of event.tiers || []) {
    await client.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota, sold, max_per_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        tier.id,
        event.id,
        tier.name,
        tier.price,
        tier.quota,
        tier.sold || 0,
        tier.maxPerOrder || 5,
      ]
    );
  }
}

async function ensurePersistentReferences(client, { userId, eventId, tierId }) {
  await mirrorUser(client, userId);

  const eventResult = await client.query('SELECT id FROM events WHERE id = $1', [eventId]);
  if (!eventResult.rowCount) {
    const event = await EventModel.findById(eventId);
    if (!event) throw new BookingHoldError(404, 'EVENT_NOT_FOUND', 'Event not found');
    await mirrorEvent(client, event);
  }

  const tierResult = await client.query(
    'SELECT id FROM ticket_tiers WHERE id = $1 AND event_id = $2',
    [tierId, eventId]
  );
  if (!tierResult.rowCount) {
    const event = await EventModel.findById(eventId);
    const tier = event && event.tiers.find((item) => item.id === tierId);
    if (!tier) throw new BookingHoldError(404, 'TIER_NOT_FOUND', 'Ticket tier not found for this event');
    const persistentEvent = await client.query('SELECT id FROM events WHERE id = $1', [eventId]);
    if (!persistentEvent.rowCount) await mirrorEvent(client, event);
    await client.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota, sold, max_per_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [tier.id, eventId, tier.name, tier.price, tier.quota, tier.sold || 0, tier.maxPerOrder || 5]
    );
  }
}

async function reserveInDatabase({ userId, eventId, tierId, quantity, holdId }) {
  const pool = getPool();
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await ensurePersistentReferences(client, { userId, eventId, tierId });

    const tierResult = await client.query(
      `SELECT tier.id, tier.event_id, tier.price, tier.max_per_order,
              event.status AS event_status, event.is_flagged
       FROM ticket_tiers AS tier
       JOIN events AS event ON event.id = tier.event_id
       WHERE tier.id = $1 AND tier.event_id = $2
       FOR UPDATE OF tier, event`,
      [tierId, eventId]
    );
    if (!tierResult.rowCount) {
      throw new BookingHoldError(404, 'TIER_NOT_FOUND', 'Ticket tier not found for this event');
    }
    const tier = tierResult.rows[0];
    if (!['PUBLISHED', 'LIVE'].includes(tier.event_status) || tier.is_flagged) {
      throw new BookingHoldError(409, 'EVENT_NOT_ON_SALE', 'Tickets for this event are not currently on sale');
    }
    if (quantity > tier.max_per_order) {
      throw new BookingHoldError(400, 'ORDER_LIMIT_EXCEEDED', `Quantity cannot exceed ${tier.max_per_order} for this tier`);
    }

    const inventory = await client.query(
      `UPDATE ticket_tiers
       SET reserved = reserved + $3
       WHERE id = $1
         AND event_id = $2
         AND sold + reserved + $3 <= quota
       RETURNING id`,
      [tierId, eventId, quantity]
    );
    if (!inventory.rowCount) {
      throw new BookingHoldError(409, 'INSUFFICIENT_INVENTORY', 'Requested ticket quantity is no longer available');
    }

    const holdResult = await client.query(
      `WITH hold_time AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS created_at)
       INSERT INTO ticket_holds
         (id, user_id, event_id, tier_id, quantity, status, expires_at, created_at, retained_until)
       SELECT $1, $2, $3, $4, $5, 'ACTIVE',
              hold_time.created_at + INTERVAL '10 minutes',
              hold_time.created_at,
              hold_time.created_at + INTERVAL '1 year'
       FROM hold_time
       RETURNING id, user_id, event_id, tier_id, quantity, status, created_at, expires_at`,
      [holdId, userId, eventId, tierId, quantity]
    );
    await client.query('COMMIT');
    transactionOpen = false;
    return holdResult.rows[0];
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function releaseUnpublishedHold(holdId) {
  const client = await getPool().connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const released = await client.query(
      `UPDATE ticket_holds
       SET status = 'RELEASED', updated_at = now()
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING event_id, tier_id, quantity`,
      [holdId]
    );
    if (released.rowCount) {
      const { event_id: eventId, tier_id: tierId, quantity } = released.rows[0];
      const inventory = await client.query(
        `UPDATE ticket_tiers
         SET reserved = reserved - $3
         WHERE id = $1 AND event_id = $2 AND reserved >= $3`,
        [tierId, eventId, quantity]
      );
      if (!inventory.rowCount) {
        throw new Error(`Reserved inventory is inconsistent while releasing hold ${holdId}`);
      }
      const { allocateAvailableWaitlist } = require('./waitlist.service');
      await allocateAvailableWaitlist(client, { eventId, tierId });
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

async function createHold({ userId, eventId, tierId, quantity }) {
  if (!userId) throw new BookingHoldError(401, 'UNAUTHENTICATED', 'Authentication is required');
  if (typeof eventId !== 'string' || !eventId.trim()
      || typeof tierId !== 'string' || !tierId.trim()
      || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new BookingHoldError(400, 'INVALID_HOLD_REQUEST', 'eventId, tierId and a positive integer quantity are required');
  }

  const holdId = makeHoldId();
  const hold = await reserveInDatabase({ userId, eventId, tierId, quantity, holdId });
  const key = `${HOLD_KEY_PREFIX}${hold.id}`;
  const expiresAt = new Date(hold.expires_at).getTime();
  if (expiresAt <= Date.now()) {
    await releaseUnpublishedHold(hold.id);
    throw new BookingHoldError(409, 'HOLD_EXPIRED', 'The hold expired before it could be created');
  }

  let redis;
  try {
    redis = await connectRedis();
    if (expiresAt <= Date.now()) {
      throw new BookingHoldError(409, 'HOLD_EXPIRED', 'The hold expired before it could be created');
    }
    const result = await redis.set(
      key,
      JSON.stringify(hold),
      { NX: true, PXAT: expiresAt }
    );
    if (result !== 'OK') throw new Error(`Redis refused to create hold key ${hold.id}`);
  } catch (error) {
    try {
      await releaseUnpublishedHold(hold.id);
    } catch (releaseError) {
      console.error(`Failed to compensate PostgreSQL reservation for hold ${hold.id}:`, releaseError);
    }
    if (redis) {
      try {
        await redis.del(key);
      } catch (deleteError) {
        console.error(`Failed to remove Redis key for failed hold ${hold.id}:`, deleteError);
      }
    }
    if (error instanceof BookingHoldError && error.code === 'HOLD_EXPIRED') throw error;
    throw new BookingHoldError(503, 'HOLD_STORE_UNAVAILABLE', 'Unable to create the ticket hold; retry shortly');
  }

  if (expiresAt <= Date.now()) {
    try {
      await releaseUnpublishedHold(hold.id);
    } catch (releaseError) {
      console.error(`Failed to compensate expired hold ${hold.id}:`, releaseError);
    }
    try {
      await redis.del(key);
    } catch (deleteError) {
      console.error(`Failed to remove expired Redis key for hold ${hold.id}:`, deleteError);
    }
    throw new BookingHoldError(409, 'HOLD_EXPIRED', 'The hold expired before it could be created');
  }

  return {
    holdId: hold.id,
    id: hold.id,
    eventId: hold.event_id,
    tierId: hold.tier_id,
    quantity: hold.quantity,
    status: hold.status,
    createdAt: hold.created_at,
    expiresAt: hold.expires_at,
    expiresInSeconds: HOLD_TTL_SECONDS,
  };
}

async function createWaitlistClaimHold(client, { userId, eventId, tierId, quantity }) {
  const holdId = makeHoldId();
  const result = await client.query(
    `WITH hold_time AS (
       SELECT date_trunc('milliseconds', clock_timestamp()) AS created_at
     )
     INSERT INTO ticket_holds
       (id, user_id, event_id, tier_id, quantity, hold_type, status,
        created_at, expires_at, retained_until)
     SELECT $1, $2, $3, $4, $5, 'WAITLIST_CLAIM', 'ACTIVE',
            hold_time.created_at,
            hold_time.created_at + INTERVAL '10 minutes',
            hold_time.created_at + INTERVAL '1 year'
     FROM hold_time
     RETURNING id, user_id, event_id, tier_id, quantity, status, created_at, expires_at`,
    [holdId, userId, eventId, tierId, quantity]
  );
  if (!result.rowCount) throw new Error(`Could not create booking hold for waitlist claim ${holdId}`);
  return result.rows[0];
}

module.exports = {
  HOLD_TTL_SECONDS,
  HOLD_TTL_MILLISECONDS,
  HOLD_KEY_PREFIX,
  BookingHoldError,
  createHold,
  createWaitlistClaimHold,
  releaseUnpublishedHold,
  ensurePersistentReferences,
};
