const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required before authorization check',
      });
    }

    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
    const userRole = (req.user.role || '').toUpperCase();

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: `Forbidden: Access denied. Required role(s): ${allowedRoles.join(', ')}. Current role: ${req.user.role}`,
      });
    }

    next();
  };
};

module.exports = {
  authorize,
};
