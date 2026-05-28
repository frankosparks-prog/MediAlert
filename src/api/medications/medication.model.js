const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Medication must belong to a patient'],
    },
    drugName: {
      type: String,
      required: [true, 'Please provide the drug name'],
      trim: true,
    },
    dosage: {
      type: String,
      required: [true, 'Please provide the dosage (e.g. 500mg, 1 tablet)'],
      trim: true,
    },
    scheduleInterval: {
      type: String,
      required: [true, 'Please provide schedule interval (e.g., specific times like "08:00,20:00", or Cron string, or hourly frequency)'],
      default: '08:00',
    }
  },
  {
    timestamps: true,
  }
);

const Medication = mongoose.model('Medication', medicationSchema);

module.exports = Medication;
