// backend/models/Report.js
// Generated reports are stored in MongoDB (not on local disk) so report
// history works on hosts with a read-only / ephemeral filesystem.

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    format: {
      type: String,
      enum: ['pdf', 'csv'],
      required: true
    },
    reportType: {
      type: String,
      default: 'comprehensive'
    },
    size: {
      type: Number,
      required: true
    },
    data: {
      type: Buffer,
      required: true,
      select: false // Only loaded when downloading
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

reportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
