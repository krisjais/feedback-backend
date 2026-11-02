const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, logout, getMe, demoLogin } = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');

// Targeted rate limiter on login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
  },
});

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.post('/logout', authenticateUser, logout);
router.post('/demo-login', demoLogin);
router.get('/me', authenticateUser, getMe);

module.exports = router;
