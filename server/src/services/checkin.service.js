const { verifyQrPass } = require('./qr.service');
const { getTicketById } = require('./ticket.service');
const { getPool } = require('../config/db');
const auditService = require('./audit.service');

function notifyTelemetry(checkIn) {
  try {
    const telemetryService = require('./telemetry.service');
    if (telemetryService && typeof telemetryService.notifyCheckIn === 'function') {
      telemetryService.notifyCheckIn(checkIn);
    }
  } catch {
    // Telemetry dispatch failure must never abort a confirmed check-in
  }
}

// Legacy no-database test fixtures use this path; the running API persists check-ins in PostgreSQL.
const checkInRecords = new Map();
const inFlightLocks = new Set();

function validateCheckInData({
  ticketId,
  eventId,
  userId,
  ticketStatus,
  bookingConfirmationStatus,
}) {
  if (
    !ticketId ||
    !eventId ||
    !userId ||
    !ticketStatus ||
    !bookingConfirmationStatus
  ) {
    return { valid: false, reason: 'MISSING_CHECKIN_FIELDS' };
  }
  if (ticketStatus !== 'VALID') {
    return { valid: false, reason: 'INVALID_TICKET_STATUS' };
  }
  if (bookingConfirmationStatus !== 'CONFIRMED') {
    return { valid: false, reason: 'UNCONFIRMED_BOOKING' };
  }
  return { valid: true };
}

/**
 * Validates a QR pass and records a check-in.
 * Guarantees that at most one successful check-in is recorded per ticket,
 * rejecting duplicate scans and concurrent scans with DUPLICATE_ENTRY.
 *
 * Enforces ticket existence in official ticket repository (FR-011 / FR-014).
 * Derives effective statuses exclusively from official repository records.
 * Never uses client-supplied status values as authoritative values.
 */
function processCheckIn({
  qrData,
  eventId,
  ticketStatus: _clientTicketStatus,
  bookingConfirmationStatus: _clientBookingConfirmationStatus,
  scannedBy,
  ipAddress,
}) {
  const qrResult = verifyQrPass(qrData);
  const targetTicketId = getTicketIdFromQr(qrData);
  if (!qrResult.valid) {
    auditService.recordAudit({
      actorId: scannedBy,
      action: 'CHECK_IN_REJECTED',
      target: targetTicketId,
      ipAddress,
    });
    return { success: false, reason: qrResult.reason };
  }

  const { ticketId, eventId: qrEventId, userId } = qrResult.payload;
  if (qrEventId !== eventId) {
    auditService.recordAudit({
      actorId: scannedBy,
      action: 'CHECK_IN_REJECTED',
      target: ticketId,
      ipAddress,
    });
    return { success: false, reason: 'WRONG_EVENT' };
  }

  // Enforce ticket existence in central repository - reject unrecorded tickets
  const existingTicket = typeof getTicketById === 'function' ? getTicketById(ticketId) : null;
  if (!existingTicket) {
    auditService.recordAudit({
      actorId: scannedBy,
      action: 'CHECK_IN_REJECTED',
      target: ticketId,
      ipAddress,
    });
    return {
      success: false,
      reason: 'TICKET_NOT_FOUND',
    };
  }

  // Derive effective statuses EXCLUSIVELY from official repository record
  // Client-supplied status values are never used as authoritative values
  const effectiveTicketStatus = existingTicket.ticketStatus;
  const effectiveBookingStatus = existingTicket.bookingConfirmationStatus;

  const validation = validateCheckInData({
    ticketId,
    eventId,
    userId,
    ticketStatus: effectiveTicketStatus,
    bookingConfirmationStatus: effectiveBookingStatus,
  });
  if (!validation.valid) {
    auditService.recordAudit({
      actorId: scannedBy,
      action: 'CHECK_IN_REJECTED',
      target: ticketId,
      ipAddress,
    });
    return { success: false, reason: validation.reason };
  }

  if (checkInRecords.has(ticketId) || inFlightLocks.has(ticketId)) {
    auditService.recordAudit({
      actorId: scannedBy,
      action: 'CHECK_IN_REJECTED',
      target: ticketId,
      ipAddress,
    });
    return {
      success: false,
      reason: 'DUPLICATE_ENTRY',
      checkIn: checkInRecords.get(ticketId) || null,
    };
  }

  inFlightLocks.add(ticketId);
  try {
    const checkIn = {
      ticketId,
      eventId,
      userId,
      ticketStatus: effectiveTicketStatus,
      bookingConfirmationStatus: effectiveBookingStatus,
      checkedInAt: new Date().toISOString(),
    };
    checkInRecords.set(ticketId, checkIn);

    // Sync with central ticket model if present
    if (existingTicket) {
      existingTicket.isCheckedIn = true;
      existingTicket.checkedInAt = checkIn.checkedInAt;
    }

    notifyTelemetry(checkIn);

    return { success: true, reason: 'CHECKED_IN', checkIn };
  } finally {
    inFlightLocks.delete(ticketId);
  }
}

function getTicketIdFromQr(qrData) {
  try {
    const parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    return parsed && typeof parsed.ticketId === 'string' ? parsed.ticketId : null;
  } catch {
    return null;
  }
}

async function writeAuditEvent(client, { actorId, action, target, ipAddress }) {
  await auditService.recordAudit({
    client,
    actorId,
    action,
    target,
    ipAddress,
  });
}

async function recordRejectedCheckIn({ actorId, ticketId, ipAddress }) {
  await auditService.recordAudit({
    actorId,
    action: 'CHECK_IN_REJECTED',
    target: ticketId,
    ipAddress,
  });
}

async function processPersistentCheckIn({
  qrData,
  eventId,
  scannedBy,
  ipAddress,
}) {
  const qrResult = verifyQrPass(qrData);
  const targetTicketId = getTicketIdFromQr(qrData);
  if (!qrResult.valid) {
    await recordRejectedCheckIn({ actorId: scannedBy, ticketId: targetTicketId, ipAddress });
    return { success: false, reason: qrResult.reason };
  }

  const { ticketId, eventId: qrEventId, userId } = qrResult.payload;
  const pool = getPool();
  if (qrEventId !== eventId) {
    await recordRejectedCheckIn({ actorId: scannedBy, ticketId, ipAddress });
    return { success: false, reason: 'WRONG_EVENT' };
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const ticketResult = await client.query(
      `SELECT ticket.id AS ticket_id, ticket.status AS ticket_status,
              booking.status AS booking_status, booking.event_id, booking.user_id
       FROM tickets AS ticket
       JOIN bookings AS booking ON booking.id = ticket.booking_id
       WHERE ticket.id = $1
       FOR UPDATE OF ticket, booking`,
      [ticketId]
    );

    if (!ticketResult.rowCount) {
      await writeAuditEvent(client, {
        actorId: scannedBy,
        action: 'CHECK_IN_REJECTED',
        target: ticketId,
        ipAddress,
      });
      await client.query('COMMIT');
      transactionOpen = false;
      return { success: false, reason: 'TICKET_NOT_FOUND' };
    }

    const ticket = ticketResult.rows[0];
    let rejectionReason = null;
    if (ticket.event_id !== eventId || ticket.event_id !== qrEventId) {
      rejectionReason = 'WRONG_EVENT';
    } else if (ticket.user_id !== userId) {
      rejectionReason = 'INVALID_QR_FORMAT';
    } else if (ticket.ticket_status !== 'VALID') {
      rejectionReason = 'INVALID_TICKET_STATUS';
    } else if (ticket.booking_status !== 'CONFIRMED') {
      rejectionReason = 'UNCONFIRMED_BOOKING';
    }

    if (rejectionReason) {
      await writeAuditEvent(client, {
        actorId: scannedBy,
        action: 'CHECK_IN_REJECTED',
        target: ticketId,
        ipAddress,
      });
      await client.query('COMMIT');
      transactionOpen = false;
      return { success: false, reason: rejectionReason };
    }

    const result = await client.query(
      `INSERT INTO check_in_logs (ticket_id, event_id, scanned_by)
       VALUES ($1, $2, (SELECT id FROM users WHERE id = $3))
       ON CONFLICT (ticket_id) DO NOTHING
       RETURNING id, ticket_id, event_id, scanned_by, checked_in_at`,
      [ticketId, ticket.event_id, scannedBy || null]
    );
    if (!result.rowCount) {
      await writeAuditEvent(client, {
        actorId: scannedBy,
        action: 'CHECK_IN_REJECTED',
        target: ticketId,
        ipAddress,
      });
      await client.query('COMMIT');
      transactionOpen = false;
      return { success: false, reason: 'DUPLICATE_ENTRY' };
    }

    await writeAuditEvent(client, {
      actorId: scannedBy,
      action: 'CHECK_IN_ACCEPTED',
      target: ticketId,
      ipAddress,
    });
    const checkIn = {
      ticketId: result.rows[0].ticket_id,
      eventId: result.rows[0].event_id,
      userId: ticket.user_id,
      scannedBy: result.rows[0].scanned_by,
      ticketStatus: ticket.ticket_status,
      bookingConfirmationStatus: ticket.booking_status,
      checkedInAt: result.rows[0].checked_in_at,
    };

    await client.query('COMMIT');
    transactionOpen = false;

    notifyTelemetry(checkIn);

    return { success: true, reason: 'CHECKED_IN', checkIn };
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getPersistentCheckInRecord(ticketId) {
  if (!ticketId) return null;
  const { rows } = await getPool().query(
    `SELECT logs.ticket_id, logs.event_id, booking.user_id, logs.scanned_by,
            ticket.status AS ticket_status, booking.status AS booking_status,
            logs.checked_in_at
     FROM check_in_logs AS logs
     JOIN tickets AS ticket ON ticket.id = logs.ticket_id
     JOIN bookings AS booking ON booking.id = ticket.booking_id
     WHERE logs.ticket_id = $1`,
    [ticketId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ticketId: row.ticket_id,
    eventId: row.event_id,
    userId: row.user_id,
    scannedBy: row.scanned_by,
    ticketStatus: row.ticket_status,
    bookingConfirmationStatus: row.booking_status,
    checkedInAt: row.checked_in_at,
  };
}

async function getPersistentCheckInRecords(eventId) {
  const { rows } = await getPool().query(
    `SELECT logs.ticket_id, logs.event_id, booking.user_id, logs.scanned_by,
            ticket.status AS ticket_status, booking.status AS booking_status,
            logs.checked_in_at
     FROM check_in_logs AS logs
     JOIN tickets AS ticket ON ticket.id = logs.ticket_id
     JOIN bookings AS booking ON booking.id = ticket.booking_id
     WHERE ($1::text IS NULL OR logs.event_id = $1)
     ORDER BY logs.checked_in_at, logs.id`,
    [eventId || null]
  );
  return rows.map((row) => ({
    ticketId: row.ticket_id,
    eventId: row.event_id,
    userId: row.user_id,
    scannedBy: row.scanned_by,
    ticketStatus: row.ticket_status,
    bookingConfirmationStatus: row.booking_status,
    checkedInAt: row.checked_in_at,
  }));
}

function getCheckInRecord(ticketId) {
  if (!ticketId) return null;
  const record = checkInRecords.get(ticketId);
  return record ? { ...record } : null;
}

function getCheckInRecords(eventId) {
  const records = Array.from(checkInRecords.values()).map((record) => ({ ...record }));
  return eventId ? records.filter((record) => record.eventId === eventId) : records;
}

function getCheckInCount(eventId) {
  if (eventId) {
    return Array.from(checkInRecords.values())
      .filter((record) => record.eventId === eventId).length;
  }
  return checkInRecords.size;
}

function clearCheckInRecords() {
  checkInRecords.clear();
  inFlightLocks.clear();
}

module.exports = {
  validateCheckInData,
  processCheckIn,
  processPersistentCheckIn,
  getPersistentCheckInRecord,
  getPersistentCheckInRecords,
  getCheckInRecord,
  getCheckInRecords,
  getCheckInCount,
  clearCheckInRecords,
};
