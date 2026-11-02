const express = require('express');
const router = express.Router();
const {
  getForms,
  getFormById,
  createForm,
  updateForm,
  updateFormStatus,
  duplicateForm,
  deleteForm,
  getFormVersions,
} = require('../controllers/formController');
const { protect } = require('../middleware/auth');
const { authorize, enforceFormAuthoringPermissions } = require('../middleware/rbac');

// All authenticated users can view eligible forms or single form details
router.get('/', protect, getForms);
router.get('/:id', protect, getFormById);
router.get('/:id/versions', protect, authorize('hr', 'superadmin'), getFormVersions);

// Form authoring operations: Strictly HR & Super Admin only! Students are blocked
router.post('/', protect, enforceFormAuthoringPermissions, authorize('hr', 'superadmin'), createForm);
router.put('/:id', protect, enforceFormAuthoringPermissions, authorize('hr', 'superadmin'), updateForm);
router.patch('/:id/status', protect, enforceFormAuthoringPermissions, authorize('hr', 'superadmin'), updateFormStatus);
router.post('/:id/duplicate', protect, enforceFormAuthoringPermissions, authorize('hr', 'superadmin'), duplicateForm);
router.delete('/:id', protect, enforceFormAuthoringPermissions, authorize('hr', 'superadmin'), deleteForm);

module.exports = router;
