const mongoose = require('mongoose');

const formSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Form title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      required: [true, 'Feedback category is required'],
      enum: [
        'Faculty Evaluation',
        'Course & Curriculum',
        'Campus Facilities',
        'Hostel & Canteen',
        'Library & Resources',
        'Laboratory & Equipment',
        'Student Support Services',
        'General Feedback',
      ],
      default: 'General Feedback',
    },
    targetAudience: {
      type: String,
      enum: ['all', 'department_specific', 'year_specific', 'custom'],
      default: 'all',
    },
    eligibleDepartments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
      },
    ],
    eligibleAcademicYears: [
      {
        type: String,
        enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate'],
      },
    ],
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: [true, 'Form end deadline is required'],
    },
    estimatedTimeMinutes: {
      type: Number,
      default: 5,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    maxSubmissionsPerStudent: {
      type: Number,
      default: 1,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'published', 'closed', 'archived'],
      default: 'draft',
    },
    currentVersion: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    publishedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual helper to check if active/expired
formSchema.virtual('isCurrentlyOpen').get(function () {
  const now = new Date();
  return (
    this.status === 'published' &&
    now >= new Date(this.startDate) &&
    now <= new Date(this.endDate)
  );
});

formSchema.set('toJSON', { virtuals: true });
formSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Form', formSchema);
