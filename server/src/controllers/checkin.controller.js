const { processCheckIn } = require('../services/checkin.service');

function verifyCheckIn(req, res, next) {
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

    const result = processCheckIn({
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