const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { recordAuditLog } = require('../middleware/audit');

const getAnnouncements = async (req, res, next) => {
  try {
    const isStudent = req.user.role === 'student';
    let query = { isActive: true };

    if (isStudent) {
      query.targetAudience = { $in: ['all', 'students'] };
    }

    const announcements = await Announcement.find(query)
      .populate('publishedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: announcements.length, announcements });
  } catch (error) {
    next(error);
  }
};

const createAnnouncement = async (req, res, next) => {
  try {
    const { title, content, category, priority, targetAudience, expiresAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    const announcement = await Announcement.create({
      title,
      content,
      category: category || 'General',
      priority: priority || 'normal',
      targetAudience: targetAudience || 'all',
      expiresAt: expiresAt || null,
      publishedBy: req.user._id,
    });

    // Notify users
    let recipientQuery = { status: 'active' };
    if (targetAudience === 'students') recipientQuery.role = 'student';
    if (targetAudience === 'staff') recipientQuery.role = { $in: ['hr', 'superadmin'] };

    const recipients = await User.find(recipientQuery).select('_id');
    const notifs = recipients.map((r) => ({
      recipient: r._id,
      title: `Notice: ${title}`,
      message: content.substring(0, 80) + '...',
      type: 'announcement',
      link: '/student',
    }));

    if (notifs.length > 0) {
      await Notification.insertMany(notifs);
    }

    await recordAuditLog({
      user: req.user,
      action: 'CREATE_ANNOUNCEMENT',
      module: 'settings',
      details: `Created announcement "${title}"`,
      req,
    });

    res.status(201).json({ success: true, announcement });
  } catch (error) {
    next(error);
  }
};

const deleteAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Announcement.findByIdAndDelete(id);
    res.json({ success: true, message: 'Announcement deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
};
