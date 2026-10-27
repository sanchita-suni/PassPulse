const UserModel = require('../models/user.model');
const { hashPassword, comparePassword } = require('../utils/password.util');
const { generateToken } = require('../utils/jwt.util');

const VALID_ROLES = ['ATTENDEE', 'ORGANIZER', 'STAFF', 'ADMIN', 'GATE_STAFF'];

/**
 * Public User Registration (FR-001).
 * Unconditionally assigns role: 'ATTENDEE'.
 * Ignores any role supplied in the request body to prevent privilege escalation (CWE-269).
 */
const register = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Full name, email, and password are required fields',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email address format',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long',
      });
    }

    // Public registration ALWAYS assigns role ATTENDEE.
    // Any caller-submitted role is strictly ignored.
    const selectedRole = 'ATTENDEE';

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A user with this email address already exists',
      });
    }

    const passwordHash = await hashPassword(password);

    const newUser = await UserModel.create({
      fullName,
      email,
      passwordHash,
      role: selectedRole,
    });

    const token = generateToken({
      id: newUser.id,
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      fullName: newUser.fullName,
      name: newUser.fullName,
    });

    const { passwordHash: _, ...safeUser } = newUser;

    return res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        user: safeUser,
        token,
      },
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during registration',
    });
  }
};

/**
 * User Login (FR-003, SEC-002).
 * Authenticates against stored bcrypt password hash and returns signed JWT with trusted role.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required',
      });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password credentials',
      });
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password credentials',
      });
    }

    if (user.isActive === false) {
      return res.status(401).json({
        status: 'error',
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated',
      });
    }

    const token = generateToken({
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      name: user.fullName,
    });

    const { passwordHash: _, ...safeUser } = user;

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: safeUser,
        token,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during login',
    });
  }
};

/**
 * Authenticated User Profile.
 */
const getProfile = async (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
};

/**
 * Admin-Only User Provisioning Endpoint (SEC-002, CWE-269).
 * Allows authenticated administrators to provision accounts with privileged roles (GATE_STAFF, STAFF, ORGANIZER, ADMIN).
 */
const provisionUser = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        status: 'error',
        message: 'fullName, email, password, and role are required fields',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email address format',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long',
      });
    }

    const selectedRole = role.toUpperCase();
    if (!VALID_ROLES.includes(selectedRole)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid role. Allowed roles are: ${VALID_ROLES.join(', ')}`,
      });
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A user with this email address already exists',
      });
    }

    const passwordHash = await hashPassword(password);

    const newUser = await UserModel.create({
      fullName,
      email,
      passwordHash,
      role: selectedRole,
    });

    const { passwordHash: _, ...safeUser } = newUser;

    return res.status(201).json({
      status: 'success',
      message: 'Privileged user provisioned successfully',
      data: {
        user: safeUser,
      },
    });
  } catch (error) {
    console.error('Provisioning Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error during user provisioning',
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  provisionUser,
};
