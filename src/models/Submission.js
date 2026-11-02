const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    form: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form',
      required: true,
      index: true,
    },
    formVersion: {
      type: Number,
      default: 1,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
      index: true,
    },
    // ONLY stored if isAnonymous is false. Never stored for anonymous submissions.
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    studentDepartmentSnapshot: {
      type: String,
      default: '',
    },
    studentYearSnapshot: {
      type: String,
      default: '',
    },
    answers: [
      {
        question: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
          required: true,
        },
        questionLabel: {
          type: String,
          required: true,
        },
        questionType: {
          type: String,
          required: true,
        },
        value: {
          type: mongoose.Schema.Types.Mixed,
        },
      },
    ],
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Submission', submissionSchema);
