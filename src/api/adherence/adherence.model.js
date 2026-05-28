const mongoose = require('mongoose');

const adherenceLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Adherence log must belong to a patient'],
    },
    medId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medication',
      required: [true, 'Adherence log must reference a medication'],
    },
    scheduledTime: {
      type: Date,
      required: [true, 'Adherence log must have a scheduled time'],
    },
    takenTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: {
        values: ['Taken', 'Missed', 'Escalated'],
        message: 'Status must be Taken, Missed, or Escalated',
      },
      default: 'Escalated',
    },
    // Helper fields for the 3-level Escalation Protocol
    escalationLevel: {
      type: Number,
      enum: [0, 1, 2, 3, 4], // 1, 2, 3 represent active levels. 4 represents fully missed and escalated.
      default: 1,
    },
    lastAlertSentAt: {
      type: Date,
      default: Date.now,
    }
  },
  {
    timestamps: true,
  }
);

const AdherenceLog = mongoose.model('AdherenceLog', adherenceLogSchema);

module.exports = AdherenceLog;
