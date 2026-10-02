const express = require('express');
const { verifyCheckIn } = require('../controllers/checkin.controller');

const router = express.Router();

router.post('/verify', verifyCheckIn);

module.exports = router;
