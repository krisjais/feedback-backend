const mongoose = require('mongoose');

const complaintMessageSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['student', 'hr', 'superadmin', 'hr_officer', 'super_admin'],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    isInternalNote: {
      type: Boolean,
      default: false,
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
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

module.exports = mongoose.model('ComplaintMessage', complaintMessageSchema);
