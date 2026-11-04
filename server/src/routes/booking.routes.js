const express = require('express');
const {
  createTicketHold,
  confirmTicketBooking,
  joinTicketWaitlist,
  getAttendeeNotifications,
  acceptTicketClaim,
  declineTicketClaim,
} = require('../controllers/booking.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();

router.post('/hold', authenticate, authorize(['ATTENDEE']), createTicketHold);
router.post('/confirm', authenticate, authorize(['ATTENDEE']), confirmTicketBooking);
router.post('/waitlist', authenticate, authorize(['ATTENDEE']), joinTicketWaitlist);
router.get('/notifications', authenticate, authorize(['ATTENDEE']), getAttendeeNotifications);
router.post('/claims/:claimId/accept', authenticate, authorize(['ATTENDEE']), acceptTicketClaim);
router.post('/claims/:claimId/decline', authenticate, authorize(['ATTENDEE']), declineTicketClaim);

module.exports = router;
