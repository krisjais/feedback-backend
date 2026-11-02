const User = require('../models/User');
const { recordAuditLog } = require('../middleware/audit');
const { normalizeRole } = require('../middleware/rbac');

const escapeRegex = (string) => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getUsers = async (req, res, next) => {
  try {
    const { role, department, search, status } = req.query;
    let query = {};

    if (typeof role === 'string' && role !== 'all' && !role.startsWith('$')) {
      const normalized = normalizeRole(role);
      query.role = { $in: [normalized, role] };
    }
    if (typeof status === 'string' && status !== 'all' && !status.startsWith('$')) {
      query.$or = [{ accountStatus: status }, { status }];
    }
    if (typeof department === 'string' && department !== 'all' && !department.startsWith('$')) {
      query.department = department;
    }
    if (typeof search === 'string' && search.trim() && !search.startsWith('$')) {
      const safeSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { studentId: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .populate('department', 'name code')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: users.length, users });
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin Provisioning of Administrative or Student Accounts
 * Only Super Admin can provision accounts with roles 'hr_officer' or 'super_admin'.
 * HR Officers attempting to create administrative accounts are blocked with 403 Forbidden.
 */
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, department, academicYear, studentId, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    const requesterRole = normalizeRole(req.user.role);
    const targetRole = normalizeRole(role || 'student');

    // HR Officers are strictly prohibited from provisioning any administrative accounts
    if (requesterRole !== 'super_admin' && (targetRole === 'hr_officer' || targetRole === 'super_admin')) {
      return res.status(403).json({
        success: false,
        message: 'Security policy violation: Only Super Administrators can provision HR Officer or Super Admin accounts.',
      });
    }

    // HR Officers are not permitted to create users at all if institutional policy restricts it
    if (requesterRole === 'hr_officer' && targetRole !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: HR Officers cannot provision administrative accounts.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists.' });
    }

    const defaultPassword = password || 'CampusVoice@2026';
    if (defaultPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: defaultPassword,
      role: targetRole,
      department: department || null,
      academicYear: academicYear || 'Staff/N/A',
      studentId: studentId || (targetRole === 'student' ? `STU-${Math.floor(1000 + Math.random() * 9000)}` : undefined),
      phone: phone || '',
      accountStatus: 'active',
      status: 'active',
    });

    await recordAuditLog({
      user: req.user,
      action: 'PROVISION_USER',
      module: 'users',
      details: `Super Admin ${req.user.email} provisioned ${user.name} (${user.email}) as ${user.role}`,
      req,
    });

    res.status(201).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin Management: Activate / Deactivate / Reset User Status
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, accountStatus } = req.body;
    const newStatus = accountStatus || status;

    if (!['active', 'inactive', 'suspended', 'locked'].includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, suspended, or locked.',
      });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const requesterRole = normalizeRole(req.user.role);
    const targetUserRole = normalizeRole(targetUser.role);

    // HR Officers cannot modify status of HR Officers or Super Admins
    if (requesterRole !== 'super_admin' && (targetUserRole === 'hr_officer' || targetUserRole === 'super_admin')) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Super Administrators can modify administrative account statuses.',
      });
    }

    // Prevent self-lockout by Super Admin
    if (req.user._id.toString() === targetUser._id.toString() && newStatus !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Security policy: You cannot deactivate or suspend your own Super Administrator account.',
      });
    }

    targetUser.accountStatus = newStatus;
    targetUser.status = newStatus;

    // If reactivating, clear any lockouts
    if (newStatus === 'active') {
      targetUser.lockUntil = null;
      targetUser.failedLoginAttempts = 0;
    }

    await targetUser.save();

    await recordAuditLog({
      user: req.user,
      action: 'UPDATE_USER_STATUS',
      module: 'users',
      details: `User ${targetUser.email} status updated to ${newStatus} by ${req.user.email}`,
      req,
    });

    res.json({ success: true, user: targetUser });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUserStatus,
};
