const Form = require('../models/Form');
const Question = require('../models/Question');
const FormVersion = require('../models/FormVersion');
const SubmissionReceipt = require('../models/SubmissionReceipt');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { recordAuditLog } = require('../middleware/audit');

const escapeRegex = (string) => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// List forms
// Students only see published forms they are eligible for, plus their completion status!
// HR sees all forms.
const getForms = async (req, res, next) => {
  try {
    const isStudent = req.user.role === 'student';
    let query = {};

    if (isStudent) {
      const now = new Date();
      query = {
        status: 'published',
        startDate: { $lte: now },
        $or: [
          { targetAudience: 'all' },
          { eligibleDepartments: req.user.department?._id || req.user.department },
          { eligibleAcademicYears: req.user.academicYear },
        ],
      };
    } else {
      // HR/Super Admin can filter by status or search (sanitized against NoSQL operator injection)
      if (typeof req.query.status === 'string' && req.query.status !== 'all' && !req.query.status.startsWith('$')) {
        query.status = req.query.status;
      }
      if (typeof req.query.category === 'string' && req.query.category !== 'all' && !req.query.category.startsWith('$')) {
        query.category = req.query.category;
      }
      if (typeof req.query.search === 'string' && req.query.search.trim() && !req.query.search.startsWith('$')) {
        query.title = { $regex: escapeRegex(req.query.search.trim()), $options: 'i' };
      }
    }

    const forms = await Form.find(query)
      .populate('eligibleDepartments', 'name code')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // If student, attach whether student has submitted each form
    if (isStudent) {
      const studentReceipts = await SubmissionReceipt.find({
        student: req.user._id,
        form: { $in: forms.map((f) => f._id) },
      });

      const submittedFormIds = new Set(studentReceipts.map((r) => r.form.toString()));

      const enrichedForms = forms.map((f) => {
        const formObj = f.toObject();
        const isSubmitted = submittedFormIds.has(f._id.toString());
        const isExpired = new Date(f.endDate) < new Date();

        let displayStatus = 'Available';
        if (isSubmitted) displayStatus = 'Submitted';
        else if (isExpired) displayStatus = 'Expired';
        else if (f.status === 'closed') displayStatus = 'Closed';

        return {
          ...formObj,
          hasSubmitted: isSubmitted,
          isExpired,
          displayStatus,
        };
      });

      return res.json({ success: true, count: enrichedForms.length, forms: enrichedForms });
    }

    // If HR, attach response count for each form
    const formsWithCounts = await Promise.all(
      forms.map(async (f) => {
        const responseCount = await SubmissionReceipt.countDocuments({ form: f._id });
        const formObj = f.toObject();
        return {
          ...formObj,
          responseCount,
        };
      })
    );

    res.json({ success: true, count: formsWithCounts.length, forms: formsWithCounts });
  } catch (error) {
    next(error);
  }
};

// Get single form with questions
const getFormById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const form = await Form.findById(id)
      .populate('eligibleDepartments', 'name code')
      .populate('createdBy', 'name email');

    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found.' });
    }

    // BOLA / IDOR RESTRICTION: Students cannot view unreleased draft forms or ineligible forms
    if (req.user.role === 'student') {
      if (form.status === 'draft') {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: This feedback form is currently in draft status and has not been published.',
        });
      }

      if (form.targetAudience === 'department_specific' && form.eligibleDepartments?.length > 0) {
        const studentDeptId = req.user.department?._id || req.user.department;
        const isEligibleDept = form.eligibleDepartments.some(
          (d) => d._id?.toString() === studentDeptId?.toString() || d.toString() === studentDeptId?.toString()
        );
        if (!isEligibleDept) {
          return res.status(403).json({
            success: false,
            message: 'Access Denied: You are not authorized to view or submit this department-specific survey.',
          });
        }
      }

      if (form.targetAudience === 'year_specific' && form.eligibleAcademicYears?.length > 0) {
        if (!form.eligibleAcademicYears.includes(req.user.academicYear)) {
          return res.status(403).json({
            success: false,
            message: 'Access Denied: You are not authorized to view this year-specific survey.',
          });
        }
      }
    }

    const questions = await Question.find({ form: id }).sort({ order: 1 });

    // Check student submission receipt
    let studentSubmission = null;
    if (req.user.role === 'student') {
      const receipt = await SubmissionReceipt.findOne({ form: id, student: req.user._id });
      if (receipt) {
        studentSubmission = {
          hasSubmitted: true,
          submittedAt: receipt.submittedAt,
          receiptCode: receipt.receiptCode,
        };
      }
    }

    res.json({
      success: true,
      form,
      questions,
      studentSubmission,
    });
  } catch (error) {
    next(error);
  }
};

// Create Form with initial questions (HR only)
const createForm = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      targetAudience,
      eligibleDepartments,
      eligibleAcademicYears,
      startDate,
      endDate,
      estimatedTimeMinutes,
      isAnonymous,
      maxSubmissionsPerStudent,
      isRequired,
      status,
      questions = [],
    } = req.body;

    if (!title || !endDate) {
      return res.status(400).json({ success: false, message: 'Title and deadline end date are required.' });
    }

    const form = await Form.create({
      title,
      description,
      category: category || 'General Feedback',
      targetAudience: targetAudience || 'all',
      eligibleDepartments: eligibleDepartments || [],
      eligibleAcademicYears: eligibleAcademicYears || [],
      startDate: startDate || new Date(),
      endDate,
      estimatedTimeMinutes: estimatedTimeMinutes || 5,
      isAnonymous: Boolean(isAnonymous),
      maxSubmissionsPerStudent: maxSubmissionsPerStudent || 1,
      isRequired: Boolean(isRequired),
      status: status || 'draft',
      createdBy: req.user._id,
      publishedAt: status === 'published' ? new Date() : null,
    });

    // Create questions
    if (questions && questions.length > 0) {
      const questionDocs = questions.map((q, index) => ({
        form: form._id,
        label: q.label,
        description: q.description || '',
        questionType: q.questionType,
        isRequired: Boolean(q.isRequired),
        placeholder: q.placeholder || '',
        options: q.options || [],
        scaleConfig: q.scaleConfig || { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
        order: q.order !== undefined ? q.order : index,
      }));

      await Question.insertMany(questionDocs);
    }

    // Save initial version snapshot
    const savedQuestions = await Question.find({ form: form._id });
    await FormVersion.create({
      form: form._id,
      versionNumber: 1,
      title: form.title,
      description: form.description,
      questionsSnapshot: savedQuestions,
      changedBy: req.user._id,
      changeSummary: 'Initial version created',
    });

    await recordAuditLog({
      user: req.user,
      action: 'CREATE_FORM',
      module: 'forms',
      details: `Created feedback form: "${form.title}" (Status: ${form.status})`,
      req,
    });

    // If published immediately, notify students
    if (form.status === 'published') {
      notifyStudentsOfNewForm(form);
    }

    res.status(201).json({ success: true, form });
  } catch (error) {
    next(error);
  }
};

// Update Form and Questions (HR only)
const updateForm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { questions, changeSummary, ...formData } = req.body;

    const form = await Form.findById(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found.' });
    }

    // Update form properties
    Object.assign(form, formData);
    form.currentVersion = (form.currentVersion || 1) + 1;
    await form.save();

    // If questions are provided, update them
    if (questions && Array.isArray(questions)) {
      // Remove old questions and insert new set
      await Question.deleteMany({ form: id });

      const questionDocs = questions.map((q, index) => ({
        form: id,
        label: q.label,
        description: q.description || '',
        questionType: q.questionType,
        isRequired: Boolean(q.isRequired),
        placeholder: q.placeholder || '',
        options: q.options || [],
        scaleConfig: q.scaleConfig || { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
        order: q.order !== undefined ? q.order : index,
      }));

      await Question.insertMany(questionDocs);
    }

    // Snapshot version
    const updatedQuestions = await Question.find({ form: id }).sort({ order: 1 });
    await FormVersion.create({
      form: id,
      versionNumber: form.currentVersion,
      title: form.title,
      description: form.description,
      questionsSnapshot: updatedQuestions,
      changedBy: req.user._id,
      changeSummary: changeSummary || 'Form updated by HR',
    });

    await recordAuditLog({
      user: req.user,
      action: 'UPDATE_FORM',
      module: 'forms',
      details: `Updated feedback form "${form.title}" to version ${form.currentVersion}`,
      req,
    });

    res.json({ success: true, form, questions: updatedQuestions });
  } catch (error) {
    next(error);
  }
};

// Change Form Status (publish, close, archive)
const updateFormStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const form = await Form.findById(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found.' });
    }

    form.status = status;
    if (status === 'published' && !form.publishedAt) {
      form.publishedAt = new Date();
      notifyStudentsOfNewForm(form);
    }
    if (status === 'closed') {
      form.closedAt = new Date();
    }

    await form.save();

    await recordAuditLog({
      user: req.user,
      action: 'CHANGE_FORM_STATUS',
      module: 'forms',
      details: `Form "${form.title}" status changed to ${status}`,
      req,
    });

    res.json({ success: true, form });
  } catch (error) {
    next(error);
  }
};

// Duplicate Form
const duplicateForm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sourceForm = await Form.findById(id);
    if (!sourceForm) {
      return res.status(404).json({ success: false, message: 'Source form not found.' });
    }

    const sourceQuestions = await Question.find({ form: id });

    const newForm = await Form.create({
      title: `${sourceForm.title} (Copy)`,
      description: sourceForm.description,
      category: sourceForm.category,
      targetAudience: sourceForm.targetAudience,
      eligibleDepartments: sourceForm.eligibleDepartments,
      eligibleAcademicYears: sourceForm.eligibleAcademicYears,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      estimatedTimeMinutes: sourceForm.estimatedTimeMinutes,
      isAnonymous: sourceForm.isAnonymous,
      maxSubmissionsPerStudent: sourceForm.maxSubmissionsPerStudent,
      isRequired: sourceForm.isRequired,
      status: 'draft',
      createdBy: req.user._id,
    });

    const newQuestions = sourceQuestions.map((q) => ({
      form: newForm._id,
      label: q.label,
      description: q.description,
      questionType: q.questionType,
      isRequired: q.isRequired,
      placeholder: q.placeholder,
      options: q.options,
      scaleConfig: q.scaleConfig,
      order: q.order,
    }));

    await Question.insertMany(newQuestions);

    await recordAuditLog({
      user: req.user,
      action: 'DUPLICATE_FORM',
      module: 'forms',
      details: `Duplicated form "${sourceForm.title}" as "${newForm.title}"`,
      req,
    });

    res.status(201).json({ success: true, form: newForm });
  } catch (error) {
    next(error);
  }
};

// Delete Form (drafts only)
const deleteForm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const form = await Form.findById(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found.' });
    }

    await Question.deleteMany({ form: id });
    await FormVersion.deleteMany({ form: id });
    await Form.findByIdAndDelete(id);

    await recordAuditLog({
      user: req.user,
      action: 'DELETE_FORM',
      module: 'forms',
      details: `Deleted feedback form: "${form.title}"`,
      req,
    });

    res.json({ success: true, message: 'Form deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// Version history
const getFormVersions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const versions = await FormVersion.find({ form: id })
      .populate('changedBy', 'name email')
      .sort({ versionNumber: -1 });
    res.json({ success: true, versions });
  } catch (error) {
    next(error);
  }
};

// Helper: Notify students of new form
const notifyStudentsOfNewForm = async (form) => {
  try {
    let studentQuery = { role: 'student', status: 'active' };
    if (form.targetAudience === 'department_specific' && form.eligibleDepartments?.length > 0) {
      studentQuery.department = { $in: form.eligibleDepartments };
    }
    if (form.targetAudience === 'year_specific' && form.eligibleAcademicYears?.length > 0) {
      studentQuery.academicYear = { $in: form.eligibleAcademicYears };
    }

    const students = await User.find(studentQuery).select('_id');
    const notifications = students.map((s) => ({
      recipient: s._id,
      title: 'New Feedback Form Published',
      message: `"${form.title}" is now available. Deadline: ${new Date(form.endDate).toLocaleDateString()}.`,
      type: 'form',
      link: `/student/feedback/${form._id}`,
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('Error notifying students:', err.message);
  }
};

module.exports = {
  getForms,
  getFormById,
  createForm,
  updateForm,
  updateFormStatus,
  duplicateForm,
  deleteForm,
  getFormVersions,
};
