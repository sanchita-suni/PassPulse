const { verifyToken } = require('../utils/jwt.util');
const UserModel = require('../models/user.model');

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

    const user = await UserModel.findById(decoded.id);
    if (!user) {
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

module.exports = {
  authenticate,
};
