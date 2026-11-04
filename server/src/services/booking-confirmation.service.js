const crypto = require('crypto');
const { getPool } = require('../config/db');
const { connectRedis } = require('../config/redis');
const { HOLD_KEY_PREFIX } = require('./booking-hold.service');
const { mapDatabaseTicket, registerTicket } = require('./ticket.service');

class BookingConfirmationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function loadBooking(client, bookingId) {
  const bookingResult = await client.query(
    `SELECT id, user_id, event_id, status, total_amount, created_at
     FROM bookings
     WHERE id = $1`,
    [bookingId]
  );
  if (!bookingResult.rowCount) return null;

  const booking = bookingResult.rows[0];
  if (booking.status !== 'CONFIRMED') {
    throw new BookingConfirmationError(409, 'BOOKING_NOT_CONFIRMED', 'This booking is no longer confirmed');
  }

  const ticketResult = await client.query(
    `SELECT ticket.id AS ticket_id, ticket.booking_id, ticket.status AS ticket_status,
            ticket.issued_at, booking.event_id, booking.user_id, booking.status AS booking_status,
            event.title AS event_name, event.category AS event_category,
            event.event_date, event.venue,
            GREATEST(event.event_date + INTERVAL '1 day',
                     ticket.issued_at + INTERVAL '1 day') AS expires_at,
            attendee.full_name AS attendee_name, attendee.email AS attendee_email,
            tier.name AS tier_name, tier.price
     FROM tickets AS ticket
     JOIN bookings AS booking ON booking.id = ticket.booking_id
     JOIN events AS event ON event.id = booking.event_id
     JOIN users AS attendee ON attendee.id = booking.user_id
     JOIN ticket_tiers AS tier ON tier.id = ticket.tier_id AND tier.event_id = booking.event_id
     WHERE ticket.booking_id = $1
     ORDER BY ticket.issued_at, ticket.id`,
    [bookingId]
  );

  return {
    id: booking.id,
    bookingId: booking.id,
    bookingReference: booking.id,
    userId: booking.user_id,
    eventId: booking.event_id,
    status: booking.status,
    totalAmount: booking.total_amount,
    createdAt: booking.created_at,
    tickets: ticketResult.rows.map(mapDatabaseTicket),
  };
}

async function releaseExpiredHold(client, hold) {
  const tierResult = await client.query(
    `SELECT id FROM ticket_tiers
     WHERE id = $1 AND event_id = $2
     FOR UPDATE`,
    [hold.tier_id, hold.event_id]
  );
  if (!tierResult.rowCount) {
    throw new BookingConfirmationError(409, 'INVALID_HOLD_TIER', 'The hold references an invalid ticket tier');
  }

  const expiredResult = await client.query(
    `UPDATE ticket_holds
     SET status = 'EXPIRED', updated_at = now()
     WHERE id = $1 AND status = 'ACTIVE'
     RETURNING quantity, tier_id`,
    [hold.id]
  );
  if (!expiredResult.rowCount) return;

  const { quantity, tier_id: tierId } = expiredResult.rows[0];
  const inventory = await client.query(
    `UPDATE ticket_tiers
     SET reserved = reserved - $2
     WHERE id = $1 AND reserved >= $2`,
    [tierId, quantity]
  );
  if (!inventory.rowCount) {
    throw new Error(`Reserved inventory is inconsistent while expiring hold ${hold.id}`);
  }
  const { allocateAvailableWaitlist, expireAcceptedWaitlistHold } = require('./waitlist.service');
  if (hold.hold_type === 'WAITLIST_CLAIM') {
    await expireAcceptedWaitlistHold(client, hold.id);
  }
  await allocateAvailableWaitlist(client, {
    eventId: hold.event_id,
    tierId: hold.tier_id,
  });
}

async function expireHoldAfterRollback(pool, holdId) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await client.query(
      `SELECT id, event_id, tier_id, hold_type, status,
              expires_at <= clock_timestamp() AS is_expired
       FROM ticket_holds
       WHERE id = $1
       FOR UPDATE`,
      [holdId]
    );
    if (result.rowCount && result.rows[0].status === 'ACTIVE' && result.rows[0].is_expired) {
      await releaseExpiredHold(client, result.rows[0]);
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

async function confirmBooking({ userId, holdId }) {
  if (!userId) {
    throw new BookingConfirmationError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }
  if (typeof holdId !== 'string' || !holdId.trim()) {
    throw new BookingConfirmationError(400, 'INVALID_CONFIRMATION_REQUEST', 'holdId is required');
  }

  const pool = getPool();
  const client = await pool.connect();
  let transactionOpen = false;
  let booking;
  let expired = false;
  let expiredDuringConfirmation = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const holdResult = await client.query(
      `SELECT id, user_id, event_id, tier_id, quantity, hold_type, status, booking_id,
              expires_at <= clock_timestamp() AS is_expired
       FROM ticket_holds
       WHERE id = $1
       FOR UPDATE`,
      [holdId]
    );
    if (!holdResult.rowCount) {
      throw new BookingConfirmationError(404, 'HOLD_NOT_FOUND', 'Ticket hold not found');
    }

    const hold = holdResult.rows[0];
    if (hold.user_id !== userId) {
      throw new BookingConfirmationError(403, 'HOLD_NOT_OWNED', 'You are not authorized to confirm this ticket hold');
    }

    if (hold.status === 'CONFIRMED') {
      if (!hold.booking_id) {
        throw new Error(`Confirmed hold ${hold.id} has no associated booking`);
      }
      booking = await loadBooking(client, hold.booking_id);
      if (!booking || booking.userId !== userId || booking.eventId !== hold.event_id
          || booking.tickets.length !== hold.quantity) {
        throw new Error(`Confirmed hold ${hold.id} has inconsistent booking records`);
      }
      await client.query('COMMIT');
      transactionOpen = false;
    } else {
      if (hold.status !== 'ACTIVE') {
        throw new BookingConfirmationError(409, 'HOLD_NOT_ACTIVE', `Ticket hold is ${hold.status.toLowerCase()}`);
      }

      if (hold.is_expired) {
        await releaseExpiredHold(client, hold);
        expired = true;
        await client.query('COMMIT');
        transactionOpen = false;
      } else {
        const tierResult = await client.query(
          `SELECT tier.price, event.status AS event_status, event.is_flagged
           FROM ticket_tiers AS tier
           JOIN events AS event ON event.id = tier.event_id
           WHERE tier.id = $1 AND tier.event_id = $2
           FOR UPDATE OF tier, event`,
          [hold.tier_id, hold.event_id]
        );
        if (!tierResult.rowCount) {
          throw new BookingConfirmationError(409, 'INVALID_HOLD_TIER', 'The hold references an invalid ticket tier');
        }
        if (!['PUBLISHED', 'LIVE'].includes(tierResult.rows[0].event_status)
            || tierResult.rows[0].is_flagged) {
          throw new BookingConfirmationError(409, 'EVENT_NOT_ON_SALE', 'Tickets for this event are no longer on sale');
        }

        const bookingId = `BKG-${crypto.randomUUID()}`;
        const bookingResult = await client.query(
          `WITH booking_time AS (SELECT clock_timestamp() AS created_at)
           INSERT INTO bookings
             (id, user_id, event_id, status, total_amount, created_at, updated_at, retained_until)
           SELECT $1, $2, $3, 'CONFIRMED', $4::numeric * $5::integer,
                  booking_time.created_at, booking_time.created_at,
                  booking_time.created_at + INTERVAL '1 year'
           FROM booking_time
           RETURNING id`,
          [bookingId, hold.user_id, hold.event_id, tierResult.rows[0].price, hold.quantity]
        );
        if (!bookingResult.rowCount) throw new Error(`Could not create booking for hold ${hold.id}`);

        const confirmed = await client.query(
          `UPDATE ticket_holds
           SET status = 'CONFIRMED', booking_id = $2, updated_at = now()
           WHERE id = $1 AND status = 'ACTIVE' AND expires_at > clock_timestamp()
           RETURNING id`,
          [hold.id, bookingId]
        );
        if (!confirmed.rowCount) {
          const error = new Error(`Hold ${hold.id} expired during confirmation`);
          error.code = 'HOLD_EXPIRED_DURING_CONFIRMATION';
          throw error;
        }

        const inventory = await client.query(
          `UPDATE ticket_tiers
           SET reserved = reserved - $2, sold = sold + $2
           WHERE id = $1 AND event_id = $3
             AND reserved >= $2 AND sold + $2 <= quota
           RETURNING id`,
          [hold.tier_id, hold.quantity, hold.event_id]
        );
        if (!inventory.rowCount) {
          throw new BookingConfirmationError(409, 'INVENTORY_UNAVAILABLE', 'Reserved ticket inventory is no longer available');
        }

        const ticketIds = Array.from({ length: hold.quantity }, () => `TKT-${crypto.randomUUID()}`);
        await client.query(
          `WITH ticket_time AS (SELECT clock_timestamp() AS issued_at)
           INSERT INTO tickets (id, booking_id, tier_id, status, issued_at, retained_until)
           SELECT ticket_id, $1, $2, 'VALID', ticket_time.issued_at,
                  ticket_time.issued_at + INTERVAL '1 year'
           FROM unnest($3::text[]) AS ticket_id
           CROSS JOIN ticket_time`,
          [bookingId, hold.tier_id, ticketIds]
        );

        await client.query(
          `INSERT INTO audit_log (actor_id, action, target)
           VALUES ($1, 'BOOKING_CONFIRMED', $2)`,
          [hold.user_id, bookingId]
        );

        if (hold.hold_type === 'WAITLIST_CLAIM') {
          const fulfilled = await client.query(
            `UPDATE waitlist_entries
             SET status = 'FULFILLED', updated_at = now()
             WHERE id = (
               SELECT waitlist_entry_id FROM waitlist_claims WHERE hold_id = $1
             ) AND status = 'CLAIMED'
             RETURNING id`,
            [hold.id]
          );
          if (!fulfilled.rowCount) {
            throw new Error(`Waitlist claim for hold ${hold.id} has no active queue entry`);
          }
        }

        booking = await loadBooking(client, bookingId);
        if (!booking || booking.tickets.length !== hold.quantity) {
          throw new Error(`Booking ${bookingId} was not fully created for hold ${hold.id}`);
        }

        await client.query('COMMIT');
        transactionOpen = false;
      }
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    if (error.code === 'HOLD_EXPIRED_DURING_CONFIRMATION') {
      expiredDuringConfirmation = true;
    } else {
      throw error;
    }
  } finally {
    client.release();
  }

  if (expiredDuringConfirmation) {
    await expireHoldAfterRollback(pool, holdId);
    throw new BookingConfirmationError(409, 'HOLD_EXPIRED', 'Ticket hold has expired and its inventory was released');
  }

  if (expired) {
    throw new BookingConfirmationError(409, 'HOLD_EXPIRED', 'Ticket hold has expired and its inventory was released');
  }

  for (const ticket of booking.tickets) registerTicket(ticket);

  try {
    const redis = await connectRedis();
    await redis.del(`${HOLD_KEY_PREFIX}${holdId}`);
  } catch (error) {
    console.error(`Booking ${booking.id} committed but Redis hold cleanup failed; reconciliation will retry:`, error.message);
  }

  return booking;
}

module.exports = { BookingConfirmationError, confirmBooking };
