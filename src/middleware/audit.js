const AuditLog = require('../models/AuditLog');

const recordAuditLog = async ({ user, action, module, details, req }) => {
  try {
    const ipAddress =
      (req && req.headers && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress)) || '127.0.0.1';

    await AuditLog.create({
      user: user?._id || null,
      userName: user?.name || 'System',
      userEmail: user?.email || 'system@campusvoice.edu',
      userRole: user?.role || 'system',
      action,
      module,
      details,
      ipAddress: String(ipAddress),
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
};

module.exports = { recordAuditLog };
