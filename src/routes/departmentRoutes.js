const express = require('express');
const router = express.Router();
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departmentController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Publicly readable for registration & dropdowns
router.get('/', getDepartments);

// Restricted to HR / Super Admin
router.post('/', protect, authorize('hr', 'superadmin'), createDepartment);
router.put('/:id', protect, authorize('hr', 'superadmin'), updateDepartment);
router.delete('/:id', protect, authorize('hr', 'superadmin'), deleteDepartment);

module.exports = router;
