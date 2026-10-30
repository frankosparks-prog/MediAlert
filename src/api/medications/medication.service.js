const Medication = require('./medication.model');
const { AppError } = require('../../core/middleware/errorHandler');

class MedicationService {
  /**
   * Add a new medication schedule
   * @param {Object} medicationData
   */
  async createMedication(medicationData) {
    const { patientId, drugName, dosage, quantity, scheduleInterval, instructions, plantType } = medicationData;

    if (!patientId || !drugName || !dosage) {
      throw new AppError('Please provide patientId, drugName, and dosage', 400);
    }

    const medication = await Medication.create({
      patientId,
      drugName,
      dosage,
      quantity: quantity || '1 pill',
      scheduleInterval: scheduleInterval || '08:00',
      instructions: instructions || 'Take with water',
      plantType: plantType || 'Sunflower',
      isActive: true,
    });

    return medication;
  }

  /**
   * Update medication
   * @param {string} medId
   * @param {Object} updateData
   */
  async updateMedication(medId, updateData) {
    const med = await Medication.findByIdAndUpdate(medId, updateData, { new: true, runValidators: true });
    if (!med) {
      throw new AppError('Medication not found', 404);
    }
    return med;
  }

  /**
   * Delete medication
   * @param {string} medId
   */
  async deleteMedication(medId) {
    const med = await Medication.findByIdAndDelete(medId);
    if (!med) {
      throw new AppError('Medication not found', 404);
    }
    return med;
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
