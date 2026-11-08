/**
 * Health check routes (NFR-004 / Issue #35)
 */
const express = require('express');
const controller = require('../controllers/health.controller');

const router = express.Router();

router.get('/', controller.getHealth);
router.get('/live', controller.getLiveness);
router.get('/ready', controller.getReadiness);

module.exports = router;
