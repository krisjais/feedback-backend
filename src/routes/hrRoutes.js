const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { requireHROfficer } = require('../middleware/rbac');

const Form = require('../models/Form');
const Complaint = require('../models/Complaint');
const Submission = require('../models/Submission');
const Department = require('../models/Department');

// Apply authentication and strict HR Officer role check across all /api/hr routes
router.use(authenticateUser, requireHROfficer);

/**
 * GET /api/hr/dashboard
 * Aggregated HR operational stats
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalForms, activeForms, totalComplaints, pendingComplaints, resolvedComplaints, totalSubmissions] =
      await Promise.all([
        Form.countDocuments(),
        Form.countDocuments({ status: 'published' }),
        Complaint.countDocuments(),
        Complaint.countDocuments({ status: { $in: ['new', 'under_review', 'assigned', 'in_progress'] } }),
        Complaint.countDocuments({ status: { $in: ['resolved', 'closed'] } }),
        Submission.countDocuments(),
      ]);

    res.json({
      success: true,
      data: {
        role: 'hr_officer',
        stats: {
          totalForms,
          activeForms,
          totalComplaints,
          pendingComplaints,
          resolvedComplaints,
          totalSubmissions,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hr/forms
 */
router.get('/forms', async (req, res, next) => {
  try {
    const forms = await Form.find().populate('department', 'name code').sort({ createdAt: -1 });
    res.json({ success: true, count: forms.length, forms });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hr/complaints
 */
router.get('/complaints', async (req, res, next) => {
  try {
    const complaints = await Complaint.find()
      .populate('department', 'name code')
      .populate('assignedTo', 'name email')
      .populate('assignedDepartment', 'name code')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: complaints.length, complaints });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
