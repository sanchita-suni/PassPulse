const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const {
  exportAttendanceReport,
  exportRevenueReport,
  exportGenericReport,
} = require('../controllers/report.controller');

const router = express.Router();

/**
 * Fallback middleware for authenticated file downloads via URL query parameter.
 * Prefers existing Authorization: Bearer <token> header when present.
 */
function extractQueryToken(req, res, next) {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

// All report export endpoints require authentication and ORGANIZER or ADMIN role (FR-018)
router.use(extractQueryToken);
router.use(authenticate);
router.use(authorize(['ORGANIZER', 'ADMIN']));

// GET /api/reports/:eventId/attendance?format=csv|pdf
router.get('/:eventId/attendance', exportAttendanceReport);

// GET /api/reports/:eventId/revenue?format=csv|pdf
router.get('/:eventId/revenue', exportRevenueReport);

// GET /api/reports/:eventId/export?type=attendance|revenue&format=csv|pdf
router.get('/:eventId/export', exportGenericReport);

module.exports = router;
