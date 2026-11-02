const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// All authenticated users can read portal policies & contact info
router.get('/', protect, getSettings);

// Only Superadmin & HR can modify portal settings
router.put('/', protect, authorize('hr', 'superadmin'), updateSettings);

module.exports = router;
