const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUserStatus } = require('../controllers/userController');
const { authenticateUser } = require('../middleware/auth');
const { requireSuperAdmin, authorize } = require('../middleware/rbac');

// Super Admin and HR can view users
router.get('/', authenticateUser, authorize('hr_officer', 'super_admin'), getUsers);

// Only Super Admin can provision accounts or alter statuses
router.post('/', authenticateUser, requireSuperAdmin, createUser);
router.patch('/:id/status', authenticateUser, requireSuperAdmin, updateUserStatus);

module.exports = router;
