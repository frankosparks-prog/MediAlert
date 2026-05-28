const Medication = require('./medication.model');
const { AppError } = require('../../core/middleware/errorHandler');

class MedicationService {
  /**
   * Add a new medication schedule
   * @param {Object} medicationData
   */
  async createMedication(medicationData) {
    const { patientId, drugName, dosage, scheduleInterval } = medicationData;

    if (!patientId || !drugName || !dosage) {
      throw new AppError('Please provide patientId, drugName, and dosage', 400);
    }

    const medication = await Medication.create({
      patientId,
      drugName,
      dosage,
      scheduleInterval: scheduleInterval || '08:00',
    });

    return medication;
  }

  /**
   * Get all medications for a specific patient
   * @param {string} patientId
   */
  async getPatientMedications(patientId) {
    return await Medication.find({ patientId });
  }

  /**
   * Get medication by ID
   * @param {string} medId
   */
  async getMedicationById(medId) {
    const med = await Medication.findById(medId);
    if (!med) {
      throw new AppError('Medication not found', 404);
    }
    return med;
  }
}

module.exports = new MedicationService();
