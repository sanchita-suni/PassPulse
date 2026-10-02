const { verifyQrPass } = require('./qr.service');

const checkInRecords = new Map();

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

  return {
    valid: true,
  };
}

/**
 * Validates a QR pass and records a check-in.
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

  const validation = validateCheckInData({
    ticketId,
    eventId,
    userId,
    ticketStatus,
    bookingConfirmationStatus,
  });

  if (!validation.valid) {
    return {
      success: false,
      reason: validation.reason,
    };
  }

  if (qrEventId !== eventId) {
    return {
      success: false,
      reason: 'WRONG_EVENT',
    };
  }

  if (checkInRecords.has(ticketId)) {
    return {
      success: false,
      reason: 'DUPLICATE_ENTRY',
      checkIn: checkInRecords.get(ticketId),
    };
  }

  const checkIn = {
    ticketId,
    eventId,
    userId,
    ticketStatus,
    bookingConfirmationStatus,
    checkedInAt: new Date().toISOString(),
  };

  checkInRecords.set(ticketId, checkIn);

  return {
    success: true,
    reason: 'CHECKED_IN',
    checkIn,
  };
}

function clearCheckInRecords() {
  checkInRecords.clear();
}

module.exports = {
  validateCheckInData,
  processCheckIn,
  clearCheckInRecords,
};