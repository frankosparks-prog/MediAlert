const AdherenceLog = require('./adherence.model');
const Medication = require('../medications/medication.model');
const User = require('../auth/auth.model');
const notificationService = require('../../core/services/notificationService');
const gamificationService = require('../gamification/gamification.service');
const { AppError } = require('../../core/middleware/errorHandler');

class AdherenceService {
  /**
   * Manually trigger/schedule a new medication intake check (starts Level 1)
   * @param {string} patientId
   * @param {string} medId
   * @param {Date} scheduledTime
   */
  async triggerSchedule(patientId, medId, scheduledTime = new Date()) {
    const med = await Medication.findById(medId);
    if (!med) {
      throw new AppError('Medication schedule not found', 404);
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      throw new AppError('Patient not found', 404);
    }

    // Create an adherence log in Escalated (pending response) status, at Level 1
    const log = await AdherenceLog.create({
      patientId,
      medId,
      scheduledTime,
      status: 'Escalated',
      escalationLevel: 1,
      lastAlertSentAt: new Date()
    });

    // Fire Level 1 Notification immediately
    await notificationService.sendLevel1Alert(patient, med);

    return log;
  }

  /**
   * Process and advance escalation for a specific log if it remains unconfirmed
   * @param {Object} log - Mongoose AdherenceLog document
   */
  async escalateLog(log) {
    if (log.status !== 'Escalated') {
      return log; // Already handled (Taken or Missed)
    }

    const med = await Medication.findById(log.medId);
    const patient = await User.findById(log.patientId);

    if (!med || !patient) {
      console.warn(`[Escalation] Orphaned AdherenceLog ${log._id}. Missing patient or medication.`);
      return log;
    }

    const nextLevel = log.escalationLevel + 1;
    console.log(`[Escalation] Advancing AdherenceLog ${log._id} for ${patient.username} to Level ${nextLevel}`);

    if (nextLevel === 2) {
      // Trigger Level 2 Alert
      log.escalationLevel = 2;
      log.lastAlertSentAt = new Date();
      await log.save();
      await notificationService.sendLevel2Alert(patient, med);
    } else if (nextLevel === 3) {
      // Trigger Level 3 Alert
      log.escalationLevel = 3;
      log.lastAlertSentAt = new Date();
      await log.save();
      await notificationService.sendLevel3Alert(patient, med);
    } else if (nextLevel === 4) {
      // Trigger Dependant Alert, Reset Streak, Mark Missed
      log.escalationLevel = 4;
      log.status = 'Missed';
      await log.save();

      // Handle gamification reset
      await gamificationService.handleMissedMedication(patient._id);

      // Notify caregivers/dependants in the associatedUsers list
      const associated = await User.find({ _id: { $in: patient.associatedUsers } });
      if (associated.length > 0) {
        for (const contact of associated) {
          await notificationService.sendDependantAlert(contact, patient, med);
        }
      } else {
        console.log(`⚠️ [Escalation] Patient ${patient.username} has no associated users to alert.`);
      }
    }

    return log;
  }

  /**
   * Confirm medication intake
   * @param {string} logId
   * @param {string} userId - User requesting confirmation
   */
  async confirmTaken(logId, userId) {
    const log = await AdherenceLog.findById(logId);
    if (!log) {
      throw new AppError('Adherence log not found', 404);
    }

    // Verify ownership: must be the patient, or a caregiver/dependant associated with the patient
    const isPatient = log.patientId.toString() === userId.toString();
    if (!isPatient) {
      const actingUser = await User.findById(userId);
      if (!actingUser || !actingUser.associatedUsers.includes(log.patientId)) {
        throw new AppError('You do not have permission to confirm this medication', 403);
      }
    }

    if (log.status === 'Taken') {
      throw new AppError('This dose has already been marked as Taken', 400);
    }
    if (log.status === 'Missed') {
      throw new AppError('This dose was already marked as Missed and cannot be changed', 400);
    }

    // Update Adherence Log
    log.status = 'Taken';
    log.takenTime = new Date();
    log.escalationLevel = 0; // Reset active escalation
    await log.save();

    // Reward XP and Streak
    const updatedProfile = await gamificationService.awardMedicationTaken(log.patientId);

    return { log, profile: updatedProfile };
  }

  /**
   * List adherence logs for a patient
   * @param {string} patientId
   */
  async getLogs(patientId) {
    return await AdherenceLog.find({ patientId })
      .populate('medId')
      .sort({ scheduledTime: -1 });
  }

  /**
   * List logs currently undergoing active escalation
   */
  async getActiveEscalations() {
    return await AdherenceLog.find({ status: 'Escalated' });
  }
}

module.exports = new AdherenceService();
