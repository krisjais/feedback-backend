const SystemSetting = require('../models/SystemSetting');
const { recordAuditLog } = require('../middleware/audit');

const getSettings = async (req, res, next) => {
  try {
    const settings = await SystemSetting.find({});
    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    // Provide defaults if not yet initialized in DB
    const responseData = {
      collegeName: settingsMap.collegeName || 'National Institute of Engineering & Technology',
      portalTitle: settingsMap.portalTitle || 'CampusVoice - Centralized Grievance & Feedback Portal',
      supportEmail: settingsMap.supportEmail || 'grievance.cell@campusvoice.edu',
      allowAnonymousComplaints: settingsMap.allowAnonymousComplaints !== undefined ? settingsMap.allowAnonymousComplaints : true,
      complaintSlaDays: settingsMap.complaintSlaDays || 5,
      enableEmailNotifications: settingsMap.enableEmailNotifications || false,
      academicYearCurrent: settingsMap.academicYearCurrent || '2026-2027',
      privacyDisclaimer: settingsMap.privacyDisclaimer || 'Anonymous submissions are strictly decoupled from user identity receipts.',
      hrVisiblePanels: settingsMap.hrVisiblePanels || [
        'dashboard',
        'form-builder',
        'all-forms',
        'responses',
        'participation',
        'complaints',
        'analytics',
        'announcements',
        'departments',
      ],
    };

    res.json({ success: true, settings: responseData });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const updates = req.body;

    // Only Super Admin can change HR visible panels
    if (updates.hrVisiblePanels && req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Administrators can manage HR portal permissions.' });
    }

    for (const [key, value] of Object.entries(updates)) {
      await SystemSetting.findOneAndUpdate(
        { key },
        { key, value, updatedBy: req.user._id },
        { upsert: true, returnDocument: 'after' }
      );
    }

    await recordAuditLog({
      user: req.user,
      action: 'UPDATE_SETTINGS',
      module: 'settings',
      details: 'Portal configuration settings updated by administrator',
      req,
    });

    res.json({ success: true, message: 'Settings updated successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
