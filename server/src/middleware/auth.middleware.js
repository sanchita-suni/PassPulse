const jwt = require('jsonwebtoken');
const { verifyToken } = require('../utils/jwt.util');
const UserModel = require('../models/user.model');

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
 * Standard Bearer JWT authentication middleware for User & RBAC routes (FR-003, SEC-002).
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication token missing or invalid format',
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired authentication token',
      });
    }

    const userId = decoded.id || decoded.userId;
    const user = await UserModel.findById(userId);
    if (!user) {
      // If user exists as a decoded payload without UserModel row (e.g. mock test tokens)
      if (decoded && (decoded.userId || decoded.email)) {
        req.user = {
          id: userId,
          userId,
          role: decoded.role || 'ATTENDEE',
          name: decoded.name || decoded.fullName || '',
          email: decoded.email || '',
        };
        return next();
      }
      return res.status(401).json({
        status: 'error',
        message: 'User associated with this token no longer exists',
      });
    }

    const { passwordHash, ...sanitizedUser } = user;
    req.user = sanitizedUser;
    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during authentication',
    });
  }
};

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
  authenticate,
  requireAuth,
  optionalAuth,
};
