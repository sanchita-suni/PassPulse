const { verifyQrPass } = require('./qr.service');
const { getTicketById } = require('./ticket.service');

const checkInRecords = new Map();
const inFlightLocks = new Set();

/**
 * Validates the check-in data required by FR-013/FR-014.
 *
 * This is currently an in-memory implementation.
 * It will later be replaced/integrated with the team's
 * PostgreSQL booking/ticket model.
 */
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
    return {
      valid: false,
      reason: 'MISSING_CHECKIN_FIELDS',
    };
  }

  if (ticketStatus !== 'VALID') {
    return {
      valid: false,
      reason: 'INVALID_TICKET_STATUS',
    };
  }

  if (bookingConfirmationStatus !== 'CONFIRMED') {
    return {
      valid: false,
      reason: 'UNCONFIRMED_BOOKING',
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validates a QR pass and records a check-in.
 * Guarantees that at most one successful check-in is recorded per ticket,
 * rejecting duplicate scans and concurrent scans with DUPLICATE_ENTRY.
 */
function processCheckIn({
  qrData,
  eventId,
  ticketStatus,
  bookingConfirmationStatus,
}) {
  const qrResult = verifyQrPass(qrData);

  if (!qrResult.valid) {
    return {
      success: false,
      reason: qrResult.reason,
    };
  }

  const {
    ticketId,
    eventId: qrEventId,
    userId,
  } = qrResult.payload;

  if (qrEventId !== eventId) {
    return {
      success: false,
      reason: 'WRONG_EVENT',
    };
  }

  // Cross-reference with central ticket repository if ticket is registered
  let effectiveTicketStatus = ticketStatus;
  let effectiveBookingStatus = bookingConfirmationStatus;

  if (typeof getTicketById === 'function') {
    const existingTicket = getTicketById(ticketId);
    if (existingTicket) {
      if (existingTicket.ticketStatus) {
        effectiveTicketStatus = existingTicket.ticketStatus;
      }
      if (existingTicket.bookingConfirmationStatus) {
        effectiveBookingStatus = existingTicket.bookingConfirmationStatus;
      }
    }
  }

  const validation = validateCheckInData({
    ticketId,
    eventId,
    userId,
    ticketStatus: effectiveTicketStatus,
    bookingConfirmationStatus: effectiveBookingStatus,
  });

  if (!validation.valid) {
    return {
      success: false,
      reason: validation.reason,
    };
  }

  // Atomic check-in & duplicate prevention guard (handles concurrent calls safely)
  if (checkInRecords.has(ticketId) || inFlightLocks.has(ticketId)) {
    return {
      success: false,
      reason: 'DUPLICATE_ENTRY',
      checkIn: checkInRecords.get(ticketId) || null,
    };
  }

  inFlightLocks.add(ticketId);

  try {
    // Record check-in with immutable ISO timestamp
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
    if (typeof getTicketById === 'function') {
      const existingTicket = getTicketById(ticketId);
      if (existingTicket) {
        existingTicket.isCheckedIn = true;
        existingTicket.checkedInAt = checkIn.checkedInAt;
      }
    }

    return {
      success: true,
      reason: 'CHECKED_IN',
      checkIn,
    };
  } finally {
    inFlightLocks.delete(ticketId);
  }
}

/**
 * Retrieves the recorded check-in for a ticket if present.
 */
function getCheckInRecord(ticketId) {
  if (!ticketId) return null;
  const record = checkInRecords.get(ticketId);
  return record ? { ...record } : null;
}

/**
 * Retrieves all check-in records, optionally filtered by eventId.
 */
function getCheckInRecords(eventId) {
  const records = Array.from(checkInRecords.values()).map((r) => ({ ...r }));
  if (eventId) {
    return records.filter((r) => r.eventId === eventId);
  }
  return records;
}

/**
 * Returns the count of unique check-in records recorded.
 */
function getCheckInCount(eventId) {
  if (eventId) {
    return Array.from(checkInRecords.values()).filter((r) => r.eventId === eventId).length;
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
  getCheckInRecord,
  getCheckInRecords,
  getCheckInCount,
  clearCheckInRecords,
};
