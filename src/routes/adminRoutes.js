const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/rbac');
const { getUsers, createUser, updateUserStatus } = require('../controllers/userController');
const { getAuditLogs } = require('../controllers/auditLogController');
const { getSettings, updateSettings } = require('../controllers/settingsController');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Department = require('../models/Department');

// Apply authentication and strict Super Admin check across all /api/admin routes
router.use(authenticateUser, requireSuperAdmin);

/**
 * GET /api/admin/dashboard
 * Super Admin high-level governance and administrative overview
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalUsers, totalStudents, totalHROfficers, totalDepartments, recentAuditLogs] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: { $in: ['hr_officer', 'hr'] } }),
        Department.countDocuments(),
        AuditLog.find().sort({ timestamp: -1 }).limit(10),
      ]);

    res.json({
      success: true,
      data: {
        role: 'super_admin',
        stats: {
          totalUsers,
          totalStudents,
          totalHROfficers,
          totalDepartments,
        },
        recentAuditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
});

// User management endpoints
router.get('/users', getUsers);
router.post('/users', createUser);
router.patch('/users/:id/status', updateUserStatus);

/**
 * POST /api/admin/create-hr
 * Specialized endpoint for Super Admin to provision authorized HR staff
 */
router.post('/create-hr', (req, res, next) => {
  req.body.role = 'hr_officer';
  return createUser(req, res, next);
});

// Audit and settings endpoints
router.get('/audit-logs', getAuditLogs);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
