const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Complaint title is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Complaint category is required'],
      enum: [
        'Faculty-related issue',
        'Classroom issue',
        'Laboratory issue',
        'Library issue',
        'Canteen issue',
        'Washroom and cleanliness',
        'Infrastructure issue',
        'Administration issue',
        'Internet and technical issue',
        'Harassment or serious misconduct',
        'Other',
      ],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Detailed description is required'],
      trim: true,
    },
    incidentDate: {
      type: Date,
      default: null,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    isSensitive: {
      type: Boolean,
      default: false,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'new',
        'under_review',
        'assigned',
        'in_progress',
        'resolved',
        'rejected',
        'reopened',
        'closed',
      ],
      default: 'new',
      index: true,
    },
    assignedDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolutionSummary: {
      type: String,
      default: '',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    reopenReason: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
    reopenedAt: {
      type: Date,
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Complaint', complaintSchema);
