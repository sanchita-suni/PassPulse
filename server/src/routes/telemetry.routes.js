const express = require('express');
const { streamTelemetry, getTelemetry } = require('../controllers/telemetry.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();

/**
 * Narrow authentication adapter for SSE streams.
 * If the client cannot provide an Authorization header (e.g. native EventSource in older browsers),
 * accepts token from query parameter ?token=... and maps it to req.headers.authorization.
 * Never logs or exposes the token.
 */
function extractQueryToken(req, res, next) {
  if (!req.headers.authorization && req.query && typeof req.query.token === 'string') {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

const organizerOrAdmin = [extractQueryToken, authenticate, authorize(['ORGANIZER', 'ADMIN'])];

// FR-017 / SAD ADR-04: Real-time attendance and scan-velocity dashboard stream
router.get('/:eventId/stream', ...organizerOrAdmin, streamTelemetry);

// REST snapshot endpoint for initial load or polling fallback
router.get('/:eventId', ...organizerOrAdmin, getTelemetry);

module.exports = router;
