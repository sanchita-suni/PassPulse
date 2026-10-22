const express = require('express');
const controller = require('../controllers/event.controller');

const router = express.Router();

// Public catalog (FR-004)
router.get('/', controller.listEvents);
router.get('/categories', controller.listCategories);
router.get('/:id', controller.getEvent);

module.exports = router;
