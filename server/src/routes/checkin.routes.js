const express = require('express');
const { verifyCheckIn } = require('../controllers/checkin.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();

// Gate check-in verification restricted to authorized gate roles (FR-013)
router.post(
  '/verify',
  requireAuth,
  authorize(['GATE_STAFF', 'STAFF', 'ADMIN']),
  verifyCheckIn
);

module.exports = router;
