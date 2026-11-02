const User = require('../models/User');
const { recordAuditLog } = require('../middleware/audit');

/**
 * Idempotent Super Administrator Bootstrap
 * Reads configuration from environment variables.
 * If no super_admin exists in database, bootstraps initial administrator account.
 */
const bootstrapSuperAdmin = async () => {
  try {
    const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@campusvoice.edu').toLowerCase().trim();
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Admin@2026';

    const existingAdmin = await User.findOne({
      role: { $in: ['super_admin', 'superadmin'] },
    });

    if (existingAdmin) {
      // Super admin already configured
      return existingAdmin;
    }

    console.log(`[Bootstrap] No Super Administrator found. Initializing bootstrap for ${adminEmail}...`);

    const superAdmin = await User.create({
      name: 'System Super Administrator',
      email: adminEmail,
      password: adminPassword,
      role: 'super_admin',
      accountStatus: 'active',
      status: 'active',
    });

    await recordAuditLog({
      user: superAdmin,
      action: 'BOOTSTRAP_SUPERADMIN',
      module: 'auth',
      details: `Initialized bootstrap Super Administrator: ${superAdmin.email}`,
    });

    console.log(`[Bootstrap] Super Administrator initialized successfully: ${superAdmin.email}`);
    return superAdmin;
  } catch (error) {
    console.error(`[Bootstrap] Error during Super Admin bootstrap: ${error.message}`);
  }
};

module.exports = { bootstrapSuperAdmin };
