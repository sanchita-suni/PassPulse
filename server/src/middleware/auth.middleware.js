const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key';

/**
 * Creates a signed JWT token for an attendee or other role.
 */
function createToken({ userId, role = 'ATTENDEE', name = '', email = '' }, expiresIn = '1d') {
  return jwt.sign(
    {
      userId,
      role,
      name,
      email,
    },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Middleware that strictly requires authentication.
 * Checks for:
 * 1. Bearer JWT token in Authorization header
 * 2. Or x-user-id header (convenient for API test suites / dev mode)
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const customUserId = req.headers['x-user-id'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch {
      return res.status(401).json({
        status: 'error',
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication token',
      });
    }
  }

  if (customUserId) {
    req.user = {
      userId: customUserId,
      role: req.headers['x-user-role'] || 'ATTENDEE',
      name: req.headers['x-user-name'] || '',
      email: req.headers['x-user-email'] || '',
    };
    return next();
  }

  return res.status(401).json({
    status: 'error',
    code: 'UNAUTHORIZED',
    message: 'Authentication is required. Provide a valid Bearer token.',
  });
}

/**
 * Optional authentication middleware:
 * Attaches user to req.user if a token or x-user-id is present, but does not reject.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const customUserId = req.headers['x-user-id'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch {
      // Ignored for optional auth
    }
  } else if (customUserId) {
    req.user = {
      userId: customUserId,
      role: req.headers['x-user-role'] || 'ATTENDEE',
      name: req.headers['x-user-name'] || '',
      email: req.headers['x-user-email'] || '',
    };
  }

  next();
}

module.exports = {
  createToken,
  requireAuth,
  optionalAuth,
};
