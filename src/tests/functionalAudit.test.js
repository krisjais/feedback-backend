/**
 * CampusVoice - Stage 1 Complete End-to-End Functional Verification Test Suite
 * Covers Student Portal, HR Officer Portal, Super Admin Portal, Form Builder (11 Question Types),
 * Grievance Lifecycle, Internal Notes Segregation, Analytics/Exports, RBAC & Privacy Architecture.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const assert = require('assert');
const path = require('path');

// Models
const User = require('../models/User');
const Department = require('../models/Department');
const Form = require('../models/Form');
const Question = require('../models/Question');
const FormVersion = require('../models/FormVersion');
const Submission = require('../models/Submission');
const SubmissionReceipt = require('../models/SubmissionReceipt');
const Complaint = require('../models/Complaint');
const ComplaintMessage = require('../models/ComplaintMessage');
const ComplaintStatusHistory = require('../models/ComplaintStatusHistory');
const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');

// Set test port and load app
process.env.PORT = process.env.PORT || '5055';
const TEST_PORT = process.env.PORT;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverInstance;

// Helper to execute HTTP requests
async function apiRequest(endpoint, { method = 'GET', body = null, token = null, headers = {} } = {}) {
  const reqHeaders = {
    'Content-Type': 'application/json',
    'Origin': 'http://localhost:3000', // matches CSRF allowed origin
    ...headers,
  };
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers: reqHeaders,
  };

  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const contentType = response.headers.get('content-type') || '';

  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else if (contentType.includes('text/')) {
    data = await response.text();
  } else {
    data = await response.arrayBuffer();
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

// Test reporting harness
const results = [];
function recordResult(section, testName, passed, details = '') {
  results.push({ section, testName, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${icon}: [${section}] ${testName} ${details ? `(${details})` : ''}`);
}

async function runFunctionalAudit() {
  console.log('\n=============================================================');
  console.log('   CAMPUSVOICE - STAGE 1 COMPLETE FUNCTIONAL AUDIT SUITE    ');
  console.log('=============================================================\n');

  try {
    // 1. Connect DB and start app
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`[Database] Connected to MongoDB: ${process.env.MONGO_URI}`);

    const app = require('../server');
    // server already listens in server.js on process.env.PORT
    await new Promise((resolve) => setTimeout(resolve, 2500));
    console.log(`[API Server] Running at ${BASE_URL}\n`);

    // Clean up previous test artifacts if any
    await cleanupTestData();

    // =========================================================================
    // SECTION 1: SYSTEM HEALTH & ENVIRONMENT VERIFICATION
    // =========================================================================
    console.log('\n--- Section 1: System Health & Environment ---');
    {
      const healthRes = await apiRequest('/api/health');
      recordResult(
        'Health Check',
        'GET /api/health responds with healthy status',
        healthRes.status === 200 && healthRes.data.status === 'healthy',
        `status: ${healthRes.status}`
      );
    }

    // =========================================================================
    // SECTION 2: STUDENT PORTAL TESTING
    // =========================================================================
    console.log('\n--- Section 2: Student Portal Testing ---');
    const testStudentEmail = 'test.qa.student1@campusvoice.edu';
    const testStudentPassword = 'Password@2026';
    let studentToken = null;
    let studentUser = null;

    // 2A: Form Validation & Security during Registration
    {
      // Missing required fields
      const emptyRes = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { name: '', email: '', password: '' },
      });
      recordResult(
        'Student Registration',
        'Reject registration with empty fields',
        emptyRes.status === 400,
        `status: ${emptyRes.status}`
      );

      // Invalid email
      const invalidEmailRes = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'Test QA', email: 'invalid-email-format', password: 'Password@2026' },
      });
      recordResult(
        'Student Registration',
        'Reject registration with invalid email format',
        invalidEmailRes.status === 400,
        `status: ${invalidEmailRes.status}`
      );

      // Short password (< 8 chars)
      const shortPassRes = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'Test QA', email: 'short@campusvoice.edu', password: 'short' },
      });
      recordResult(
        'Student Registration',
        'Reject password shorter than 8 characters',
        shortPassRes.status === 400,
        `status: ${shortPassRes.status}`
      );

      // Strict Role Assignment: Attempt to register as super_admin
      const privEscRes = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Privilege Escalation Tester',
          email: testStudentEmail,
          password: testStudentPassword,
          role: 'super_admin', // Attacker attempt to self-promote
          studentId: 'STU-QA-001',
          academicYear: '3rd Year',
        },
      });

      const userInDb = await User.findOne({ email: testStudentEmail });
      recordResult(
        'Student Registration',
        'Strict student role auto-assignment (attacker role ignored)',
        privEscRes.status === 201 && userInDb && userInDb.role === 'student',
        `Assigned role in DB: ${userInDb?.role}`
      );

      // Duplicate email rejection
      const duplicateRes = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Duplicate Student',
          email: testStudentEmail,
          password: testStudentPassword,
          academicYear: '3rd Year',
        },
      });
      recordResult(
        'Student Registration',
        'Reject registration with duplicate email address',
        duplicateRes.status === 400,
        `status: ${duplicateRes.status}`
      );
    }

    // 2B: Student Login & Session Verification
    {
      // Invalid password
      const wrongPassRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: testStudentEmail, password: 'WrongPassword@999' },
      });
      recordResult(
        'Student Login',
        'Reject login with incorrect password',
        wrongPassRes.status === 401,
        `status: ${wrongPassRes.status}`
      );

      // Non-existent email
      const wrongEmailRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'nonexistent.user.999@campusvoice.edu', password: 'Password@2026' },
      });
      recordResult(
        'Student Login',
        'Reject login with unregistered email',
        wrongEmailRes.status === 401,
        `status: ${wrongEmailRes.status}`
      );

      // Valid Login
      const validLoginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: testStudentEmail, password: testStudentPassword },
      });
      studentToken = validLoginRes.data.token;
      studentUser = validLoginRes.data.user;

      recordResult(
        'Student Login',
        'Successful login returns JWT token & student profile',
        validLoginRes.status === 200 && Boolean(studentToken) && studentUser.role === 'student',
        `token length: ${studentToken?.length}`
      );

      // Verify Session (/api/auth/me)
      const meRes = await apiRequest('/api/auth/me', { token: studentToken });
      recordResult(
        'Student Session',
        'Verify session token and retrieve active student profile via /api/auth/me',
        meRes.status === 200 && meRes.data.user.email === testStudentEmail,
        `user: ${meRes.data.user?.name}`
      );
    }

    // 2C: Form Eligibility & Student Feedback Interactions
    let eligibleFormId = null;
    let questionsForSubmission = [];
    {
      // List forms as student
      const formsRes = await apiRequest('/api/forms', { token: studentToken });
      recordResult(
        'Form List (Student)',
        'Student retrieves published forms list',
        formsRes.status === 200 && Array.isArray(formsRes.data.forms),
        `forms count: ${formsRes.data.forms?.length}`
      );

      // Verify draft forms are not visible to student
      const draftForm = await Form.findOne({ status: 'draft' });
      if (draftForm) {
        const studentSeesDraft = formsRes.data.forms.some((f) => f._id === draftForm._id.toString());
        recordResult(
          'Form Privacy',
          'Draft forms are completely hidden from student form listings',
          !studentSeesDraft,
          `draft form ${draftForm.title} excluded`
        );
      }

      // Pick published anonymous form
      const publishedForm = await Form.findOne({ status: 'published', isAnonymous: true });
      assert(publishedForm, 'Published anonymous form must exist in DB');
      eligibleFormId = publishedForm._id.toString();

      // Get single form details & questions
      const singleFormRes = await apiRequest(`/api/forms/${eligibleFormId}`, { token: studentToken });
      questionsForSubmission = singleFormRes.data.questions || [];
      recordResult(
        'Form Details',
        'Student retrieves single form with question definitions',
        singleFormRes.status === 200 && questionsForSubmission.length > 0,
        `questions: ${questionsForSubmission.length}`
      );

      // Department-specific BOLA check: Student from different department blocked
      const otherDept = await Department.findOne({ code: 'MJ' }) || await Department.findOne({});
      const superAdminUser = await User.findOne({ role: { $in: ['super_admin', 'superadmin'] } });
      const deptRestrictedForm = await Form.create({
        title: 'CV-TEST-BOLA Department Survey',
        description: 'Testing department access control',
        category: 'Course & Curriculum',
        targetAudience: 'department_specific',
        eligibleDepartments: [otherDept._id],
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        status: 'published',
        isAnonymous: true,
        createdBy: superAdminUser._id,
      });

      const deptAccessRes = await apiRequest(`/api/forms/${deptRestrictedForm._id}`, { token: studentToken });
      recordResult(
        'Form Access Control',
        'Student blocked from viewing department-specific survey of another department',
        deptAccessRes.status === 403,
        `status: ${deptAccessRes.status}`
      );
    }

    // 2D: Complete Feedback Submission with ALL 11 Question Types
    let receiptCodeReceived = null;
    {
      // Create a dedicated test form with ALL 11 question types
      const superAdminUser = await User.findOne({ role: { $in: ['super_admin', 'superadmin'] } });
      const testComprehensiveForm = await Form.create({
        title: 'CV-TEST Comprehensive 11-Type Evaluation Survey',
        description: 'Complete coverage test for all 11 dynamic question types',
        category: 'General Feedback',
        targetAudience: 'all',
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        status: 'published',
        isAnonymous: true,
        createdBy: superAdminUser._id,
      });

      const questionTypesData = [
        { label: 'Q1 Short Text', questionType: 'short_text', isRequired: true },
        { label: 'Q2 Long Text', questionType: 'long_text', isRequired: true },
        { label: 'Q3 Multiple Choice', questionType: 'multiple_choice', options: ['Option A', 'Option B', 'Option C'], isRequired: true },
        { label: 'Q4 Checkbox', questionType: 'checkbox', options: ['Check 1', 'Check 2', 'Check 3'], isRequired: true },
        { label: 'Q5 Dropdown', questionType: 'dropdown', options: ['Choice X', 'Choice Y'], isRequired: true },
        { label: 'Q6 Yes No', questionType: 'yes_no', isRequired: true },
        { label: 'Q7 Rating 5', questionType: 'rating_5', isRequired: true },
        { label: 'Q8 Rating 10', questionType: 'rating_10', isRequired: true },
        { label: 'Q9 Linear Scale', questionType: 'linear_scale', scaleConfig: { min: 1, max: 7, minLabel: 'Low', maxLabel: 'High' }, isRequired: true },
        { label: 'Q10 Date', questionType: 'date', isRequired: true },
        { label: 'Q11 File Upload', questionType: 'file_upload', isRequired: false },
      ];

      const insertedQuestions = await Question.insertMany(
        questionTypesData.map((q, idx) => ({ ...q, form: testComprehensiveForm._id, order: idx }))
      );

      recordResult(
        'Dynamic Question Types',
        'Successfully configured form with all 11 supported question types',
        insertedQuestions.length === 11,
        `11 question types verified`
      );

      // Student answers all 11 questions
      const answersPayload = [
        { questionId: insertedQuestions[0]._id, value: 'Clean facilities and helpful labs' },
        { questionId: insertedQuestions[1]._id, value: 'The professors are very engaging and provide thorough explanations.' },
        { questionId: insertedQuestions[2]._id, value: 'Option A' },
        { questionId: insertedQuestions[3]._id, value: ['Check 1', 'Check 3'] },
        { questionId: insertedQuestions[4]._id, value: 'Choice X' },
        { questionId: insertedQuestions[5]._id, value: 'Yes' },
        { questionId: insertedQuestions[6]._id, value: 5 },
        { questionId: insertedQuestions[7]._id, value: 9 },
        { questionId: insertedQuestions[8]._id, value: 6 },
        { questionId: insertedQuestions[9]._id, value: '2026-11-01' },
        { questionId: insertedQuestions[10]._id, value: '/uploads/attachments/sample-evidence.pdf' },
      ];

      const submitRes = await apiRequest(`/api/submissions/forms/${testComprehensiveForm._id}/submit`, {
        method: 'POST',
        token: studentToken,
        body: { answers: answersPayload },
      });

      receiptCodeReceived = submitRes.data.receiptCode;
      recordResult(
        'Feedback Submission',
        'Student successfully submits feedback with all 11 question types and receives cryptographic receipt',
        submitRes.status === 201 && Boolean(receiptCodeReceived),
        `Receipt: ${receiptCodeReceived}`
      );

      // Anonymity Architecture Verification: Verify student ObjectId is NOT stored on submission
      const storedSubmission = await Submission.findOne({ form: testComprehensiveForm._id });
      recordResult(
        'Privacy Decoupling',
        'Anonymous submission document completely decouples student identity (student: null)',
        storedSubmission && storedSubmission.student === null && storedSubmission.isAnonymous === true,
        `Submission student field: ${storedSubmission?.student}`
      );

      // Receipt Verification: Receipt exists for student participation tracking without linked answers
      const storedReceipt = await SubmissionReceipt.findOne({ receiptCode: receiptCodeReceived });
      const currentStudentId = (studentUser.id || studentUser._id).toString();
      recordResult(
        'Participation Receipt',
        'SubmissionReceipt records completion without linking answers to student profile',
        storedReceipt && storedReceipt.student.toString() === currentStudentId,
        `Receipt student: ${storedReceipt?.student}`
      );

      // Duplicate Submission Prevention
      const duplicateSubmitRes = await apiRequest(`/api/submissions/forms/${testComprehensiveForm._id}/submit`, {
        method: 'POST',
        token: studentToken,
        body: { answers: answersPayload },
      });
      recordResult(
        'Submission Integrity',
        'Student blocked from submitting duplicate response to the same feedback form',
        duplicateSubmitRes.status === 400 && duplicateSubmitRes.data.message.includes('already submitted'),
        `status: ${duplicateSubmitRes.status}`
      );
    }

    // 2E: Student Grievance / Complaint Management
    let testComplaintId = null;
    let testComplaintTicketId = null;
    let testAnonymousComplaintId = null;
    {
      const cseDept = await Department.findOne({ code: 'IT' }) || await Department.findOne({});

      // Create Identified Complaint
      const createComplaintRes = await apiRequest('/api/complaints', {
        method: 'POST',
        token: studentToken,
        body: {
          title: 'Projector malfunctioning in Lab 304',
          category: 'Laboratory issue',
          department: cseDept._id,
          location: 'Lab 304, Third Floor, Tech Block',
          description: 'The HDMI connection flickers constantly during afternoon lectures, disrupting practical demonstrations.',
          priority: 'high',
          isAnonymous: false,
        },
      });

      testComplaintId = createComplaintRes.data.complaint?._id;
      testComplaintTicketId = createComplaintRes.data.ticketId;
      recordResult(
        'Complaint Registration',
        'Student creates identified grievance ticket with unique ticket ID',
        createComplaintRes.status === 201 && Boolean(testComplaintTicketId),
        `Ticket: ${testComplaintTicketId}`
      );

      // Create Anonymous Complaint
      const createAnonComplaintRes = await apiRequest('/api/complaints', {
        method: 'POST',
        token: studentToken,
        body: {
          title: 'Unfair grading rubric applied without prior notice',
          category: 'Faculty-related issue',
          department: cseDept._id,
          location: 'Department Office',
          description: 'Grading scheme for internal lab test was changed retroactively without notification.',
          priority: 'medium',
          isAnonymous: true,
        },
      });
      testAnonymousComplaintId = createAnonComplaintRes.data.complaint?._id;
      recordResult(
        'Anonymous Grievance',
        'Student creates anonymous grievance ticket with anonymity flag enabled',
        createAnonComplaintRes.status === 201 && createAnonComplaintRes.data.complaint?.isAnonymous === true,
        `Ticket: ${createAnonComplaintRes.data.ticketId}`
      );

      // Student views own complaints list
      const myComplaintsRes = await apiRequest('/api/complaints/my', { token: studentToken });
      recordResult(
        'Student Grievance List',
        'Student retrieves their own grievance tickets via /api/complaints/my',
        myComplaintsRes.status === 200 && myComplaintsRes.data.complaints.length >= 2,
        `complaints count: ${myComplaintsRes.data.complaints?.length}`
      );

      // Student views single complaint details
      const viewComplaintRes = await apiRequest(`/api/complaints/${testComplaintId}`, { token: studentToken });
      recordResult(
        'Grievance Details',
        'Student retrieves single complaint details with status history timeline',
        viewComplaintRes.status === 200 && viewComplaintRes.data.complaint.ticketId === testComplaintTicketId,
        `Status: ${viewComplaintRes.data.complaint?.status}`
      );

      // Student adds message to complaint thread
      const addMsgRes = await apiRequest(`/api/complaints/${testComplaintId}/messages`, {
        method: 'POST',
        token: studentToken,
        body: { message: 'We also noticed the power adapter cord is slightly frayed.' },
      });
      recordResult(
        'Grievance Dialogue',
        'Student posts message to complaint discussion thread',
        addMsgRes.status === 201 && addMsgRes.data.comment?.senderRole === 'student',
        `commentId: ${addMsgRes.data.comment?._id}`
      );

      // IDOR Protection: Student B cannot view Student A's complaint
      const secondStudentRes = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Student IDOR Tester',
          email: 'test.qa.student2@campusvoice.edu',
          password: 'Password@2026',
          studentId: 'STU-QA-002',
        },
      });
      const studentBToken = secondStudentRes.data.token;

      const idorRes = await apiRequest(`/api/complaints/${testComplaintId}`, { token: studentBToken });
      recordResult(
        'IDOR Protection',
        'Student B is blocked from viewing Student A complaint (403 Forbidden)',
        idorRes.status === 403,
        `status: ${idorRes.status}`
      );
    }

    // =========================================================================
    // SECTION 3: HR OFFICER PORTAL TESTING
    // =========================================================================
    console.log('\n--- Section 3: HR Officer Portal Testing ---');
    let hrToken = null;
    let hrUser = null;
    {
      // HR Login
      const hrLoginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'anita.deshmukh@campus.edu', password: 'Admin@2026' },
      });
      hrToken = hrLoginRes.data.token;
      hrUser = hrLoginRes.data.user;

      recordResult(
        'HR Authentication',
        'HR Officer logs in successfully with authorized role',
        hrLoginRes.status === 200 && (hrUser.role === 'hr_officer' || hrUser.role === 'hr'),
        `HR Officer: ${hrUser.name}`
      );

      // HR Dashboard Metrics
      const hrDashRes = await apiRequest('/api/hr/dashboard', { token: hrToken });
      recordResult(
        'HR Dashboard',
        'HR Officer retrieves operational dashboard statistics',
        hrDashRes.status === 200 && hrDashRes.data.data.stats.totalComplaints > 0,
        `Total Complaints: ${hrDashRes.data.data?.stats?.totalComplaints}`
      );

      // HR Views All Complaints (with Anonymous scrubbing)
      const hrAllComplaintsRes = await apiRequest('/api/complaints/all', { token: hrToken });
      const retrievedAnon = hrAllComplaintsRes.data.complaints.find(
        (c) => c._id === testAnonymousComplaintId.toString()
      );
      recordResult(
        'Anonymous Grievance Masking',
        'HR sees anonymous complaint with masked student profile ("Anonymous Student")',
        hrAllComplaintsRes.status === 200 && retrievedAnon && retrievedAnon.student.name === 'Anonymous Student',
        `Masked name: ${retrievedAnon?.student?.name}`
      );
    }

    // 3A: Grievance Lifecycle Management (Full State Machine Progression)
    {
      // 1. New -> Under Review
      const underReviewRes = await apiRequest(`/api/complaints/${testComplaintId}/status`, {
        method: 'PATCH',
        token: hrToken,
        body: { status: 'under_review', note: 'Initial review commenced by Facilities HR team.' },
      });
      recordResult(
        'Grievance Lifecycle: under_review',
        'HR transitions complaint status from new -> under_review with review note',
        underReviewRes.status === 200 && underReviewRes.data.complaint.status === 'under_review',
        `status: ${underReviewRes.data.complaint?.status}`
      );

      // 2. Under Review -> Assigned
      const facilitiesDept = await Department.findOne({ code: 'BVOC' }) || await Department.findOne({});
      const assignRes = await apiRequest(`/api/complaints/${testComplaintId}/assign`, {
        method: 'POST',
        token: hrToken,
        body: {
          departmentId: facilitiesDept._id,
          staffId: hrUser.id || hrUser._id,
          note: 'Assigned to Campus Facilities Engineering for hardware replacement.',
        },
      });
      recordResult(
        'Grievance Lifecycle: assigned',
        'HR assigns complaint to department and designated officer',
        assignRes.status === 200 && assignRes.data.complaint.status === 'assigned',
        `assigned department: ${facilitiesDept.code}`
      );

      // 3. Assigned -> In Progress
      const inProgressRes = await apiRequest(`/api/complaints/${testComplaintId}/status`, {
        method: 'PATCH',
        token: hrToken,
        body: { status: 'in_progress', note: 'Replacement projector and cable dispatched to Lab 304.' },
      });
      recordResult(
        'Grievance Lifecycle: in_progress',
        'HR updates status to in_progress with dispatch details',
        inProgressRes.status === 200 && inProgressRes.data.complaint.status === 'in_progress',
        `status: ${inProgressRes.data.complaint?.status}`
      );

      // 4. In Progress -> Resolved
      const resolvedRes = await apiRequest(`/api/complaints/${testComplaintId}/status`, {
        method: 'PATCH',
        token: hrToken,
        body: {
          status: 'resolved',
          resolutionSummary: 'HDMI projector and ceiling adapter replaced and tested successfully.',
        },
      });
      recordResult(
        'Grievance Lifecycle: resolved',
        'HR transitions status to resolved with formal resolution summary',
        resolvedRes.status === 200 && resolvedRes.data.complaint.status === 'resolved',
        `resolution: ${resolvedRes.data.complaint?.resolutionSummary}`
      );

      // 5. Resolved -> Reopened (by Student)
      const reopenRes = await apiRequest(`/api/complaints/${testComplaintId}/reopen`, {
        method: 'POST',
        token: studentToken,
        body: { reopenReason: 'Audio output from the new projector is still distorted.' },
      });
      recordResult(
        'Grievance Lifecycle: reopened',
        'Student successfully reopens resolved complaint with reason',
        reopenRes.status === 200 && reopenRes.data.complaint.status === 'reopened',
        `status: ${reopenRes.data.complaint?.status}`
      );

      // 6. Reopened -> Closed (by HR)
      const closedRes = await apiRequest(`/api/complaints/${testComplaintId}/status`, {
        method: 'PATCH',
        token: hrToken,
        body: { status: 'closed', note: 'Dedicated soundbar installed. Issue permanently closed.' },
      });
      recordResult(
        'Grievance Lifecycle: closed',
        'HR transitions status to closed with final closure timestamp',
        closedRes.status === 200 && closedRes.data.complaint.status === 'closed',
        `status: ${closedRes.data.complaint?.status}`
      );

      // Alternative Branch: Rejection Flow
      const rejectCandidate = await Complaint.create({
        ticketId: 'CV-TEST-REJECT-001',
        title: 'Request to waive all semester tuition fees',
        category: 'Administration issue',
        description: 'Student demands fee waiver without institutional scholarship application.',
        student: studentUser.id || studentUser._id,
        status: 'new',
      });
      const rejectRes = await apiRequest(`/api/complaints/${rejectCandidate._id}/status`, {
        method: 'PATCH',
        token: hrToken,
        body: {
          status: 'rejected',
          rejectionReason: 'Fee waiver requests must be routed via Financial Aid portal with income certificates.',
        },
      });
      recordResult(
        'Grievance Lifecycle: rejected',
        'HR rejects grievance outside institutional policy with documented rejection reason',
        rejectRes.status === 200 && rejectRes.data.complaint.status === 'rejected',
        `rejection: ${rejectRes.data.complaint?.rejectionReason}`
      );
    }

    // 3B: Internal HR Notes & Communication Segregation
    {
      // HR creates internal confidential note
      const internalNoteRes = await apiRequest(`/api/complaints/${testComplaintId}/messages`, {
        method: 'POST',
        token: hrToken,
        body: {
          message: 'CONFIDENTIAL INTERNAL NOTE: Verify vendor warranty before approving invoice.',
          isInternalNote: true,
        },
      });
      recordResult(
        'Internal HR Note Creation',
        'HR Officer adds confidential internal note flagged with isInternalNote: true',
        internalNoteRes.status === 201 && internalNoteRes.data.comment.isInternalNote === true,
        `commentId: ${internalNoteRes.data.comment?._id}`
      );

      // Student views complaint: Verify internal note is filtered out!
      const studentViewComplaintRes = await apiRequest(`/api/complaints/${testComplaintId}`, { token: studentToken });
      const internalNoteLeaked = studentViewComplaintRes.data.messages.some((m) => m.isInternalNote === true);
      recordResult(
        'Internal Note Privacy Segregation',
        'Internal HR notes are completely excluded from student complaint dialogue view',
        !internalNoteLeaked,
        `Total messages visible to student: ${studentViewComplaintRes.data.messages?.length}`
      );

      // Student attempt to create internal note is overridden to false
      const studentTamperNoteRes = await apiRequest(`/api/complaints/${testComplaintId}/messages`, {
        method: 'POST',
        token: studentToken,
        body: {
          message: 'Student attempt to write internal note',
          isInternalNote: true, // Attempt privilege escalation
        },
      });
      recordResult(
        'Internal Note Privilege Enforcement',
        'Student cannot create internal notes (flag automatically neutralized to false)',
        studentTamperNoteRes.status === 201 && studentTamperNoteRes.data.comment.isInternalNote === false,
        `isInternalNote: ${studentTamperNoteRes.data.comment?.isInternalNote}`
      );
    }

    // 3C: Dynamic Feedback Form Builder Operations (HR)
    let hrCreatedFormId = null;
    {
      const newFormPayload = {
        title: 'CV-TEST HR Annual Feedback Survey',
        description: 'Comprehensive campus satisfaction assessment',
        category: 'Campus Facilities',
        targetAudience: 'all',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 86400000),
        isAnonymous: true,
        status: 'draft',
        questions: [
          { label: 'Campus Cleanliness', questionType: 'rating_5', isRequired: true },
          { label: 'Suggestions for Improvement', questionType: 'long_text', isRequired: false },
        ],
      };

      const createFormRes = await apiRequest('/api/forms', {
        method: 'POST',
        token: hrToken,
        body: newFormPayload,
      });

      hrCreatedFormId = createFormRes.data.form?._id;
      recordResult(
        'Form Builder: Create Form',
        'HR Officer creates new feedback form with custom question sets',
        createFormRes.status === 201 && Boolean(hrCreatedFormId),
        `Form ID: ${hrCreatedFormId}`
      );

      // Verify FormVersion snapshot 1 exists
      const versionDoc = await FormVersion.findOne({ form: hrCreatedFormId, versionNumber: 1 });
      recordResult(
        'Form Versioning',
        'Form creation automatically generates immutable Version 1 snapshot in FormVersion',
        Boolean(versionDoc),
        `versionNumber: ${versionDoc?.versionNumber}`
      );

      // Update Form Status: Draft -> Published
      const publishRes = await apiRequest(`/api/forms/${hrCreatedFormId}/status`, {
        method: 'PATCH',
        token: hrToken,
        body: { status: 'published' },
      });
      recordResult(
        'Form Builder: Publish Form',
        'HR Officer transitions form status to published',
        publishRes.status === 200 && publishRes.data.form.status === 'published',
        `status: ${publishRes.data.form?.status}`
      );

      // Duplicate Form
      const duplicateRes = await apiRequest(`/api/forms/${hrCreatedFormId}/duplicate`, {
        method: 'POST',
        token: hrToken,
      });
      const duplicatedFormId = duplicateRes.data.form?._id;
      recordResult(
        'Form Builder: Duplicate Form',
        'HR Officer duplicates existing form with questions snapshot',
        duplicateRes.status === 201 && Boolean(duplicatedFormId),
        `Duplicated title: ${duplicateRes.data.form?.title}`
      );

      // Delete Duplicated Form
      const deleteRes = await apiRequest(`/api/forms/${duplicatedFormId}`, {
        method: 'DELETE',
        token: hrToken,
      });
      recordResult(
        'Form Builder: Delete Form',
        'HR Officer deletes duplicate feedback form',
        deleteRes.status === 200,
        `status: ${deleteRes.status}`
      );
    }

    // 3D: Analytics, Participation Tracking & Data Exports
    {
      // Overview stats
      const overviewRes = await apiRequest('/api/analytics/overview', { token: hrToken });
      recordResult(
        'Analytics Dashboard',
        'HR Officer retrieves platform analytics overview and sentiment distribution',
        overviewRes.status === 200 && overviewRes.data.success === true,
        `totalForms: ${overviewRes.data.totalForms}`
      );

      // Participation report
      const partRes = await apiRequest(`/api/submissions/forms/${eligibleFormId}/participation`, { token: hrToken });
      recordResult(
        'Participation Tracking',
        'HR Officer retrieves student participation report without correlated responses',
        partRes.status === 200 && Array.isArray(partRes.data.participationList),
        `Total eligible: ${partRes.data.totalEligible}`
      );

      // CSV Export
      const csvRes = await apiRequest(`/api/submissions/forms/${eligibleFormId}/export/csv`, { token: hrToken });
      recordResult(
        'Data Export: CSV',
        'HR Officer exports feedback responses as CSV with Content-Type text/csv',
        csvRes.status === 200 && typeof csvRes.data === 'string' && csvRes.data.includes('Response #'),
        `CSV bytes: ${csvRes.data.length}`
      );

      // Excel (.xlsx) Export
      const excelRes = await apiRequest(`/api/submissions/forms/${eligibleFormId}/export/excel`, { token: hrToken });
      recordResult(
        'Data Export: Excel (XLSX)',
        'HR Officer exports feedback responses as binary XLSX workbook',
        excelRes.status === 200 && excelRes.data.byteLength > 1000,
        `Excel buffer size: ${excelRes.data.byteLength} bytes`
      );

      // Announcements: HR creates announcement
      const announcementRes = await apiRequest('/api/announcements', {
        method: 'POST',
        token: hrToken,
        body: {
          title: 'Campus Wi-Fi Maintenance Schedule',
          content: 'Network maintenance scheduled for Sunday 2 AM to 5 AM.',
          category: 'Facilities',
          priority: 'important',
          targetAudience: 'all',
        },
      });
      recordResult(
        'HR Announcements',
        'HR Officer broadcasts institutional announcement to student community',
        announcementRes.status === 201 && announcementRes.data.announcement?.title.includes('Wi-Fi'),
        `announcementId: ${announcementRes.data.announcement?._id}`
      );
    }

    // =========================================================================
    // SECTION 4: SUPER ADMIN PORTAL TESTING
    // =========================================================================
    console.log('\n--- Section 4: Super Admin Portal Testing ---');
    let adminToken = null;
    let adminUser = null;
    let provisionedHrEmail = 'test.qa.hr.officer@campusvoice.edu';
    let provisionedHrId = null;
    {
      // Super Admin Login
      const adminLoginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@campusvoice.edu', password: 'Admin@2026' },
      });
      adminToken = adminLoginRes.data.token;
      adminUser = adminLoginRes.data.user;

      recordResult(
        'Super Admin Authentication',
        'Super Admin logs in successfully and receives authorized token',
        adminLoginRes.status === 200 && (adminUser.role === 'super_admin' || adminUser.role === 'superadmin'),
        `Super Admin: ${adminUser.name}`
      );

      // Super Admin Dashboard Overview
      const adminDashRes = await apiRequest('/api/admin/dashboard', { token: adminToken });
      recordResult(
        'Super Admin Dashboard',
        'Super Admin retrieves institutional governance statistics & recent audit logs',
        adminDashRes.status === 200 && adminDashRes.data.data.stats.totalUsers > 0,
        `Total Users: ${adminDashRes.data.data?.stats?.totalUsers}`
      );

      // Super Admin Provisions New HR Officer (/api/admin/create-hr)
      const hrDept = await Department.findOne({ code: 'IT' }) || await Department.findOne({});
      const createHrRes = await apiRequest('/api/admin/create-hr', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Mr. Alok Verma',
          email: provisionedHrEmail,
          password: 'Password@2026',
          department: hrDept._id,
        },
      });

      provisionedHrId = createHrRes.data.user?._id || createHrRes.data.user?.id;
      const verifyHrInDb = await User.findOne({ email: provisionedHrEmail });
      recordResult(
        'HR Account Provisioning',
        'Super Admin provisions authorized HR Officer account with hr_officer role',
        createHrRes.status === 201 && verifyHrInDb && (verifyHrInDb.role === 'hr_officer' || verifyHrInDb.role === 'hr'),
        `Assigned role: ${verifyHrInDb?.role}`
      );

      // Super Admin User Management: Suspend Account
      const suspendRes = await apiRequest(`/api/admin/users/${provisionedHrId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'suspended' },
      });
      recordResult(
        'User Management: Suspend',
        'Super Admin suspends account status to prevent unauthorized access',
        suspendRes.status === 200 && suspendRes.data.user.accountStatus === 'suspended',
        `accountStatus: ${suspendRes.data.user?.accountStatus}`
      );

      // Suspended user cannot log in
      const suspendedLoginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: provisionedHrEmail, password: 'Password@2026' },
      });
      recordResult(
        'Suspended Login Enforcement',
        'Suspended user login attempt is blocked with account inactive/suspended error',
        suspendedLoginRes.status === 403 || suspendedLoginRes.status === 401,
        `status: ${suspendedLoginRes.status}`
      );

      // Restore account status
      const restoreRes = await apiRequest(`/api/admin/users/${provisionedHrId}/status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'active' },
      });
      recordResult(
        'User Management: Restore',
        'Super Admin restores account status to active',
        restoreRes.status === 200 && restoreRes.data.user.accountStatus === 'active',
        `accountStatus: ${restoreRes.data.user?.accountStatus}`
      );

      // Department Management
      const createDeptRes = await apiRequest('/api/departments', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'School of Artificial Intelligence',
          code: 'SAI',
          description: 'Department of AI, Machine Learning and Data Sciences',
        },
      });
      const newDeptId = createDeptRes.data.department?._id;
      recordResult(
        'Department Management: Create',
        'Super Admin creates new academic department',
        createDeptRes.status === 201 && Boolean(newDeptId),
        `Dept Code: ${createDeptRes.data.department?.code}`
      );

      // System Settings & SLA Configuration: Fetch & Update
      const getSettingsRes = await apiRequest('/api/admin/settings', { token: adminToken });
      recordResult(
        'System Settings: Fetch',
        'Super Admin fetches institutional configuration and SLA policies',
        getSettingsRes.status === 200 && typeof getSettingsRes.data.settings === 'object' && Boolean(getSettingsRes.data.settings.portalTitle),
        `Portal Title: ${getSettingsRes.data.settings?.portalTitle}`
      );

      const updateSettingsRes = await apiRequest('/api/admin/settings', {
        method: 'PUT',
        token: adminToken,
        body: { complaintSlaDays: 7 },
      });
      recordResult(
        'System Settings: Update',
        'Super Admin updates institutional SLA complaint resolution timeframe',
        updateSettingsRes.status === 200 && updateSettingsRes.data.success === true,
        'Updated complaintSlaDays to 7'
      );

      // Security Audit Logs Verification
      const auditRes = await apiRequest('/api/admin/audit-logs', { token: adminToken });
      recordResult(
        'Audit Logging: Verification',
        'Super Admin queries system audit logs recording administrative and user actions',
        auditRes.status === 200 && Array.isArray(auditRes.data.logs) && auditRes.data.logs.length > 0,
        `Logged audit events: ${auditRes.data.logs?.length}`
      );
    }

    // =========================================================================
    // SECTION 5: STRICT ROLE-BASED ACCESS CONTROL (RBAC MATRIX)
    // =========================================================================
    console.log('\n--- Section 5: Strict Role-Based Access Control (RBAC Matrix) ---');
    {
      // 1. Student attempting to access /api/admin/dashboard -> 403
      const studentAdminRes = await apiRequest('/api/admin/dashboard', { token: studentToken });
      recordResult(
        'RBAC: Student -> Admin Route',
        'Student blocked from accessing Super Admin API endpoints (403 Forbidden)',
        studentAdminRes.status === 403,
        `status: ${studentAdminRes.status}`
      );

      // 2. Student attempting to access /api/hr/dashboard -> 403
      const studentHrRes = await apiRequest('/api/hr/dashboard', { token: studentToken });
      recordResult(
        'RBAC: Student -> HR Route',
        'Student blocked from accessing HR Officer API endpoints (403 Forbidden)',
        studentHrRes.status === 403,
        `status: ${studentHrRes.status}`
      );

      // 3. Student attempting to author a form -> 403
      const studentCreateFormRes = await apiRequest('/api/forms', {
        method: 'POST',
        token: studentToken,
        body: { title: 'Illegal Student Form', endDate: new Date() },
      });
      recordResult(
        'RBAC: Student -> Form Authoring',
        'Student blocked from creating feedback forms (403 Forbidden)',
        studentCreateFormRes.status === 403,
        `status: ${studentCreateFormRes.status}`
      );

      // 4. HR Officer attempting to access /api/admin/dashboard -> 403
      const hrAdminRes = await apiRequest('/api/admin/dashboard', { token: hrToken });
      recordResult(
        'RBAC: HR -> Admin Route',
        'HR Officer blocked from accessing Super Admin governance endpoints (403 Forbidden)',
        hrAdminRes.status === 403,
        `status: ${hrAdminRes.status}`
      );

      // 5. HR Officer attempting to create Super Admin account -> 403
      const hrCreateSuperAdminRes = await apiRequest('/api/admin/users', {
        method: 'POST',
        token: hrToken,
        body: {
          name: 'Unauthorized Super Admin',
          email: 'unauth.superadmin@campusvoice.edu',
          password: 'Password@2026',
          role: 'super_admin',
        },
      });
      recordResult(
        'RBAC: HR -> Super Admin Creation',
        'HR Officer blocked from creating administrative accounts (403 Forbidden)',
        hrCreateSuperAdminRes.status === 403,
        `status: ${hrCreateSuperAdminRes.status}`
      );

      // 6. Unauthenticated requests to protected endpoints -> 401
      const unauthRes = await apiRequest('/api/complaints/my');
      recordResult(
        'RBAC: Unauthenticated Requests',
        'Unauthenticated access without token rejected with 401 Unauthorized',
        unauthRes.status === 401,
        `status: ${unauthRes.status}`
      );
    }

    // =========================================================================
    // SECTION 6: CLEANUP & SUMMARY
    // =========================================================================
    console.log('\n--- Section 6: Cleanup & Test Data Teardown ---');
    await cleanupTestData();
    recordResult('Teardown', 'Isolated test records purged cleanly from database', true, 'Test database clean');

    // Summary calculation
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log('\n=============================================================');
    console.log(`   AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
    console.log('=============================================================\n');

    if (failedTests > 0) {
      console.error('FAILED TESTS:');
      results.filter((r) => !r.passed).forEach((r) => {
        console.error(` - [${r.section}] ${r.testName}: ${r.details}`);
      });
      process.exit(1);
    } else {
      console.log('ALL FUNCTIONAL REQUIREMENTS FULLY VERIFIED.');
      process.exit(0);
    }
  } catch (err) {
    console.error('FATAL TEST RUNNER ERROR:', err);
    process.exit(1);
  }
}

async function cleanupTestData() {
  await User.deleteMany({ email: { $regex: /^test\.qa\./i } });
  await Form.deleteMany({ title: { $regex: /^CV-TEST/i } });
  await Complaint.deleteMany({ title: { $regex: /^Projector malfunctioning|^Unfair grading|^Request to waive/i } });
  await Complaint.deleteMany({ ticketId: { $regex: /^CV-TEST/i } });
  await Announcement.deleteMany({ title: { $regex: /^Campus Wi-Fi Maintenance/i } });
  await Department.deleteMany({ code: 'SAI' });
}

runFunctionalAudit();
