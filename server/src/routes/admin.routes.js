const express = require('express');
const controller = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();

// FR-019, SEC-005: every admin route needs an ADMIN token
router.use(authenticate, authorize(['ADMIN']));

// Audit log review endpoint (SEC-005 AC-3)
router.get('/audit-logs', controller.listAuditLogs);

// Availability monitoring review endpoint (NFR-004 AC-3)
router.get('/availability', controller.getAvailability);

router.get('/events', controller.listEvents);
router.post('/events/:id/approve', controller.approveEvent);
router.post('/events/:id/reject', controller.rejectEvent);
router.post('/events/:id/flag', controller.flagEvent);
router.post('/events/:id/unflag', controller.unflagEvent);
router.post('/events/:id/remove', controller.removeEvent);

router.get('/users', controller.listUsers);
router.post('/users/:id/deactivate', controller.deactivateUser);
router.post('/users/:id/reactivate', controller.reactivateUser);

module.exports = router;
