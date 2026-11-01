const express = require('express');
const {
  getHealth,
  getLivenessController,
  getReadinessController,
} = require('../controllers/health.controller');

const router = express.Router();

/**
 * Health Check & Monitoring Routes (NFR-004 / Issue #35)
 */

// GET /api/health - Primary health endpoint (supports ?detailed=true)
router.get('/', getHealth);

// GET /api/health/live - Liveness probe
router.get('/live', getLivenessController);

// GET /api/health/ready - Readiness probe (database & dependency availability)
router.get('/ready', getReadinessController);

module.exports = router;
