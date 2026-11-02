const crypto = require('crypto');
const Complaint = require('../models/Complaint');
const ComplaintMessage = require('../models/ComplaintMessage');
const ComplaintStatusHistory = require('../models/ComplaintStatusHistory');
const ComplaintAssignment = require('../models/ComplaintAssignment');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { recordAuditLog } = require('../middleware/audit');

// Helper to escape regex special characters for safe MongoDB $regex matching
const escapeRegex = (string) => {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Generate sequential or random ticket ID (e.g. CV-2026-7842)
const generateTicketId = () => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `CV-${year}-${randomNum}`;
};

// Create Complaint (Student)
const createComplaint = async (req, res, next) => {
  try {
    const {
      title,
      category,
      department,
      location,
      description,
      incidentDate,
      priority,
      isAnonymous,
      attachments = [],
    } = req.body;

    if (!title || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, category, and description are required.',
      });
    }

    const isSensitive = category === 'Harassment or serious misconduct';
    let ticketId = generateTicketId();

    // Check collision
    let exists = await Complaint.findOne({ ticketId });
    while (exists) {
      ticketId = generateTicketId();
      exists = await Complaint.findOne({ ticketId });
    }

    // Sanitize attachments: reject javascript: or data: URIs
    const sanitizedAttachments = (Array.isArray(attachments) ? attachments : [])
      .filter((att) => {
        if (!att || !att.fileUrl) return false;
        const url = String(att.fileUrl).trim().toLowerCase();
        return !url.startsWith('javascript:') && !url.startsWith('data:text/html');
      })
      .map((att) => ({
        fileName: String(att.fileName || 'Attachment').slice(0, 150),
        fileUrl: String(att.fileUrl).slice(0, 500),
        fileType: String(att.fileType || 'unknown').slice(0, 50),
        fileSize: Number(att.fileSize) || 0,
      }));

    const complaint = await Complaint.create({
      ticketId,
      title: String(title).trim().slice(0, 200),
      category: String(category).trim(),
      department: department || null,
      location: location ? String(location).trim().slice(0, 100) : '',
      description: String(description).trim().slice(0, 5000),
      incidentDate: incidentDate ? new Date(incidentDate) : null,
      priority: ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium',
      isAnonymous: Boolean(isAnonymous),
      isSensitive,
      student: req.user._id,
      status: 'new',
      attachments: sanitizedAttachments,
    });

    // Record initial status history
    await ComplaintStatusHistory.create({
      complaint: complaint._id,
      previousStatus: 'none',
      newStatus: 'new',
      changedBy: req.user._id,
      changedByName: req.user.name,
      reasonOrNote: 'Complaint registered by student',
      timestamp: new Date(),
    });

    // Notify HR staff (supports canonical hr_officer and super_admin)
    const hrUsers = await User.find({
      role: { $in: ['hr_officer', 'hr', 'super_admin', 'superadmin'] },
      $or: [{ accountStatus: 'active' }, { status: 'active' }],
    }).select('_id');

    const hrNotifications = hrUsers.map((hr) => ({
      recipient: hr._id,
      title: `${priority === 'critical' || priority === 'high' ? '🚨 High Priority ' : ''}New Complaint: ${ticketId}`,
      message: `Category: ${category} - "${title.substring(0, 40)}..."`,
      type: 'complaint',
      link: `/hr/complaints/${complaint._id}`,
    }));

    if (hrNotifications.length > 0) {
      await Notification.insertMany(hrNotifications);
    }

    // Notify student confirmation
    await Notification.create({
      recipient: req.user._id,
      title: 'Complaint Ticket Created',
      message: `Your grievance has been logged under Ticket ID: ${ticketId}. You can track updates in your dashboard.`,
      type: 'complaint',
      link: `/student/complaints/${complaint._id}`,
    });

    await recordAuditLog({
      user: req.user,
      action: 'CREATE_COMPLAINT',
      module: 'complaints',
      details: `Complaint ${ticketId} created (Anonymous: ${complaint.isAnonymous})`,
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      ticketId,
      complaint,
    });
  } catch (error) {
    next(error);
  }
};

// Get My Complaints (Student only)
const getMyComplaints = async (req, res, next) => {
  try {
    const complaints = await Complaint.find({ student: req.user._id })
      .populate('department', 'name code')
      .populate('assignedDepartment', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    next(error);
  }
};

// Get All Complaints (HR / Super Admin)
// Hardened against NoSQL query operator injection & ReDoS
const getAllComplaints = async (req, res, next) => {
  try {
    const { status, category, priority, department, search } = req.query;
    let query = {};

    // Ensure parameters are primitive strings to block NoSQL operator injections (e.g. ?status[$ne]=)
    if (typeof status === 'string' && status !== 'all' && !status.startsWith('$')) {
      query.status = status;
    }
    if (typeof category === 'string' && category !== 'all' && !category.startsWith('$')) {
      query.category = category;
    }
    if (typeof priority === 'string' && priority !== 'all' && !priority.startsWith('$')) {
      query.priority = priority;
    }
    if (typeof department === 'string' && department !== 'all' && !department.startsWith('$')) {
      query.department = department;
    }
    if (typeof search === 'string' && search.trim() && !search.startsWith('$')) {
      const safeSearch = escapeRegex(search.trim());
      query.$or = [
        { ticketId: { $regex: safeSearch, $options: 'i' } },
        { title: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
        { location: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const complaints = await Complaint.find(query)
      .populate('student', 'name email studentId department academicYear')
      .populate('department', 'name code')
      .populate('assignedDepartment', 'name code')
      .populate('assignedStaff', 'name email')
      .sort({ createdAt: -1 });

    // Sanitization: If complaint is anonymous, hide student identity info in response
    const sanitizedComplaints = complaints.map((c) => {
      const obj = c.toObject();
      if (obj.isAnonymous) {
        obj.student = {
          name: 'Anonymous Student',
          email: 'hidden@privacy.campus',
          studentId: 'ANONYMOUS',
          department: obj.department || null,
          academicYear: 'N/A',
        };
      }
      return obj;
    });

    res.json({
      success: true,
      count: sanitizedComplaints.length,
      complaints: sanitizedComplaints,
    });
  } catch (error) {
    next(error);
  }
};

// Get Complaint By ID (Student or HR)
// Hardened against IDOR & Anonymous Complainant ObjectId De-anonymization
const getComplaintById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isStudent = req.user.role === 'student';

    const complaint = await Complaint.findById(id)
      .populate('student', 'name email studentId department academicYear phone')
      .populate('department', 'name code')
      .populate('assignedDepartment', 'name code')
      .populate('assignedStaff', 'name email');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    // IDOR PROTECTION: If student, ensure it's their own complaint
    const complaintStudentId = complaint.student?._id
      ? complaint.student._id.toString()
      : complaint.student
      ? complaint.student.toString()
      : null;

    if (isStudent && complaintStudentId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You are not authorized to view another student's complaint.",
      });
    }

    // Messages query:
    // If student: strictly exclude internal notes!
    let messageQuery = { complaint: id };
    if (isStudent) {
      messageQuery.isInternalNote = { $ne: true };
    }

    const rawMessages = await ComplaintMessage.find(messageQuery).sort({ createdAt: 1 }).lean();
    const history = await ComplaintStatusHistory.find({ complaint: id }).sort({ timestamp: 1 });

    const complaintObj = complaint.toObject();

    // ANONYMITY DE-COUPLING: If complaint is anonymous and requester is HR/Admin, scrub student identity
    if (!isStudent && complaintObj.isAnonymous) {
      complaintObj.student = {
        name: 'Anonymous Student',
        email: 'hidden@privacy.campus',
        studentId: 'ANONYMOUS',
        department: complaintObj.department || null,
        academicYear: 'N/A',
      };
    }

    // BOLA/IDOR SCRUB: If complaint is anonymous and requester is HR, scrub sender ObjectIds of students
    const sanitizedMessages = rawMessages.map((msg) => {
      if (!isStudent && complaintObj.isAnonymous && msg.senderRole === 'student') {
        return {
          ...msg,
          sender: 'ANONYMOUS', // Scrub raw MongoDB ObjectId to prevent correlation
          senderName: 'Student (Anonymous)',
        };
      }
      return msg;
    });

    res.json({
      success: true,
      complaint: complaintObj,
      messages: sanitizedMessages,
      history,
    });
  } catch (error) {
    next(error);
  }
};

// Update Complaint Status (HR only)
const updateComplaintStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note, resolutionSummary, rejectionReason } = req.body;

    const validStatuses = [
      'new',
      'under_review',
      'assigned',
      'in_progress',
      'resolved',
      'rejected',
      'reopened',
      'closed',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint status.' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const previousStatus = complaint.status;
    complaint.status = status;

    if (status === 'resolved') {
      complaint.resolutionSummary = resolutionSummary || note || 'Resolved by HR Administration.';
      complaint.resolvedAt = new Date();
    } else if (status === 'rejected') {
      complaint.rejectionReason = rejectionReason || note || 'Complaint rejected after preliminary review.';
    } else if (status === 'closed') {
      complaint.closedAt = new Date();
    }

    await complaint.save();

    // Log in history
    await ComplaintStatusHistory.create({
      complaint: id,
      previousStatus,
      newStatus: status,
      changedBy: req.user._id,
      changedByName: req.user.name,
      reasonOrNote: note || resolutionSummary || rejectionReason || `Status changed from ${previousStatus} to ${status}`,
      timestamp: new Date(),
    });

    // Notify student
    await Notification.create({
      recipient: complaint.student,
      title: `Complaint Status Updated: ${complaint.ticketId}`,
      message: `Your ticket has transitioned to "${status.toUpperCase()}". ${note || ''}`,
      type: 'complaint',
      link: `/student/complaints/${complaint._id}`,
    });

    await recordAuditLog({
      user: req.user,
      action: 'UPDATE_COMPLAINT_STATUS',
      module: 'complaints',
      details: `Ticket ${complaint.ticketId} updated from ${previousStatus} to ${status}`,
      req,
    });

    res.json({
      success: true,
      message: `Complaint status updated to ${status}.`,
      complaint,
    });
  } catch (error) {
    next(error);
  }
};

// Assign Complaint to Department / Staff (HR only)
const assignComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { departmentId, staffId, notes } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    complaint.assignedDepartment = departmentId || complaint.assignedDepartment;
    complaint.assignedStaff = staffId || complaint.assignedStaff;
    const prevStatus = complaint.status;
    complaint.status = 'assigned';
    await complaint.save();

    await ComplaintAssignment.create({
      complaint: id,
      department: departmentId || null,
      assignedBy: req.user._id,
      assignedTo: staffId || null,
      notes: notes || '',
    });

    await ComplaintStatusHistory.create({
      complaint: id,
      previousStatus: prevStatus,
      newStatus: 'assigned',
      changedBy: req.user._id,
      changedByName: req.user.name,
      reasonOrNote: notes || 'Assigned to responsible department/officer for investigation.',
      timestamp: new Date(),
    });

    // Notify student
    await Notification.create({
      recipient: complaint.student,
      title: `Complaint Assigned: ${complaint.ticketId}`,
      message: 'Your complaint has been assigned to the responsible department for resolution.',
      type: 'complaint',
      link: `/student/complaints/${complaint._id}`,
    });

    await recordAuditLog({
      user: req.user,
      action: 'ASSIGN_COMPLAINT',
      module: 'complaints',
      details: `Assigned complaint ${complaint.ticketId} to department/staff`,
      req,
    });

    res.json({
      success: true,
      message: 'Complaint assigned successfully.',
      complaint,
    });
  } catch (error) {
    next(error);
  }
};

// Add Message or Internal Note
const addMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, isInternalNote, attachments = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message content cannot be empty.' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const isStudent = req.user.role === 'student';
    const complaintStudentId = complaint.student?._id
      ? complaint.student._id.toString()
      : complaint.student
      ? complaint.student.toString()
      : null;

    if (isStudent && complaintStudentId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    // Students CANNOT create internal notes
    const internalNoteFlag = isStudent ? false : Boolean(isInternalNote);

    const newMsg = await ComplaintMessage.create({
      complaint: id,
      sender: req.user._id,
      senderRole: req.user.role,
      senderName: isStudent && complaint.isAnonymous ? 'Student (Anonymous)' : req.user.name,
      isInternalNote: internalNoteFlag,
      message: String(message).trim().slice(0, 3000),
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    // Notify appropriate party
    if (!internalNoteFlag) {
      if (isStudent) {
        // Student replied -> notify HR
        const hrUsers = await User.find({
          role: { $in: ['hr_officer', 'hr', 'super_admin', 'superadmin'] },
          $or: [{ accountStatus: 'active' }, { status: 'active' }],
        }).select('_id');

        const hrNotifs = hrUsers.map((hr) => ({
          recipient: hr._id,
          title: `New Message on Ticket ${complaint.ticketId}`,
          message: `Student sent a message: "${message.substring(0, 50)}..."`,
          type: 'complaint',
          link: `/hr/complaints/${complaint._id}`,
        }));
        if (hrNotifs.length > 0) await Notification.insertMany(hrNotifs);
      } else {
        // HR sent public message -> notify student
        await Notification.create({
          recipient: complaint.student,
          title: `New HR Response on Ticket ${complaint.ticketId}`,
          message: `HR Administration sent you an update: "${message.substring(0, 50)}..."`,
          type: 'complaint',
          link: `/student/complaints/${complaint._id}`,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Message added successfully.',
      comment: newMsg,
    });
  } catch (error) {
    next(error);
  }
};

// Reopen Complaint (Student or HR)
const reopenComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reopenReason } = req.body;

    if (!reopenReason || !String(reopenReason).trim()) {
      return res.status(400).json({ success: false, message: 'Please provide a reason for reopening.' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    const isStudent = req.user.role === 'student';
    const complaintStudentId = complaint.student?._id
      ? complaint.student._id.toString()
      : complaint.student
      ? complaint.student.toString()
      : null;

    if (isStudent && complaintStudentId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const prevStatus = complaint.status;
    complaint.status = 'reopened';
    complaint.reopenReason = String(reopenReason).trim().slice(0, 1000);
    complaint.reopenedAt = new Date();
    await complaint.save();

    await ComplaintStatusHistory.create({
      complaint: id,
      previousStatus: prevStatus,
      newStatus: 'reopened',
      changedBy: req.user._id,
      changedByName: req.user.name,
      reasonOrNote: `Ticket reopened: ${complaint.reopenReason}`,
      timestamp: new Date(),
    });

    // Notify HR
    const hrUsers = await User.find({
      role: { $in: ['hr_officer', 'hr', 'super_admin', 'superadmin'] },
      $or: [{ accountStatus: 'active' }, { status: 'active' }],
    }).select('_id');

    const hrNotifs = hrUsers.map((hr) => ({
      recipient: hr._id,
      title: `⚠️ Ticket Reopened: ${complaint.ticketId}`,
      message: `Reason: ${reopenReason.substring(0, 60)}...`,
      type: 'complaint',
      link: `/hr/complaints/${complaint._id}`,
    }));
    if (hrNotifs.length > 0) await Notification.insertMany(hrNotifs);

    res.json({
      success: true,
      message: 'Complaint has been reopened.',
      complaint,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  getComplaintById,
  updateComplaintStatus,
  assignComplaint,
  addMessage,
  reopenComplaint,
};
