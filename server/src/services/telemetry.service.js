const db = require('../config/db');
const { getConfirmedTicketsByEvent } = require('./ticket.service');
const EventModel = require('../models/event.model');

function getCheckinService() {
  return require('./checkin.service');
}

/**
 * In-memory registry of active SSE response streams grouped by eventId (SAD ADR-04).
 * Map<string, Set<Response>>
 */
const subscribers = new Map();

/**
 * Calculate live attendance and scan-velocity metrics for an event (FR-017).
 *
 * Derives figures strictly from confirmed booking/ticket records and
 * actual recorded check-in entries in both PostgreSQL and in-memory modes.
 *
 * @param {string} eventId
 * @param {number} [atTime=Date.now()] Optional timestamp for deterministic velocity testing
 * @returns {Promise<{
 *   eventId: string,
 *   totalAttendees: number,
 *   checkedInCount: number,
 *   attendancePercentage: number,
 *   scanVelocity: number,
 *   updatedAt: string
 * }>}
 */
async function calculateMetrics(eventId, atTime = Date.now()) {
  if (!eventId) {
    throw new Error('eventId is required to calculate telemetry metrics');
  }

  let totalAttendees = 0;
  let checkedInCount = 0;
  let scanVelocity = 0;
  const sixtySecondsAgo = new Date(atTime - 60000).toISOString();

  if (db.isPoolInitialized()) {
    const pool = db.getPool();

    // 1. Total confirmed/eligible attendees from persistent tickets JOIN bookings
    const ticketResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM tickets AS t
       JOIN bookings AS b ON b.id = t.booking_id
       WHERE b.event_id = $1
         AND b.status = 'CONFIRMED'
         AND t.status != 'CANCELLED'`,
      [eventId]
    );
    totalAttendees = ticketResult.rows[0]?.count || 0;

    // 2. Successful check-in counts and rolling 60-second velocity from check_in_logs
    const checkinResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_checked_in,
         COUNT(CASE WHEN checked_in_at >= $2 THEN 1 END)::int AS scan_velocity
       FROM check_in_logs
       WHERE event_id = $1`,
      [eventId, sixtySecondsAgo]
    );
    checkedInCount = checkinResult.rows[0]?.total_checked_in || 0;
    scanVelocity = checkinResult.rows[0]?.scan_velocity || 0;
  } else {
    // In-memory test / fallback repository mode
    const confirmedTickets = getConfirmedTicketsByEvent(eventId);
    totalAttendees = confirmedTickets.length;

    // Fallback: If no tickets registered directly in ticket.service, inspect EventModel
    if (totalAttendees === 0) {
      const event = await EventModel.findById(eventId);
      if (event && Array.isArray(event.tiers)) {
        totalAttendees = event.tiers.reduce((sum, t) => sum + (t.sold || 0), 0);
      }
    }

    const checkInRecords = getCheckinService().getCheckInRecords(eventId);
    checkedInCount = checkInRecords.length;

    const windowStartMs = atTime - 60000;
    scanVelocity = checkInRecords.filter((record) => {
      const scanTimeMs = new Date(record.checkedInAt).getTime();
      return !Number.isNaN(scanTimeMs) && scanTimeMs >= windowStartMs && scanTimeMs <= atTime;
    }).length;
  }

  // Attendance percentage with zero-denominator protection
  const attendancePercentage = totalAttendees > 0
    ? Number(Math.min(100, (checkedInCount / totalAttendees) * 100).toFixed(1))
    : 0;

  return {
    eventId,
    totalAttendees,
    checkedInCount,
    attendancePercentage,
    scanVelocity,
    updatedAt: new Date(atTime).toISOString(),
  };
}

/**
 * Register a client response stream for live telemetry on an event.
 *
 * @param {string} eventId
 * @param {import('express').Response} res
 * @returns {function} Unsubscribe callback to release reference on disconnect
 */
function addSubscriber(eventId, res) {
  if (!eventId || !res) return () => {};

  if (!subscribers.has(eventId)) {
    subscribers.set(eventId, new Set());
  }
  const clientSet = subscribers.get(eventId);
  clientSet.add(res);

  return function unsubscribe() {
    removeSubscriber(eventId, res);
  };
}

/**
 * Remove a client response stream.
 *
 * @param {string} eventId
 * @param {import('express').Response} res
 */
function removeSubscriber(eventId, res) {
  if (!eventId || !res) return;
  const clientSet = subscribers.get(eventId);
  if (clientSet) {
    clientSet.delete(res);
    if (clientSet.size === 0) {
      subscribers.delete(eventId);
    }
  }
}

/**
 * Returns number of active SSE subscribers for an event (used for verification).
 *
 * @param {string} eventId
 * @returns {number}
 */
function getSubscribersCount(eventId) {
  const clientSet = subscribers.get(eventId);
  return clientSet ? clientSet.size : 0;
}

/**
 * Clear all registered subscribers (used across test suites).
 */
function clearSubscribers() {
  subscribers.clear();
}

/**
 * Broadcast current metrics to all active subscribers for an event.
 *
 * @param {string} eventId
 * @returns {Promise<object|null>} The broadcasted metrics, or null if no subscribers
 */
async function broadcastMetrics(eventId) {
  if (!eventId) return null;
  const clientSet = subscribers.get(eventId);
  if (!clientSet || clientSet.size === 0) return null;

  const metrics = await calculateMetrics(eventId);
  const sseChunk = `data: ${JSON.stringify(metrics)}\n\n`;

  for (const res of Array.from(clientSet)) {
    try {
      if (res.writableEnded || res.destroyed) {
        clientSet.delete(res);
      } else {
        res.write(sseChunk);
      }
    } catch {
      clientSet.delete(res);
    }
  }

  if (clientSet.size === 0) {
    subscribers.delete(eventId);
  }

  return metrics;
}

/**
 * Triggered after a confirmed check-in write. Dispatches SSE update to listeners.
 * Non-blocking and never throws back to the check-in caller.
 *
 * @param {{ eventId: string, ticketId?: string }} checkIn
 */
async function notifyCheckIn(checkIn) {
  if (!checkIn || !checkIn.eventId) return;
  try {
    await broadcastMetrics(checkIn.eventId);
  } catch (error) {
    console.error('Failed to broadcast telemetry check-in update:', error.message);
  }
}

module.exports = {
  calculateMetrics,
  addSubscriber,
  removeSubscriber,
  getSubscribersCount,
  clearSubscribers,
  broadcastMetrics,
  notifyCheckIn,
};
