const telemetryService = require('../services/telemetry.service');
const { getManageableEvent, EventError } = require('../services/event.service');
const db = require('../config/db');

/**
 * Validates that the event exists and that the authenticated user
 * is authorized to view its live telemetry (ORGANIZER owner or ADMIN).
 *
 * Enforces FR-005, SEC-002, and SAD 3.9 ownership boundary.
 * Supports both in-memory EventModel and persistent PostgreSQL store.
 *
 * @param {string} eventId
 * @param {object} user
 * @returns {Promise<object>} The validated event record
 */
async function verifyEventAccess(eventId, user) {
  try {
    return await getManageableEvent(eventId, user);
  } catch (err) {
    // If not found in in-memory EventModel, check PostgreSQL when initialized
    if (err.code === 'EVENT_NOT_FOUND' && db.isPoolInitialized()) {
      const pool = db.getPool();
      const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
      if (!rows.length) {
        throw new EventError(404, 'EVENT_NOT_FOUND', 'Event not found');
      }
      const dbEvent = rows[0];
      const role = (user.role || '').toUpperCase();
      const isAdmin = role === 'ADMIN';
      const userId = user.id || user.userId;
      if (!isAdmin && dbEvent.organizer_id !== userId) {
        throw new EventError(403, 'NOT_EVENT_OWNER', 'You can only manage your own events');
      }
      return dbEvent;
    }
    throw err;
  }
}

/**
 * GET /api/telemetry/:eventId
 * Retrieves a one-off telemetry snapshot for the organizer dashboard (FR-017).
 */
async function getTelemetry(req, res, next) {
  try {
    const { eventId } = req.params;
    await verifyEventAccess(eventId, req.user);
    const metrics = await telemetryService.calculateMetrics(eventId);
    return res.status(200).json({
      status: 'success',
      data: metrics,
    });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({
        status: 'error',
        code: err.code,
        message: err.message,
      });
    }
    return next(err);
  }
}

/**
 * GET /api/telemetry/:eventId/stream
 * Establishes a persistent Server-Sent Events (SSE) feed for live attendance
 * and scan-velocity updates (FR-017, SAD ADR-04).
 */
async function streamTelemetry(req, res, next) {
  let heartbeatTimer = null;
  let unsubscribe = null;

  try {
    const { eventId } = req.params;
    await verifyEventAccess(eventId, req.user);

    // Set standard SSE streaming headers per SAD ADR-04
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Subscribe to check-in notification events for this event
    unsubscribe = telemetryService.addSubscriber(eventId, res);

    // Immediate initial snapshot delivery
    const initialMetrics = await telemetryService.calculateMetrics(eventId);
    res.write(`data: ${JSON.stringify(initialMetrics)}\n\n`);

    // 15-second heartbeat and velocity refresh (ADR-04)
    const heartbeatIntervalMs = Number(process.env.TELEMETRY_HEARTBEAT_MS) || 15000;
    heartbeatTimer = setInterval(async () => {
      try {
        if (res.writableEnded || res.destroyed) {
          cleanup();
          return;
        }
        res.write(': keep-alive\n\n');
        const refreshed = await telemetryService.calculateMetrics(eventId);
        res.write(`data: ${JSON.stringify(refreshed)}\n\n`);
      } catch {
        cleanup();
      }
    }, heartbeatIntervalMs);

    if (heartbeatTimer.unref) {
      heartbeatTimer.unref();
    }

    function cleanup() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }

    req.on('close', cleanup);
    req.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  } catch (err) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (unsubscribe) unsubscribe();

    if (res.headersSent) {
      return res.end();
    }

    if (err.status && err.code) {
      return res.status(err.status).json({
        status: 'error',
        code: err.code,
        message: err.message,
      });
    }
    return next(err);
  }
}

module.exports = {
  getTelemetry,
  streamTelemetry,
  verifyEventAccess,
};
