const express = require('express');
const {
  createQrPass,
  getAttendeePassController,
  getAttendeeTicketsController,
  getDemoTokenController,
} = require('../controllers/qr.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();

// Internal QR pass generation endpoint (FR-011) - restricted to staff/admin to prevent arbitrary public pass minting
router.post('/pass', requireAuth, authorize(['STAFF', 'ADMIN']), createQrPass);

// Attendee token generator for testing / demo auth
router.get('/token', getDemoTokenController);

// Confirmed attendee digital pass screen endpoint (FR-012)
router.get('/pass/:ticketId', requireAuth, getAttendeePassController);

// Attendee ticket collection endpoint
router.get('/tickets', requireAuth, getAttendeeTicketsController);

module.exports = router;
