const express = require('express');
const router = express.Router();
const {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} = require('../controllers/announcementController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.get('/', protect, getAnnouncements);
router.post('/', protect, authorize('hr', 'superadmin'), createAnnouncement);
router.delete('/:id', protect, authorize('hr', 'superadmin'), deleteAnnouncement);

module.exports = router;
