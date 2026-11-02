/**
 * Role-Based Access Control (RBAC) Middleware for CampusVoice
 * Standardized Canonical Roles: 'student', 'hr_officer', 'super_admin'
 * Legacy Aliases Supported: 'hr' -> 'hr_officer', 'superadmin' -> 'super_admin'
 */

const normalizeRole = (role) => {
  if (role === 'hr') return 'hr_officer';
  if (role === 'superadmin') return 'super_admin';
  return role;
};

/**
 * Universal Role Authorizer
 * Usage: authorize('hr_officer', 'super_admin')
 */
const authorize = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const userRole = normalizeRole(req.user.role);

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user.role}' is not authorized to access this resource.`,
      });
    }

    next();
  };
};

/**
 * Specific Middleware: Student Only
 */
const requireStudent = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  const userRole = normalizeRole(req.user.role);
  if (userRole !== 'student') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Access is restricted to registered Students only.',
    });
  }

  next();
};

/**
 * Specific Middleware: HR Officer
 * Permitted for HR Officers. Super Admins are denied by default per institutional separation policy.
 */
const requireHROfficer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  const userRole = normalizeRole(req.user.role);
  if (userRole !== 'hr_officer') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Access is restricted to authorized HR Officers only.',
    });
  }

  next();
};

/**
 * Specific Middleware: Super Admin Only
 * Strictly prohibited for Students and HR Officers.
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  const userRole = normalizeRole(req.user.role);
  if (userRole !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Super Administrator privileges are required to access this resource.',
    });
  }

  next();
};

/**
 * Strict rule: Students must NEVER have permission to create, edit, or publish feedback forms
 */
const enforceFormAuthoringPermissions = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  const userRole = normalizeRole(req.user.role);
  if (userRole === 'student') {
    return res.status(403).json({
      success: false,
      message: 'Violation of security policy: Students are strictly prohibited from authoring or managing feedback forms.',
    });
  }

  next();
};

module.exports = {
  authorize,
  requireStudent,
  requireHROfficer,
  requireSuperAdmin,
  enforceFormAuthoringPermissions,
  normalizeRole,
};
