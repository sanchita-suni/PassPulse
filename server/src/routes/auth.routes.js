const express = require('express');
const router = express.Router();
const { register, login, getProfile } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getProfile);

router.get('/organizer-only', authenticate, authorize(['ORGANIZER', 'ADMIN']), (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome Organizer/Admin! Access granted.',
    user: req.user,
  });
});

router.get('/admin-only', authenticate, authorize(['ADMIN']), (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome Admin! Administrative access granted.',
    user: req.user,
  });
});

module.exports = router;
