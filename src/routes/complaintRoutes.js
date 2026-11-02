const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  getComplaintById,
  updateComplaintStatus,
  assignComplaint,
  addMessage,
  reopenComplaint,
} = require('../controllers/complaintController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Student submits complaint
router.post('/', protect, authorize('student'), createComplaint);

// Student gets their own complaints
router.get('/my', protect, authorize('student'), getMyComplaints);

// HR / Super Admin gets all complaints
router.get('/all', protect, authorize('hr', 'superadmin'), getAllComplaints);

// Get single complaint (Student can only see their own, HR sees all)
router.get('/:id', protect, getComplaintById);

// Update status (HR only)
router.patch('/:id/status', protect, authorize('hr', 'superadmin'), updateComplaintStatus);

// Assign complaint (HR only)
router.post('/:id/assign', protect, authorize('hr', 'superadmin'), assignComplaint);

// Message / response thread (Student or HR)
router.post('/:id/messages', protect, addMessage);

// Reopen complaint (Student or HR)
router.post('/:id/reopen', protect, reopenComplaint);

module.exports = router;
