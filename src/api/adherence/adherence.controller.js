const adherenceService = require('./adherence.service');
const scheduleService = require('../../core/services/scheduleService');

class AdherenceController {
  /**
   * Confirm medication taken
   */
  async confirm(req, res, next) {
    try {
      const { logId } = req.params;
      const { log, profile } = await adherenceService.confirmTaken(logId, req.user._id);
      
      res.status(200).json({
        status: 'success',
        message: 'Medication marked as Taken successfully.',
        data: {
          log,
          gamification: profile
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List logs for a patient
   */
  async getLogs(req, res, next) {
    try {
      const patientId = req.user.role === 'Patient' ? req.user._id : req.query.patientId;
      if (!patientId) {
        return res.status(400).json({
          status: 'fail',
          message: 'Please provide patientId as a query parameter'
        });
      }

      const logs = await adherenceService.getLogs(patientId);
      res.status(200).json({
        status: 'success',
        results: logs.length,
        data: { logs }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * For testing: manually trigger a new medication schedule (Level 1 Alert)
   */
  async triggerSchedule(req, res, next) {
    try {
      const { patientId, medId } = req.body;
      const log = await adherenceService.triggerSchedule(
        patientId || req.user._id,
        medId
      );

      res.status(201).json({
        status: 'success',
        message: 'Medication schedule checks triggered (Level 1 Standard Alert fired).',
        data: { log }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * For testing: manually sweep and process active escalations immediately
   */
  async sweepEscalations(req, res, next) {
    try {
      // Import scheduleService to execute immediate sweep
      const count = await scheduleService.sweepActiveEscalations();
      
      res.status(200).json({
        status: 'success',
        message: 'Manual escalation sweep complete.',
        data: {
          processedLogsCount: count
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdherenceController();
