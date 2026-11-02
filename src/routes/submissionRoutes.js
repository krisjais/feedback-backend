const express = require('express');
const router = express.Router();
const {
  submitFeedback,
  getFormResponses,
  getStudentParticipation,
  exportResponsesCsv,
  exportResponsesExcel,
} = require('../controllers/submissionController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Student submits feedback
router.post('/forms/:formId/submit', protect, authorize('student'), submitFeedback);

// HR / Super Admin responses review and participation tracking
router.get('/forms/:formId/responses', protect, authorize('hr', 'superadmin'), getFormResponses);
router.get('/forms/:formId/participation', protect, authorize('hr', 'superadmin'), getStudentParticipation);
router.get('/forms/:formId/export/csv', protect, authorize('hr', 'superadmin'), exportResponsesCsv);
router.get('/forms/:formId/export/excel', protect, authorize('hr', 'superadmin'), exportResponsesExcel);

module.exports = router;
