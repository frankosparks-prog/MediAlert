const medicationService = require('./medication.service');

class MedicationController {
  async create(req, res, next) {
    try {
      // If patient role is registering their own, assign patientId as req.user._id
      const data = { ...req.body };
      if (req.user.role === 'Patient') {
        data.patientId = req.user._id;
      }

      const medication = await medicationService.createMedication(data);
      res.status(201).json({
        status: 'success',
        data: { medication }
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const patientId = req.user.role === 'Patient' ? req.user._id : req.query.patientId;
      if (!patientId) {
        return res.status(400).json({
          status: 'fail',
          message: 'Please provide patientId as a query parameter'
        });
      }

      const medications = await medicationService.getPatientMedications(patientId);
      res.status(200).json({
        status: 'success',
        results: medications.length,
        data: { medications }
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const medication = await medicationService.updateMedication(req.params.id, req.body);
      res.status(200).json({
        status: 'success',
        data: { medication }
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req, res, next) {
    try {
      await medicationService.deleteMedication(req.params.id);
      res.status(200).json({
        status: 'success',
        message: 'Medication deleted successfully.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MedicationController();
