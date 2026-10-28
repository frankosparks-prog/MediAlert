const mongoose = require('mongoose');

const caregiverAlertSchema = new mongoose.Schema(
  {
    logId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdherenceLog',
      required: [true, 'Alert must be linked to an adherence log'],
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Alert must reference a patient'],
    },
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Alert must reference a caregiver / 3rd party'],
      index: true,
    },
    recipientPhone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['PUSH_SENT', 'VIEWED', 'ACKNOWLEDGED', 'SMS_SENT', 'FAILED', 'CANCELLED'],
        message: 'Invalid alert status',
      },
      default: 'PUSH_SENT',
      index: true,
    },
    pushSentAt: {
      type: Date,
      default: Date.now,
    },
    viewedAt: {
      type: Date,
    },
    acknowledgedAt: {
      type: Date,
    },
    smsSentAt: {
      type: Date,
    },
    smsMessageId: {
      type: String,
    },
    smsError: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const CaregiverAlert = mongoose.model('CaregiverAlert', caregiverAlertSchema);

module.exports = CaregiverAlert;

