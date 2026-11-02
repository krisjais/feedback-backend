const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    form: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Form',
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: [true, 'Question label is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    questionType: {
      type: String,
      required: true,
      enum: [
        'short_text',
        'long_text',
        'multiple_choice',
        'checkbox',
        'dropdown',
        'yes_no',
        'rating_5',
        'rating_10',
        'linear_scale',
        'date',
        'file_upload',
      ],
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    placeholder: {
      type: String,
      default: '',
    },
    options: [
      {
        type: String,
        trim: true,
      },
    ],
    scaleConfig: {
      min: { type: Number, default: 1 },
      max: { type: Number, default: 5 },
      minLabel: { type: String, default: 'Poor' },
      maxLabel: { type: String, default: 'Excellent' },
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Question', questionSchema);
