const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Helper to parse cookies from req.headers.cookie when cookie-parser is not used
 */
const parseCookies = (req) => {
  if (req.cookies) return req.cookies;
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    const value = decodeURIComponent(parts.join('='));
    list[name] = value;
  });
  return list;
};

/**
 * Authenticate User Middleware
 * Checks HTTP-only cookie first, then Authorization header.
 * Enforces token validity, account existence, active account status, and lockout checks.
 */
const authenticateUser = async (req, res, next) => {
  let token;

  // 1. Check HTTP-only cookie
  const cookies = parseCookies(req);
  if (cookies.cv_token) {
    token = cookies.cv_token;
  }

  // 2. Check Authorization Bearer header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No session or token provided.',
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'campusvoice_super_secret_jwt_key_2026_secured'
    );

    const user = await User.findById(decoded.id).populate('department');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The user session is invalid. Account not found.',
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

    // Check active status
    const currentStatus = user.accountStatus || user.status;
    if (currentStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is currently ${currentStatus}. Please contact the college administration.`,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please log in again.',
    });
  }
};

// Protect alias for backward compatibility
const protect = authenticateUser;

module.exports = {
  authenticateUser,
  protect,
  parseCookies,
};
