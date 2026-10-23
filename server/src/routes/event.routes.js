const express = require('express');
const controller = require('../controllers/event.controller');
const tierController = require('../controllers/tier.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

const router = express.Router();
const organizerOnly = [authenticate, authorize(['ORGANIZER', 'ADMIN'])];

// Public catalog (FR-004)
router.get('/', controller.listEvents);
router.get('/categories', controller.listCategories);

// Organizer event management (FR-005)
router.get('/mine', ...organizerOnly, controller.listMyEvents);
router.post('/', ...organizerOnly, controller.createEvent);
router.get('/:id/manage', ...organizerOnly, controller.getManagedEvent);
router.put('/:id', ...organizerOnly, controller.updateEvent);
router.post('/:id/cancel', ...organizerOnly, controller.cancelEvent);

// Ticket tiers (FR-007)
router.get('/:id/tiers', ...organizerOnly, tierController.listTiers);
router.post('/:id/tiers', ...organizerOnly, tierController.addTier);
router.put('/:id/tiers/:tierId', ...organizerOnly, tierController.updateTier);
router.delete('/:id/tiers/:tierId', ...organizerOnly, tierController.removeTier);

router.get('/:id', controller.getEvent);

module.exports = router;
