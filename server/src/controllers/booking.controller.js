const {
  createHold,
  BookingHoldError,
} = require('../services/booking-hold.service');
const {
  confirmBooking,
  BookingConfirmationError,
} = require('../services/booking-confirmation.service');
const {
  joinWaitlist,
  listNotifications,
  acceptClaim,
  declineClaim,
  WaitlistError,
} = require('../services/waitlist.service');

async function createTicketHold(req, res, next) {
  try {
    const userId = req.user.id || req.user.userId;
    const hold = await createHold({
      userId,
      eventId: req.body && req.body.eventId,
      tierId: req.body && req.body.tierId,
      quantity: req.body && req.body.quantity,
    });
    return res.status(201).json({ status: 'success', hold });
  } catch (error) {
    if (error instanceof BookingHoldError) {
      return res.status(error.status).json({
        status: 'error',
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
}

async function confirmTicketBooking(req, res, next) {
  try {
    const userId = req.user.id || req.user.userId;
    const booking = await confirmBooking({
      userId,
      holdId: req.body && req.body.holdId,
    });
    return res.status(200).json({ status: 'success', booking });
  } catch (error) {
    if (error instanceof BookingHoldError || error instanceof BookingConfirmationError) {
      return res.status(error.status).json({
        status: 'error',
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
}

function handleBookingError(error, res, next) {
  if (error instanceof BookingHoldError
      || error instanceof BookingConfirmationError
      || error instanceof WaitlistError) {
    return res.status(error.status).json({
      status: 'error',
      code: error.code,
      message: error.message,
    });
  }
  return next(error);
}

async function joinTicketWaitlist(req, res, next) {
  try {
    const userId = req.user.id || req.user.userId;
    const waitlist = await joinWaitlist({
      userId,
      eventId: req.body && req.body.eventId,
      tierId: req.body && req.body.tierId,
      quantity: req.body && req.body.quantity,
    });
    return res.status(201).json({ status: 'success', waitlist });
  } catch (error) {
    return handleBookingError(error, res, next);
  }
}

async function getAttendeeNotifications(req, res, next) {
  try {
    const userId = req.user.id || req.user.userId;
    const notifications = await listNotifications(userId);
    return res.status(200).json({ status: 'success', notifications });
  } catch (error) {
    return handleBookingError(error, res, next);
  }
}

async function acceptTicketClaim(req, res, next) {
  try {
    const userId = req.user.id || req.user.userId;
    const claim = await acceptClaim({ userId, claimId: req.params.claimId });
    return res.status(200).json({ status: 'success', claim });
  } catch (error) {
    return handleBookingError(error, res, next);
  }
}

async function declineTicketClaim(req, res, next) {
  try {
    const userId = req.user.id || req.user.userId;
    const claim = await declineClaim({ userId, claimId: req.params.claimId });
    return res.status(200).json({ status: 'success', claim });
  } catch (error) {
    return handleBookingError(error, res, next);
  }
}

module.exports = {
  createTicketHold,
  confirmTicketBooking,
  joinTicketWaitlist,
  getAttendeeNotifications,
  acceptTicketClaim,
  declineTicketClaim,
};
