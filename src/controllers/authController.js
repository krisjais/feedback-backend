const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Department = require('../models/Department');
const { recordAuditLog } = require('../middleware/audit');

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'campusvoice_super_secret_jwt_key_2026_secured',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
});

/**
 * Public Student Registration
 * SECURITY MANDATE:
 * - Public self-registration ALWAYS creates a 'student' account.
 * - Any role supplied via request body is strictly stripped and ignored.
 * - Administrative attributes (accountStatus, status, permissions) are rejected.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, studentId, department, academicYear, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required fields.',
      });
    }

    // Password validation: minimum 8 characters
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Security requirement: Password must be at least 8 characters long.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // MANDATORY: Role is unconditionally hardcoded to 'student'
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'student', // Client-supplied role is deliberately ignored
      studentId: studentId ? studentId.trim() : `STU-${Math.floor(1000 + Math.random() * 9000)}`,
      department: department || null,
      academicYear: academicYear || '1st Year',
      phone: phone || '',
      accountStatus: 'active',
      status: 'active',
    });

    const token = generateToken(user._id);

    // Set secure HTTP-only cookie
    res.cookie('cv_token', token, getCookieOptions());

    await recordAuditLog({
      user,
      action: 'USER_REGISTERED',
      module: 'auth',
      details: `Student account registered: ${user.email} (Role: student)`,
      req,
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        department: user.department,
        academicYear: user.academicYear,
        accountStatus: user.accountStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Standard User Login
 * Features:
 * - Rate limiting
 * - Account lockout protection after 5 consecutive failed attempts
 * - HTTP-only session cookie issuance
 * - Deactivated/suspended account blocking
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail })
      .select('+password +passwordHash')
      .populate('department');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check account lockout
    if (typeof user.isLocked === 'function' && user.isLocked()) {
      const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      return res.status(403).json({
        success: false,
        message: `Account is temporarily locked due to repeated failed login attempts. Please try again after ${waitMinutes} minute(s).`,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (typeof user.incFailedLoginAttempts === 'function') {
        await user.incFailedLoginAttempts();
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Reset failed login counter upon successful authentication
    if (typeof user.resetFailedAttempts === 'function') {
      await user.resetFailedAttempts();
    }

    const currentStatus = user.accountStatus || user.status;
    if (currentStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is currently ${currentStatus}. Please contact the college administration.`,
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user._id);

    // Set secure HTTP-only cookie
    res.cookie('cv_token', token, getCookieOptions());

    await recordAuditLog({
      user,
      action: 'USER_LOGIN',
      module: 'auth',
      details: `${user.role.toUpperCase()} logged in: ${user.email}`,
      req,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        department: user.department,
        academicYear: user.academicYear,
        avatar: user.avatar,
        accountStatus: user.accountStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout
 * Clears HTTP-only session cookie
 */
const logout = async (req, res, next) => {
  try {
    res.clearCookie('cv_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });

    if (req.user) {
      await recordAuditLog({
        user: req.user,
        action: 'USER_LOGOUT',
        module: 'auth',
        details: `User logged out: ${req.user.email}`,
        req,
      });
    }

    res.json({
      success: true,
      message: 'Successfully logged out.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Current User Profile (Token/Cookie verification)
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('department');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        department: user.department,
        academicYear: user.academicYear,
        phone: user.phone,
        avatar: user.avatar,
        accountStatus: user.accountStatus || user.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Demo Login System
 * SECURITY HARDENING:
 * - Disabled completely in production.
 * - Allowed ONLY in development when ENABLE_DEV_DEMO is explicitly 'true'.
 * - NEVER grants demo access to privileged administrative roles (HR Officer, Super Admin).
 */
const demoLogin = async (req, res, next) => {
  try {
    // 1. Strict Environment Guard
    const isProduction = process.env.NODE_ENV === 'production';
    const devDemoEnabled = process.env.ENABLE_DEV_DEMO === 'true';

    if (isProduction || !devDemoEnabled) {
      return res.status(403).json({
        success: false,
        message: 'Security policy: Demo login is disabled in this environment. Please sign in with your credentials.',
      });
    }

    const { role } = req.body;

    // 2. Strict Privilege Restriction: Only Student demo is permitted
    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Security policy: Privileged administrative accounts (HR Officer, Super Admin) cannot be accessed via demo mode. Use official credentials.',
      });
    }

    const user = await User.findOne({ role: 'student', accountStatus: 'active' }).populate('department');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No demo student account available.',
      });
    }

    const token = generateToken(user._id);
    res.cookie('cv_token', token, getCookieOptions());

    await recordAuditLog({
      user,
      action: 'DEMO_LOGIN',
      module: 'auth',
      details: `Dev demo login as student: ${user.email}`,
      req,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        department: user.department,
        academicYear: user.academicYear,
        avatar: user.avatar,
        accountStatus: user.accountStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  demoLogin,
};
