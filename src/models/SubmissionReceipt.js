const mongoose = require('mongoose');

const submissionReceiptSchema = new mongoose.Schema(
  {
    form: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiptCode: {
      type: String,
      required: true,
      unique: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness per student per form
submissionReceiptSchema.index({ form: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('SubmissionReceipt', submissionReceiptSchema);
