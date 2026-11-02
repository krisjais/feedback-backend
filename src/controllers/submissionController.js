const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const Form = require('../models/Form');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const SubmissionReceipt = require('../models/SubmissionReceipt');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { recordAuditLog } = require('../middleware/audit');

/**
 * Fisher-Yates array shuffling to eliminate insertion-order correlation
 */
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Submit Feedback Form (Student Only)
const submitFeedback = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const { answers } = req.body;

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Feedback form not found.' });
    }

    if (form.status !== 'published') {
      return res.status(400).json({ success: false, message: 'This form is not currently open for responses.' });
    }

    const now = new Date();
    if (now > new Date(form.endDate)) {
      return res.status(400).json({ success: false, message: 'The submission deadline for this form has expired.' });
    }

    // ELIGIBILITY VERIFICATION (Broken Access Control Prevention)
    if (form.targetAudience === 'department_specific' && form.eligibleDepartments?.length > 0) {
      const studentDeptId = req.user.department?._id || req.user.department;
      const isEligibleDept = form.eligibleDepartments.some(
        (d) => d.toString() === studentDeptId?.toString()
      );
      if (!isEligibleDept) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not enrolled in an eligible academic department for this survey.',
        });
      }
    }

    if (form.targetAudience === 'year_specific' && form.eligibleAcademicYears?.length > 0) {
      const isEligibleYear = form.eligibleAcademicYears.includes(req.user.academicYear);
      if (!isEligibleYear) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: This survey is restricted to specific academic year cohorts.',
        });
      }
    }

    // Check if student has already submitted
    const existingReceipt = await SubmissionReceipt.findOne({
      form: formId,
      student: req.user._id,
    });

    if (existingReceipt) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted feedback for this form.',
        receiptCode: existingReceipt.receiptCode,
      });
    }

    // Fetch questions to validate required inputs
    const questions = await Question.find({ form: formId });
    const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

    // Format formattedAnswers
    const formattedAnswers = [];
    for (const ans of answers || []) {
      const q = questionMap.get(ans.questionId?.toString());
      if (q) {
        if (q.isRequired && (ans.value === undefined || ans.value === null || ans.value === '')) {
          return res.status(400).json({
            success: false,
            message: `Question "${q.label}" is required.`,
          });
        }
        formattedAnswers.push({
          question: q._id,
          questionLabel: q.label,
          questionType: q.questionType,
          value: ans.value,
        });
      }
    }

    // Create unique receipt code
    const receiptCode = 'CV-RCPT-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // 1. Create Submission record
    // CRITICAL PRIVACY ARCHITECTURE:
    // If anonymous, student is explicitly NULL and NEVER stored in the submission document!
    await Submission.create({
      form: form._id,
      formVersion: form.currentVersion || 1,
      isAnonymous: form.isAnonymous,
      student: form.isAnonymous ? null : req.user._id,
      studentDepartmentSnapshot: form.isAnonymous ? '' : (req.user.department?.name || ''),
      studentYearSnapshot: form.isAnonymous ? '' : (req.user.academicYear || ''),
      answers: formattedAnswers,
      submittedAt: new Date(),
    });

    // 2. Create Submission Receipt for tracking participation without linking answers
    await SubmissionReceipt.create({
      form: form._id,
      student: req.user._id,
      receiptCode,
      isAnonymous: form.isAnonymous,
      submittedAt: new Date(),
    });

    // Create student notification
    await Notification.create({
      recipient: req.user._id,
      title: 'Feedback Submitted Successfully',
      message: `Your response for "${form.title}" has been recorded. Receipt: ${receiptCode}`,
      type: 'form',
      link: `/student/feedback/${form._id}`,
    });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully.',
      receiptCode,
      isAnonymous: form.isAnonymous,
    });
  } catch (error) {
    next(error);
  }
};

// Get Form Responses (HR only)
// ANTI-CORRELATION: Shuffles submissions and removes exact timestamps on anonymous surveys
const getFormResponses = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found.' });
    }

    const query = { form: formId };

    const rawSubmissions = await Submission.find(query)
      .populate('student', 'name email studentId')
      .lean();

    const totalReceipts = await SubmissionReceipt.countDocuments({ form: formId });

    let finalSubmissions = rawSubmissions;

    if (form.isAnonymous) {
      // 1. Obliterate insertion-order correlation
      finalSubmissions = shuffleArray(rawSubmissions);

      // 2. Obliterate timing side-channel correlation
      finalSubmissions = finalSubmissions.map((sub) => ({
        ...sub,
        student: null,
        studentDepartmentSnapshot: '',
        studentYearSnapshot: '',
        // Strip exact seconds/milliseconds to prevent timestamp matching against receipts
        submittedAt: new Date(sub.submittedAt).toISOString().split('T')[0] + ' (Anonymized)',
      }));
    }

    res.json({
      success: true,
      formTitle: form.title,
      isAnonymous: form.isAnonymous,
      totalResponses: finalSubmissions.length,
      totalReceipts,
      submissions: finalSubmissions,
    });
  } catch (error) {
    next(error);
  }
};

// Get Student Participation Report (HR only)
// Shows which eligible students have completed the form without exposing answers or correlation timestamps
const getStudentParticipation = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const form = await Form.findById(formId).populate('eligibleDepartments', 'name code');
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found.' });
    }

    // Determine target eligible students (strictly role: 'student' - HR and Admins never included)
    let studentQuery = { role: 'student', $or: [{ accountStatus: 'active' }, { status: 'active' }] };
    if (form.targetAudience === 'department_specific' && form.eligibleDepartments?.length > 0) {
      studentQuery.department = { $in: form.eligibleDepartments.map((d) => d._id) };
    }
    if (form.targetAudience === 'year_specific' && form.eligibleAcademicYears?.length > 0) {
      studentQuery.academicYear = { $in: form.eligibleAcademicYears };
    }

    const eligibleUsers = await User.find(studentQuery)
      .populate('department', 'name code')
      .select('name email studentId department academicYear role');

    // Strict filter: under no circumstances should HR officers or Admins appear in student participation
    const totalEligibleStudents = eligibleUsers.filter(
      (u) => u.role === 'student' && u.role !== 'hr_officer' && u.role !== 'hr' && u.role !== 'super_admin' && u.role !== 'superadmin'
    );

    const receipts = await SubmissionReceipt.find({ form: formId }).select('student receiptCode submittedAt');
    const receiptMap = new Map(receipts.map((r) => [r.student.toString(), r]));

    const participationList = totalEligibleStudents.map((s) => {
      const receipt = receiptMap.get(s._id.toString());
      let participationTime = null;
      if (receipt) {
        // If form is anonymous, do NOT expose exact second timestamp in participation report
        participationTime = form.isAnonymous
          ? new Date(receipt.submittedAt).toISOString().split('T')[0]
          : receipt.submittedAt;
      }

      return {
        studentId: s.studentId,
        name: s.name,
        email: s.email,
        role: 'student',
        department: s.department?.name || 'N/A',
        academicYear: s.academicYear,
        hasSubmitted: Boolean(receipt),
        submittedAt: participationTime,
        receiptCode: receipt ? receipt.receiptCode : null,
      };
    });

    const submittedCount = receipts.length;
    const totalCount = totalEligibleStudents.length;
    const participationRate = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;

    res.json({
      success: true,
      formTitle: form.title,
      isAnonymous: form.isAnonymous,
      totalEligible: totalCount,
      totalSubmitted: submittedCount,
      participationRate,
      participationList,
    });
  } catch (error) {
    next(error);
  }
};

// Export Responses to CSV (Anti-Correlation protected)
const exportResponsesCsv = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    let submissions = await Submission.find({ form: formId })
      .populate('student', 'name email studentId')
      .lean();
    const questions = await Question.find({ form: formId }).sort({ order: 1 });

    if (form.isAnonymous) {
      submissions = shuffleArray(submissions);
    }

    const data = submissions.map((sub, index) => {
      const row = {
        'Response #': index + 1,
        'Submitted At': form.isAnonymous
          ? new Date(sub.submittedAt).toISOString().split('T')[0]
          : new Date(sub.submittedAt).toLocaleString(),
        'Mode': sub.isAnonymous ? 'Anonymous' : 'Identified',
        'Student Name': sub.isAnonymous ? 'ANONYMOUS' : (sub.student?.name || sub.studentDepartmentSnapshot || 'N/A'),
        'Student ID': sub.isAnonymous ? 'ANONYMOUS' : (sub.student?.studentId || 'N/A'),
      };

      questions.forEach((q) => {
        const found = sub.answers.find((a) => a.question?.toString() === q._id.toString());
        const val = found ? found.value : '';
        row[q.label] = Array.isArray(val) ? val.join(', ') : (val !== undefined && val !== null ? String(val) : '');
      });

      return row;
    });

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_Responses.csv`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

// Export Responses to Excel (XLSX) (Anti-Correlation protected)
const exportResponsesExcel = async (req, res, next) => {
  try {
    const { formId } = req.params;
    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ success: false, message: 'Form not found.' });

    let submissions = await Submission.find({ form: formId })
      .populate('student', 'name email studentId')
      .lean();
    const questions = await Question.find({ form: formId }).sort({ order: 1 });

    if (form.isAnonymous) {
      submissions = shuffleArray(submissions);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Feedback Responses');

    // Header columns
    const columns = [
      { header: 'Response #', key: 'responseNum', width: 12 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 },
      { header: 'Response Mode', key: 'mode', width: 15 },
      { header: 'Student Name', key: 'name', width: 24 },
      { header: 'Student ID', key: 'studentId', width: 16 },
    ];

    questions.forEach((q, i) => {
      columns.push({
        header: q.label,
        key: `q_${i}`,
        width: 30,
      });
    });

    worksheet.columns = columns;

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };

    submissions.forEach((sub, index) => {
      const rowData = {
        responseNum: index + 1,
        submittedAt: form.isAnonymous
          ? new Date(sub.submittedAt).toISOString().split('T')[0]
          : new Date(sub.submittedAt).toLocaleString(),
        mode: sub.isAnonymous ? 'Anonymous' : 'Identified',
        name: sub.isAnonymous ? 'ANONYMOUS' : (sub.student?.name || 'N/A'),
        studentId: sub.isAnonymous ? 'ANONYMOUS' : (sub.student?.studentId || 'N/A'),
      };

      questions.forEach((q, i) => {
        const found = sub.answers.find((a) => a.question?.toString() === q._id.toString());
        const val = found ? found.value : '';
        rowData[`q_${i}`] = Array.isArray(val) ? val.join(', ') : (val !== undefined && val !== null ? String(val) : '');
      });

      worksheet.addRow(rowData);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_Responses.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getFormResponses,
  getStudentParticipation,
  exportResponsesCsv,
  exportResponsesExcel,
};
