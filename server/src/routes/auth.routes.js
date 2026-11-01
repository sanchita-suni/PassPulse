const express = require('express');
const router = express.Router();
const { register, login, getProfile, provisionUser } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');

// Public endpoints
router.post('/register', register);
router.post('/login', login);

// Authenticated user profile
router.get('/me', authenticate, getProfile);

// Admin-only privileged user provisioning endpoint (SEC-002, CWE-269)
router.post('/provision', authenticate, authorize(['ADMIN']), provisionUser);

// Role-protected test verification routes
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
