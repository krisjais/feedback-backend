/**
 * Security Audit Verification Script for CampusVoice
 * Tests all 12 critical security scenarios from Requirement 9
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Test runner helper
let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failedCount++;
  }
}

async function runSecurityTests() {
  console.log('====================================================');
  console.log('CAMPUSVOICE COMPREHENSIVE CYBERSECURITY TEST SUITE');
  console.log('====================================================\n');

  const { authenticateUser } = require('../middleware/auth');
  const {
    requireStudent,
    requireHROfficer,
    requireSuperAdmin,
    authorize,
    normalizeRole,
  } = require('../middleware/rbac');

  // Scenario 1 & 2: Registration role enforcement
  console.log('--- Test Group 1: Public Registration & Role Decoupling ---');
  {
    const { register } = require('../controllers/authController');
    const User = require('../models/User');

    // Mock request attempting privilege escalation
    const reqEscalation = {
      body: {
        name: 'Attacker Student',
        email: 'attacker@campus.edu',
        password: 'Password@2026',
        role: 'super_admin', // MALICIOUS ROLE ATTEMPT
        accountStatus: 'active',
      },
    };

    let createdUserRole = null;
    let savedDoc = null;

    // Spy on User.create
    const origCreate = User.create;
    const origFindOne = User.findOne;

    User.findOne = async () => null; // Email doesn't exist
    User.create = async (doc) => {
      savedDoc = doc;
      createdUserRole = doc.role;
      return { _id: 'mock_student_id', ...doc };
    };

    const res = {
      cookie: () => {},
      status: (code) => ({
        json: (data) => ({ code, ...data }),
      }),
    };

    await register(reqEscalation, res, (err) => console.error(err));

    assert(createdUserRole === 'student', 'Scenario 1: New registered user is assigned role "student"');
    assert(
      savedDoc.role === 'student' && savedDoc.role !== 'super_admin',
      'Scenario 2: Malicious role "super_admin" in registration payload is strictly ignored'
    );

    User.create = origCreate;
    User.findOne = origFindOne;
  }

  // Scenario 3 & 4: Student accessing HR APIs
  console.log('\n--- Test Group 2: HR API Protection ---');
  {
    const reqStudent = { user: { role: 'student', accountStatus: 'active' } };
    let hrAllowed = false;
    let hrStatusCode = null;
    const res = {
      status: (code) => {
        hrStatusCode = code;
        return {
          json: () => {},
        };
      },
    };

    requireHROfficer(reqStudent, res, () => {
      hrAllowed = true;
    });

    assert(
      !hrAllowed && hrStatusCode === 403,
      'Scenario 3 & 4: Student accessing HR APIs is blocked with HTTP 403 Forbidden'
    );
  }

  // Scenario 5: Student accessing Super Admin APIs
  console.log('\n--- Test Group 3: Super Admin API Protection ---');
  {
    const reqStudent = { user: { role: 'student', accountStatus: 'active' } };
    let adminAllowed = false;
    let adminStatusCode = null;
    const res = {
      status: (code) => {
        adminStatusCode = code;
        return { json: () => {} };
      },
    };

    requireSuperAdmin(reqStudent, res, () => {
      adminAllowed = true;
    });

    assert(
      !adminAllowed && adminStatusCode === 403,
      'Scenario 5: Student accessing Super Admin APIs is blocked with HTTP 403 Forbidden'
    );
  }

  // Scenario 6: HR accessing Super Admin APIs
  {
    const reqHR = { user: { role: 'hr_officer', accountStatus: 'active' } };
    let adminAllowed = false;
    let adminStatusCode = null;
    const res = {
      status: (code) => {
        adminStatusCode = code;
        return { json: () => {} };
      },
    };

    requireSuperAdmin(reqHR, res, () => {
      adminAllowed = true;
    });

    assert(
      !adminAllowed && adminStatusCode === 403,
      'Scenario 6: HR Officer accessing Super Admin APIs is blocked with HTTP 403 Forbidden'
    );
  }

  // Scenario 7: Unauthenticated user accessing protected APIs
  console.log('\n--- Test Group 4: Unauthenticated Request Guard ---');
  {
    const reqUnauth = { headers: {} };
    let unauthAllowed = false;
    let unauthStatusCode = null;
    const res = {
      status: (code) => {
        unauthStatusCode = code;
        return { json: () => {} };
      },
    };

    await authenticateUser(reqUnauth, res, () => {
      unauthAllowed = true;
    });

    assert(
      !unauthAllowed && unauthStatusCode === 401,
      'Scenario 7: Unauthenticated user accessing protected APIs receives HTTP 401 Unauthorized'
    );
  }

  // Scenario 8: User attempting to modify role
  console.log('\n--- Test Group 5: Role Modification Immunity ---');
  {
    const { createUser } = require('../controllers/userController');
    const reqStudentTryingToCreateAdmin = {
      user: { role: 'student' },
      body: { name: 'New Staff', email: 'staff@campus.edu', role: 'super_admin' },
    };
    let statusCode = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await createUser(reqStudentTryingToCreateAdmin, res, () => {});
    assert(
      statusCode === 403,
      'Scenario 8: Non-administrator cannot assign or modify administrative roles'
    );
  }

  // Scenario 9: HR attempting to create Super Admin
  console.log('\n--- Test Group 6: HR Privilege Escalation Prevention ---');
  {
    const { createUser } = require('../controllers/userController');
    const reqHRTryingToCreateSuperAdmin = {
      user: { role: 'hr_officer' },
      body: { name: 'Escalated User', email: 'rogue@campus.edu', role: 'super_admin' },
    };
    let statusCode = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await createUser(reqHRTryingToCreateSuperAdmin, res, () => {});
    assert(
      statusCode === 403,
      'Scenario 9: HR Officer attempting to create a Super Admin account is blocked with HTTP 403 Forbidden'
    );
  }

  // Scenario 10: Super Admin creates HR account
  console.log('\n--- Test Group 7: Super Admin Provisioning ---');
  {
    const { createUser } = require('../controllers/userController');
    const User = require('../models/User');

    let createdUser = null;
    const origFindOne = User.findOne;
    const origCreate = User.create;

    User.findOne = async () => null;
    User.create = async (doc) => {
      createdUser = doc;
      return { _id: 'mock_hr_id', ...doc };
    };

    const reqSuperAdmin = {
      user: { _id: 'admin_id', email: 'admin@campusvoice.edu', role: 'super_admin' },
      body: {
        name: 'New HR Staff',
        email: 'new.hr@campus.edu',
        password: 'Password@2026',
        role: 'hr_officer',
      },
    };
    let statusCode = 200;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
      json: () => {},
    };

    await createUser(reqSuperAdmin, res, () => {});
    assert(
      statusCode === 201 && createdUser && createdUser.role === 'hr_officer',
      'Scenario 10: Super Admin creating an authorized HR Officer account is Allowed (HTTP 201)'
    );

    User.findOne = origFindOne;
    User.create = origCreate;
  }

  // Scenario 11: Deactivated HR account login
  console.log('\n--- Test Group 8: Account Lifecycle & Deactivation ---');
  {
    const { login } = require('../controllers/authController');
    const User = require('../models/User');

    const origFindOne = User.findOne;
    User.findOne = () => ({
      select: () => ({
        populate: async () => ({
          _id: 'hr_deactivated_id',
          email: 'deactivated.hr@campus.edu',
          password: 'hashed_password',
          role: 'hr_officer',
          accountStatus: 'inactive', // DEACTIVATED ACCOUNT
          status: 'inactive',
          comparePassword: async () => true,
        }),
      }),
    });

    let loginStatusCode = null;
    let loginMessage = '';
    const reqDeactivatedLogin = {
      body: { email: 'deactivated.hr@campus.edu', password: 'Password@2026' },
    };
    const res = {
      status: (code) => {
        loginStatusCode = code;
        return {
          json: (data) => {
            loginMessage = data.message;
          },
        };
      },
      cookie: () => {},
      json: () => {},
    };

    await login(reqDeactivatedLogin, res, (err) => console.error(err));
    assert(
      loginStatusCode === 403,
      'Scenario 11: Deactivated HR account attempting login is blocked with HTTP 403 Forbidden'
    );

    User.findOne = origFindOne;
  }

  // Scenario 12: Public demo administrator login blocked
  console.log('\n--- Test Group 9: Demo Mode Hardening ---');
  {
    const { demoLogin } = require('../controllers/authController');

    // Test A: In production, demo login is completely disabled
    process.env.NODE_ENV = 'production';
    let prodStatusCode = null;
    const resA = {
      status: (code) => {
        prodStatusCode = code;
        return { json: () => {} };
      },
    };
    await demoLogin({ body: { role: 'student' } }, resA, () => {});
    assert(
      prodStatusCode === 403,
      'Scenario 12a: Demo login is completely disabled in production (HTTP 403)'
    );

    // Test B: In development, HR or Super Admin demo is strictly blocked
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_DEMO = 'true';
    let adminDemoCode = null;
    const resB = {
      status: (code) => {
        adminDemoCode = code;
        return { json: () => {} };
      },
    };
    await demoLogin({ body: { role: 'super_admin' } }, resB, () => {});
    assert(
      adminDemoCode === 403,
      'Scenario 12b: Public / Demo login to Super Admin role is strictly blocked (HTTP 403)'
    );

    let hrDemoCode = null;
    const resC = {
      status: (code) => {
        hrDemoCode = code;
        return { json: () => {} };
      },
    };
    await demoLogin({ body: { role: 'hr_officer' } }, resC, () => {});
    assert(
      hrDemoCode === 403,
      'Scenario 12c: Public / Demo login to HR Officer role is strictly blocked (HTTP 403)'
    );
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Fatal error during security test suite:', err);
  process.exit(1);
});
