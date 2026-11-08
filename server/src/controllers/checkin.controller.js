const {
  processCheckIn,
  processPersistentCheckIn,
} = require('../services/checkin.service');
const { getPersistentTicketById } = require('../services/ticket.service');
const { isPoolInitialized } = require('../config/db');

async function verifyCheckIn(req, res, next) {
  try {
    const {
      qrData,
      eventId,
      ticketStatus,
      bookingConfirmationStatus,
    } = req.body;

    if (
      !qrData ||
      !eventId ||
      !ticketStatus ||
      !bookingConfirmationStatus
    ) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_CHECKIN_REQUEST',
        message:
          'qrData, eventId, ticketStatus and bookingConfirmationStatus are required',
      });
    }

    let persistentTicket = null;
    try {
      const parsedQr = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
      if (parsedQr && parsedQr.ticketId) {
        persistentTicket = await getPersistentTicketById(parsedQr.ticketId);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        // processCheckIn reports malformed QR payloads using the existing API contract.
      } else {
        return next(error);
      }
    }

    const result = persistentTicket || isPoolInitialized()
      ? await processPersistentCheckIn({
        qrData,
        eventId,
        scannedBy: req.user && (req.user.userId || req.user.id),
        ipAddress: req.ip,
      })
      : processCheckIn({
        qrData,
        eventId,
        ticketStatus,
        bookingConfirmationStatus,
      });

    if (!result.success) {
      const statusByReason = {
        DUPLICATE_ENTRY: 409,
        WRONG_EVENT: 400,
        INVALID_SIGNATURE: 400,
        EXPIRED_QR: 400,
        INVALID_QR_FORMAT: 400,
        MISSING_QR_FIELDS: 400,
        MISSING_CHECKIN_FIELDS: 400,
        INVALID_TICKET_STATUS: 400,
        UNCONFIRMED_BOOKING: 400,
        TICKET_NOT_FOUND: 404,
      };

      return res.status(statusByReason[result.reason] || 400).json({
        status: 'error',
        code: result.reason,
        message: 'Check-in rejected',
      });
    }

    return res.status(200).json({
      status: 'success',
      code: 'CHECKED_IN',
      data: result.checkIn,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifyCheckIn,
};
