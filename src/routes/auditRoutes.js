const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Only Superadmin can view system audit logs (restricted from HR)
router.get('/', protect, authorize('superadmin'), getAuditLogs);

module.exports = router;
