const express = require('express');
const { createQrPass } = require('../controllers/qr.controller');

const router = express.Router();

router.post('/pass', createQrPass);

module.exports = router;
