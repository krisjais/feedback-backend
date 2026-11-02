const express = require('express');
const router = express.Router();
const { getOverviewStats } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/overview', protect, authorize('hr', 'superadmin'), getOverviewStats);

module.exports = router;
