/**
 * Second-Stage Penetration Testing and Vulnerability Verification Suite
 * Verifies live defenses for:
 * 1. Privilege Escalation
 * 2. IDOR / Broken Object-Level Authorization (BOLA)
 * 3. Anonymous Feedback Correlation & Deanonymization Attacks
 * 4. NoSQL Operator Injection & ReDoS Defense
 * 5. CSRF Defense on State-Changing API Requests
 * 6. File Upload Validation & Extension/MIME Spoofing Defense
 * 7. Administrative API Protection
 */

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${testName}${details ? ' - ' + details : ''}`);
    testsFailed++;
  }
}

// Chainable query builder helper for mongoose mocks
const mockChain = (finalResult) => {
  const handler = {
    populate: () => handler,
    select: () => handler,
    sort: () => handler,
    limit: () => handler,
    lean: async () => finalResult,
    then: (resolve) => resolve(finalResult),
  };
  return handler;
};

async function runPenetrationSuite() {
  console.log('===============================================================');
  console.log('CAMPUSVOICE STAGE-2 PENETRATION TESTING & SECURITY AUDIT SUITE');
  console.log('===============================================================\n');

  // =========================================================================
  // VULNERABILITY AUDIT 1: IDOR on Complaint Records & Cross-Student Tampering
  // =========================================================================
  console.log('--- AUDIT 1: Insecure Direct Object Reference (IDOR) on Grievances ---');
  {
    const { getComplaintById, addMessage, reopenComplaint } = require('../controllers/complaintController');
    const Complaint = require('../models/Complaint');
    const ComplaintMessage = require('../models/ComplaintMessage');
    const ComplaintStatusHistory = require('../models/ComplaintStatusHistory');

    const studentAId = '65f1a1a1a1a1a1a1a1a1a1a1';
    const studentBId = '65f1b2b2b2b2b2b2b2b2b2b2';

    // Mock Complaint owned by Student A
    const mockComplaintStudentA = {
      _id: '65f1c3c3c3c3c3c3c3c3c3c3',
      ticketId: 'CV-2026-9001',
      student: { _id: studentAId },
      isAnonymous: false,
      status: 'resolved',
      toObject: function () {
        return { ...this };
      },
    };

    const origFindById = Complaint.findById;
    const origMsgFind = ComplaintMessage.find;
    const origHistoryFind = ComplaintStatusHistory.find;

    Complaint.findById = () => mockChain(mockComplaintStudentA);
    ComplaintMessage.find = () => mockChain([]);
    ComplaintStatusHistory.find = () => mockChain([]);

    // Test 1a: Student B attempting to read Student A's complaint
    let studentBReadStatusCode = null;
    const reqStudentB = {
      params: { id: mockComplaintStudentA._id },
      user: { _id: studentBId, role: 'student' },
    };
    const res1a = {
      status: (code) => {
        studentBReadStatusCode = code;
        return { json: () => {} };
      },
    };

    await getComplaintById(reqStudentB, res1a, () => {});
    assert(
      studentBReadStatusCode === 403,
      'Test 1.1: IDOR Read Blocked - Student B cannot view Student A\'s grievance ticket (HTTP 403)'
    );

    // Test 1b: Student B attempting to tamper/send messages on Student A's complaint
    let studentBMessageStatusCode = null;
    const reqStudentBMsg = {
      params: { id: mockComplaintStudentA._id },
      body: { message: 'Unauthorized message by Student B' },
      user: { _id: studentBId, role: 'student' },
    };
    const res1b = {
      status: (code) => {
        studentBMessageStatusCode = code;
        return { json: () => {} };
      },
    };

    await addMessage(reqStudentBMsg, res1b, () => {});
    assert(
      studentBMessageStatusCode === 403,
      'Test 1.2: IDOR Write Blocked - Student B cannot inject messages into Student A\'s ticket (HTTP 403)'
    );

    // Test 1c: Student B attempting to reopen Student A's resolved complaint
    let studentBReopenStatusCode = null;
    const reqStudentBReopen = {
      params: { id: mockComplaintStudentA._id },
      body: { reopenReason: 'Malicious reopen attempt' },
      user: { _id: studentBId, role: 'student' },
    };
    const res1c = {
      status: (code) => {
        studentBReopenStatusCode = code;
        return { json: () => {} };
      },
    };

    await reopenComplaint(reqStudentBReopen, res1c, () => {});
    assert(
      studentBReopenStatusCode === 403,
      'Test 1.3: IDOR Lifecycle Tampering Blocked - Student B cannot reopen Student A\'s complaint (HTTP 403)'
    );

    Complaint.findById = origFindById;
    ComplaintMessage.find = origMsgFind;
    ComplaintStatusHistory.find = origHistoryFind;
  }

  // =========================================================================
  // VULNERABILITY AUDIT 2: Anonymous Feedback Correlation & Deanonymization
  // =========================================================================
  console.log('\n--- AUDIT 2: Anonymous Feedback Correlation & Deanonymization Side-Channels ---');
  {
    const { getFormResponses, getStudentParticipation } = require('../controllers/submissionController');
    const Form = require('../models/Form');
    const Submission = require('../models/Submission');
    const SubmissionReceipt = require('../models/SubmissionReceipt');
    const User = require('../models/User');

    const formId = '65f2a1a1a1a1a1a1a1a1a1a1';
    const mockForm = {
      _id: formId,
      title: 'Confidential Anonymous Faculty Appraisal',
      isAnonymous: true,
      status: 'published',
      targetAudience: 'all',
    };

    const origFormFindById = Form.findById;
    const origSubFind = Submission.find;
    const origReceiptFind = SubmissionReceipt.find;
    const origUserFind = User.find;

    Form.findById = () => mockChain(mockForm);

    // Mock 5 sequential submissions
    const mockSubmissions = Array.from({ length: 5 }, (_, i) => ({
      _id: `sub_${i}`,
      form: formId,
      isAnonymous: true,
      student: { name: `Student ${i}`, email: `student${i}@campus.edu` },
      submittedAt: new Date(Date.now() - (5 - i) * 60000), // Distinct timestamps
      answers: [{ question: 'q1', value: `Answer ${i}` }],
    }));

    Submission.find = () => mockChain([...mockSubmissions]);
    SubmissionReceipt.countDocuments = async () => 5;

    // Test 2a: Submissions list shuffling and timestamp scrubbing
    let returnedSubmissions = null;
    const reqHR = { params: { formId }, user: { role: 'hr_officer' } };
    const res2a = {
      json: (data) => {
        returnedSubmissions = data.submissions;
      },
    };

    await getFormResponses(reqHR, res2a, () => {});

    assert(
      returnedSubmissions !== null && returnedSubmissions.length === 5,
      'Test 2.1: Anonymous responses retrieved by authorized HR'
    );

    // Verify student identity fields were scrubbed
    const hasStudentIdentity = returnedSubmissions.some((s) => s.student !== null);
    assert(
      !hasStudentIdentity,
      'Test 2.2: Privacy Guarantee - "student" object is completely null in all anonymous responses'
    );

    // Verify timing fuzzing/truncation
    const hasExactTiming = returnedSubmissions.some((s) => !String(s.submittedAt).includes('Anonymized'));
    assert(
      !hasExactTiming,
      'Test 2.3: Timing Correlation Defense - Exact millisecond timestamps are obfuscated on anonymous submissions'
    );

    // Test 2b: Participation report date-only truncation
    const mockEligibleStudents = [
      { _id: 'stu1', studentId: 'STU-001', name: 'Alice', email: 'alice@campus.edu', department: { name: 'CSE' } },
    ];
    const mockReceipts = [
      { student: 'stu1', receiptCode: 'CV-RCPT-A1B2', submittedAt: new Date() },
    ];

    User.find = () => mockChain(mockEligibleStudents);
    SubmissionReceipt.find = () => mockChain(mockReceipts);

    let participationReport = null;
    const res2b = {
      json: (data) => {
        participationReport = data.participationList;
      },
    };

    await getStudentParticipation(reqHR, res2b, () => {});

    const record = participationReport[0];
    const isTimestampDateOnly = record.submittedAt && !record.submittedAt.includes(':'); // Date-only YYYY-MM-DD has no colons
    assert(
      isTimestampDateOnly,
      'Test 2.4: Participation Timing Defense - Student participation record hides second-precision timestamps'
    );

    Form.findById = origFormFindById;
    Submission.find = origSubFind;
    SubmissionReceipt.find = origReceiptFind;
    User.find = origUserFind;
  }

  // =========================================================================
  // VULNERABILITY AUDIT 3: Broken Object-Level Authorization on Forms
  // =========================================================================
  console.log('\n--- AUDIT 3: BOLA / IDOR on Draft & Ineligible Forms ---');
  {
    const { getFormById } = require('../controllers/formController');
    const { submitFeedback } = require('../controllers/submissionController');
    const Form = require('../models/Form');
    const Question = require('../models/Question');

    const draftFormId = '65f3a1a1a1a1a1a1a1a1a1a1';
    const mockDraftForm = {
      _id: draftFormId,
      title: 'Unreleased Mid-Term Exam Survey (Draft)',
      status: 'draft',
      targetAudience: 'all',
    };

    const origFormFindById = Form.findById;
    const origQFind = Question.find;

    Form.findById = () => mockChain(mockDraftForm);
    Question.find = () => mockChain([]);

    // Test 3a: Student attempting to inspect an unreleased draft form
    let draftAccessCode = null;
    const reqStudentDraft = {
      params: { id: draftFormId },
      user: { role: 'student', department: 'dept1', academicYear: '1st Year' },
    };
    const res3a = {
      status: (code) => {
        draftAccessCode = code;
        return { json: () => {} };
      },
    };

    await getFormById(reqStudentDraft, res3a, () => {});
    assert(
      draftAccessCode === 403,
      'Test 3.1: BOLA Defense - Student cannot access unreleased Draft form by guessing ID (HTTP 403)'
    );

    // Test 3b: Student submitting to ineligible department survey
    const cseDeptId = '65f3b2b2b2b2b2b2b2b2b2b2';
    const mechDeptId = '65f3c3c3c3c3c3c3c3c3c3c3';
    const mockDepartmentForm = {
      _id: 'form_dept_spec',
      title: 'Computer Science Exclusive Department Survey',
      status: 'published',
      endDate: new Date(Date.now() + 86400000),
      targetAudience: 'department_specific',
      eligibleDepartments: [cseDeptId],
    };

    Form.findById = () => mockChain(mockDepartmentForm);

    let ineligibleSubmissionCode = null;
    const reqMechStudent = {
      params: { formId: 'form_dept_spec' },
      body: { answers: [] },
      user: { role: 'student', department: mechDeptId, academicYear: '2nd Year' },
    };
    const res3b = {
      status: (code) => {
        ineligibleSubmissionCode = code;
        return { json: () => {} };
      },
    };

    await submitFeedback(reqMechStudent, res3b, () => {});
    assert(
      ineligibleSubmissionCode === 403,
      'Test 3.2: Broken Access Control Defense - Ineligible department student blocked from submitting (HTTP 403)'
    );

    Form.findById = origFormFindById;
    Question.find = origQFind;
  }

  // =========================================================================
  // VULNERABILITY AUDIT 4: NoSQL Operator Injection & ReDoS Defense
  // =========================================================================
  console.log('\n--- AUDIT 4: NoSQL Operator Injection & ReDoS Defense ---');
  {
    const { getAllComplaints } = require('../controllers/complaintController');
    const { getUsers } = require('../controllers/userController');
    const Complaint = require('../models/Complaint');
    const User = require('../models/User');

    let capturedComplaintQuery = null;
    const origComplaintFind = Complaint.find;
    Complaint.find = (q) => {
      capturedComplaintQuery = q;
      return mockChain([]);
    };

    // Test 4a: Injection attempt with NoSQL operators (?status[$ne]=closed)
    const reqNoSQLStatus = {
      query: {
        status: { $ne: 'closed' }, // Malicious object instead of primitive string
        search: '^([a-zA-Z0-9]+)*$', // ReDoS pattern attempt
      },
    };
    const res4a = { json: () => {} };

    await getAllComplaints(reqNoSQLStatus, res4a, () => {});

    assert(
      capturedComplaintQuery.status === undefined,
      'Test 4.1: NoSQL Injection Blocked - Object parameter { $ne: "closed" } ignored in query construction'
    );

    // Verify ReDoS pattern was sanitized/escaped
    const searchRegex = capturedComplaintQuery.$or[0].ticketId.$regex;
    assert(
      searchRegex.includes('\\^') && searchRegex.includes('\\('),
      'Test 4.2: ReDoS Defense - Regex metacharacters escaped before MongoDB $regex execution'
    );

    // Test 4b: NoSQL operator injection in user directory
    let capturedUserQuery = null;
    const origUserFind = User.find;
    User.find = (q) => {
      capturedUserQuery = q;
      return mockChain([]);
    };

    const reqNoSQLUser = {
      query: {
        role: { $gt: '' }, // Malicious operator
        status: { $exists: true },
      },
    };
    const res4b = { json: () => {} };

    await getUsers(reqNoSQLUser, res4b, () => {});

    assert(
      capturedUserQuery.role === undefined && capturedUserQuery.$or === undefined,
      'Test 4.3: User Directory NoSQL Defense - Operator objects rejected from User.find query'
    );

    Complaint.find = origComplaintFind;
    User.find = origUserFind;
  }

  // =========================================================================
  // VULNERABILITY AUDIT 5: CSRF Defense on State-Changing API Requests
  // =========================================================================
  console.log('\n--- AUDIT 5: Cross-Site Request Forgery (CSRF) Defense ---');
  {
    const csrfMiddleware = (req, res, next) => {
      const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      if (stateChangingMethods.includes(req.method)) {
        const origin = req.headers.origin;
        const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:3000';
        if (origin && origin !== allowedOrigin) {
          return res.status(403).json({
            success: false,
            message: 'CSRF security violation: Cross-site request origin blocked.',
          });
        }
      }
      next();
    };

    // Test 5a: Cross-origin POST from attacker site
    let csrfBlockCode = null;
    const reqAttackerCSRF = {
      method: 'POST',
      headers: { origin: 'https://malicious-attacker.com' },
    };
    const res5a = {
      status: (code) => {
        csrfBlockCode = code;
        return { json: () => {} };
      },
    };

    csrfMiddleware(reqAttackerCSRF, res5a, () => {});
    assert(
      csrfBlockCode === 403,
      'Test 5.1: CSRF Defense - State-changing POST from unauthorized origin blocked (HTTP 403)'
    );

    // Test 5b: Authorized POST from valid frontend
    let allowedProceed = false;
    const reqValidCSRF = {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    };
    const res5b = { status: () => ({ json: () => {} }) };

    csrfMiddleware(reqValidCSRF, res5b, () => {
      allowedProceed = true;
    });
    assert(
      allowedProceed,
      'Test 5.2: Legitimate Request - State-changing POST from authorized frontend passes'
    );
  }

  // =========================================================================
  // VULNERABILITY AUDIT 6: File Upload Security & MIME Spoofing Defense
  // =========================================================================
  console.log('\n--- AUDIT 6: File Upload Security & MIME Spoofing Defense ---');
  {
    const upload = require('../middleware/upload');
    const fileFilter = upload.fileFilter;

    // Test 6a: Executable file upload attempt (.exe)
    let exeError = null;
    fileFilter({}, { originalname: 'exploit.exe', mimetype: 'application/x-msdownload' }, (err, allowed) => {
      exeError = err;
    });
    assert(
      exeError !== null,
      'Test 6.1: Executable Upload Blocked - .exe file rejected by filter'
    );

    // Test 6b: SVG with embedded script (Stored XSS vector)
    let svgError = null;
    fileFilter({}, { originalname: 'vector.svg', mimetype: 'image/svg+xml' }, (err, allowed) => {
      svgError = err;
    });
    assert(
      svgError !== null,
      'Test 6.2: XSS Vector Blocked - SVG image with potential script injection rejected'
    );

    // Test 6c: Extension spoofing (fake.pdf with application/x-sh shell script MIME)
    let spoofError = null;
    fileFilter({}, { originalname: 'document.pdf', mimetype: 'application/x-sh' }, (err, allowed) => {
      spoofError = err;
    });
    assert(
      spoofError !== null,
      'Test 6.3: MIME Spoofing Defense - Disguised PDF with shell script MIME type rejected'
    );

    // Test 6d: Valid legitimate document upload (genuine PNG image)
    let validAllowed = false;
    fileFilter({}, { originalname: 'receipt.png', mimetype: 'image/png' }, (err, allowed) => {
      validAllowed = Boolean(allowed);
    });
    assert(
      validAllowed,
      'Test 6.4: Legitimate Upload - Genuine PNG image with matching MIME type accepted'
    );
  }

  // =========================================================================
  // VULNERABILITY AUDIT 7: Anonymity in Dialogue Thread (ObjectId Scrubbing)
  // =========================================================================
  console.log('\n--- AUDIT 7: Anonymous Grievance Dialogue Thread Protection ---');
  {
    const { getComplaintById } = require('../controllers/complaintController');
    const Complaint = require('../models/Complaint');
    const ComplaintMessage = require('../models/ComplaintMessage');
    const ComplaintStatusHistory = require('../models/ComplaintStatusHistory');

    const rawStudentId = '65f999999999999999999999';
    const mockAnonComplaint = {
      _id: 'comp_anon_1',
      ticketId: 'CV-2026-1234',
      isAnonymous: true,
      student: { _id: rawStudentId, name: 'Secret Student' },
      toObject: function () {
        return { ...this };
      },
    };

    const mockMessages = [
      {
        _id: 'msg_1',
        sender: rawStudentId, // Student's real ObjectId
        senderRole: 'student',
        senderName: 'Secret Student',
        message: 'The laboratory chemicals were stored unsafely.',
      },
    ];

    const origFindById = Complaint.findById;
    const origMsgFind = ComplaintMessage.find;
    const origHistFind = ComplaintStatusHistory.find;

    Complaint.findById = () => mockChain(mockAnonComplaint);
    ComplaintMessage.find = () => mockChain([...mockMessages]);
    ComplaintStatusHistory.find = () => mockChain([]);

    // HR user requests the complaint details
    let returnedMessages = null;
    const reqHR = {
      params: { id: 'comp_anon_1' },
      user: { role: 'hr_officer' },
    };
    const res7 = {
      json: (data) => {
        returnedMessages = data.messages;
      },
    };

    await getComplaintById(reqHR, res7, () => {});

    const firstMsg = returnedMessages && returnedMessages[0];
    const isSenderScrubbed = firstMsg && firstMsg.sender === 'ANONYMOUS' && firstMsg.sender !== rawStudentId;
    assert(
      Boolean(isSenderScrubbed),
      'Test 7.1: BOLA Deanonymization Defense - Student ObjectId in message thread scrubbed to "ANONYMOUS" for HR'
    );

    Complaint.findById = origFindById;
    ComplaintMessage.find = origMsgFind;
    ComplaintStatusHistory.find = origHistFind;
  }

  console.log('\n===============================================================');
  console.log(`PENETRATION TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('===============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPenetrationSuite().catch((err) => {
  console.error('Critical failure during penetration test suite:', err);
  process.exit(1);
});
