const UserModel = require('../models/user.model');
const { hashPassword, comparePassword } = require('../utils/password.util');
const { generateToken } = require('../utils/jwt.util');

const VALID_ROLES = ['ATTENDEE', 'ORGANIZER', 'STAFF', 'ADMIN'];

const register = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

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

    const selectedRole = role ? role.toUpperCase() : 'ATTENDEE';
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

    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
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

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
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

const getProfile = async (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
};

module.exports = {
  register,
  login,
  getProfile,
};
