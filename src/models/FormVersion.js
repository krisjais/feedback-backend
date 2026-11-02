const mongoose = require('mongoose');

const formVersionSchema = new mongoose.Schema(
  {
    form: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form',
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    questionsSnapshot: [
      {
        questionId: mongoose.Schema.Types.ObjectId,
        label: String,
        questionType: String,
        isRequired: Boolean,
        options: [String],
        scaleConfig: Object,
        order: Number,
      },
    ],
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changeSummary: {
      type: String,
      default: 'Version update',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('FormVersion', formVersionSchema);
