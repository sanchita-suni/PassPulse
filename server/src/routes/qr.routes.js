const express = require('express');
const {
  createQrPass,
  getAttendeePassController,
  getAttendeeTicketsController,
  getDemoTokenController,
} = require('../controllers/qr.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// Raw QR pass generation endpoint (FR-011)
router.post('/pass', createQrPass);

// Attendee token generator for testing / demo auth
router.get('/token', getDemoTokenController);

// Confirmed attendee digital pass screen endpoint (FR-012)
router.get('/pass/:ticketId', requireAuth, getAttendeePassController);

// Attendee ticket collection endpoint
router.get('/tickets', requireAuth, getAttendeeTicketsController);

module.exports = router;
