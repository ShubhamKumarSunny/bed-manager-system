// backend/models/Alert.js
// Alert model for managing notifications and alerts

const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ['occupancy_high', 'bed_emergency', 'maintenance_needed', 'request_pending'],
        message: '{VALUE} is not a valid alert type'
      },
      required: [true, 'Alert type is required']
    },
    severity: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'critical'],
        message: '{VALUE} is not a valid severity level'
      },
      default: 'low'
    },
    message: {
      type: String,
      required: [true, 'Alert message is required'],
      trim: true
    },
    relatedBed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bed',
      default: null
    },
    relatedRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmergencyRequest',
      default: null
    },
    ward: {
      type: String,
      enum: {
        values: ['ICU', 'General', 'Emergency'],
        message: '{VALUE} is not a valid ward'
      },
      default: null
    },
    targetRole: [{
      type: String,
      enum: {
        values: ['manager', 'hospital_admin', 'ward_staff', 'er_staff'],
        message: '{VALUE} is not a valid target role'
      }
    }],
    // Resolved alerts (e.g. the related request was approved/rejected) are hidden for everyone
    read: {
      type: Boolean,
      default: false
    },
    dismissedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Index for faster queries by targetRole
alertSchema.index({ targetRole: 1 });

// Index for faster queries by dismissedBy
alertSchema.index({ dismissedBy: 1 });

// Compound index for targetRole + timestamp queries
alertSchema.index({ targetRole: 1, timestamp: -1 });

// Index for type-based queries
alertSchema.index({ type: 1 });

module.exports = mongoose.model('Alert', alertSchema);
