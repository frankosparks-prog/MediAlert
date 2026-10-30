const AdherenceLog = require('./adherence.model');
const CaregiverAlert = require('./caregiverAlert.model');
const Medication = require('../medications/medication.model');
const User = require('../auth/auth.model');
const notificationService = require('../../core/services/notificationService');
const smsService = require('../../core/services/smsService');
const gamificationService = require('../gamification/gamification.service');
const escalationQueueService = require('../../core/queues/escalationQueueService');
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

    // Enqueue Level 2 Escalation delayed job in BullMQ (or fallback)
    await escalationQueueService.scheduleEscalation(log, 2);

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

      // Enqueue Level 3 Escalation delayed job
      await escalationQueueService.scheduleEscalation(log, 3);
    } else if (nextLevel === 3) {
      // Trigger Level 3 Alert
      log.escalationLevel = 3;
      log.lastAlertSentAt = new Date();
      await log.save();
      await notificationService.sendLevel3Alert(patient, med);

      // Enqueue Level 4 (Missed / Dependant Alert) delayed job
      await escalationQueueService.scheduleEscalation(log, 4);
    } else if (nextLevel === 4) {
      // Trigger Dependant Alert, Reset Streak, Mark Missed
      log.escalationLevel = 4;
      log.status = 'Missed';
      await log.save();

      // Handle gamification free pass / soft decay & wilting
      await gamificationService.handleMissedMedication(patient._id);

      // Notify caregivers/dependants in the associatedUsers list
      const associated = await User.find({ _id: { $in: patient.associatedUsers } });
      if (associated.length > 0) {
        for (const contact of associated) {
          // 1. Send push alert
          await notificationService.sendDependantAlert(contact, patient, med);

          // 2. Create tracking record for caregiver alert
          const alert = await CaregiverAlert.create({
            logId: log._id,
            patientId: patient._id,
            caregiverId: contact._id,
            recipientPhone: contact.phoneNumber || contact.contactInfo,
            status: 'PUSH_SENT',
            pushSentAt: new Date()
          });

          // 3. Schedule SMS Fallback delayed job
          await escalationQueueService.scheduleSmsFallback(alert);
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

    // Instantly cancel any pending Level 2/3/4 jobs in BullMQ Redis or fallback
    await escalationQueueService.cancelPendingEscalations(log._id);

    // Cancel any pending caregiver alerts for this log
    const pendingAlerts = await CaregiverAlert.find({ logId: log._id, status: 'PUSH_SENT' });
    for (const alert of pendingAlerts) {
      alert.status = 'CANCELLED';
      await alert.save();
      await escalationQueueService.cancelSmsFallback(alert._id);
    }

    // Update Adherence Log
    log.status = 'Taken';
    log.takenTime = new Date();
    log.escalationLevel = 0; // Reset active escalation
    await log.save();

    // Reward XP, Plant Revival, and Streak
    const updatedProfile = await gamificationService.awardMedicationTaken(log.patientId);

    return { log, profile: updatedProfile };
  }

  /**
   * Process delayed SMS fallback when a caregiver alert was not viewed in time
   * @param {string} alertId
   */
  async processSmsFallback(alertId) {
    const alert = await CaregiverAlert.findById(alertId);
    if (!alert) {
      console.warn(`[SMS Fallback] Alert ${alertId} not found. Skipping.`);
      return { status: 'skipped', reason: 'alert_not_found' };
    }

    // Cancellation check: If already viewed, acknowledged, cancelled, or SMS already sent
    if (alert.status === 'VIEWED' || alert.status === 'ACKNOWLEDGED') {
      console.log(`🟢 [SMS Fallback] Alert ${alertId} was already viewed/acknowledged by caregiver. SMS skipped.`);
      return { status: 'skipped', reason: 'already_viewed' };
    }
    if (alert.status === 'CANCELLED') {
      console.log(`🟢 [SMS Fallback] Alert ${alertId} was cancelled (medication taken). SMS skipped.`);
      return { status: 'skipped', reason: 'alert_cancelled' };
    }
    if (alert.status === 'SMS_SENT') {
      console.log(`ℹ️ [SMS Fallback] SMS was already sent for Alert ${alertId}. Skipping.`);
      return { status: 'skipped', reason: 'already_sent' };
    }

    const patient = await User.findById(alert.patientId);
    const log = await AdherenceLog.findById(alert.logId);
    const medication = log ? await Medication.findById(log.medId) : null;

    if (!patient || !medication) {
      console.warn(`⚠️ [SMS Fallback] Missing patient or medication for alert ${alertId}.`);
      return { status: 'skipped', reason: 'data_missing' };
    }

    const qtyStr = medication.quantity ? `${medication.quantity} of ` : '';
    const message = `🚨 URGENT MediAlert: ${patient.username} has missed their scheduled dose of ${qtyStr}${medication.drugName} (${medication.dosage}). In-app alert was unviewed. Please check on them immediately!`;

    const smsResult = await smsService.sendSMS(alert.recipientPhone, message);

    if (smsResult.success) {
      alert.status = 'SMS_SENT';
      alert.smsSentAt = new Date();
      alert.smsMessageId = smsResult.messageId;
      await alert.save();
      console.log(`✅ [SMS Fallback] Urgent SMS successfully dispatched to caregiver (${alert.recipientPhone}). Message ID: ${smsResult.messageId}`);
      return { status: 'success', messageId: smsResult.messageId };
    } else {
      alert.status = 'FAILED';
      alert.smsError = smsResult.error;
      await alert.save();
      console.error(`🔴 [SMS Fallback] Failed to send SMS to ${alert.recipientPhone}: ${smsResult.error}`);
      return { status: 'failed', error: smsResult.error };
    }
  }

  /**
   * Mark an alert as viewed by the caregiver and cancel pending SMS fallback
   * @param {string} alertId
   * @param {string} caregiverId
   */
  async markAlertAsViewed(alertId, caregiverId) {
    const alert = await CaregiverAlert.findOne({ _id: alertId, caregiverId });
    if (!alert) {
      throw new AppError('Caregiver alert not found', 404);
    }

    if (alert.status === 'PUSH_SENT') {
      alert.status = 'VIEWED';
      alert.viewedAt = new Date();
      await alert.save();

      // Cancel pending SMS job immediately
      await escalationQueueService.cancelSmsFallback(alert._id);
      console.log(`🟢 [Alert] Alert ${alertId} viewed by caregiver ${caregiverId}. SMS Fallback cancelled.`);
    }

    return alert;
  }

  /**
   * Acknowledge an alert (caregiver confirms they will check on the patient)
   * @param {string} alertId
   * @param {string} caregiverId
   */
  async markAlertAsAcknowledged(alertId, caregiverId) {
    const alert = await CaregiverAlert.findOne({ _id: alertId, caregiverId });
    if (!alert) {
      throw new AppError('Caregiver alert not found', 404);
    }

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedAt = new Date();
    if (!alert.viewedAt) {
      alert.viewedAt = new Date();
    }
    await alert.save();

    // Cancel pending SMS job immediately
    await escalationQueueService.cancelSmsFallback(alert._id);
    console.log(`🟢 [Alert] Alert ${alertId} acknowledged by caregiver ${caregiverId}.`);

    return alert;
  }

  /**
   * Retrieve alerts for a caregiver
   * @param {string} caregiverId
   */
  async getCaregiverAlerts(caregiverId) {
    return await CaregiverAlert.find({ caregiverId })
      .populate('patientId', 'username contactInfo phoneNumber role')
      .populate({
        path: 'logId',
        populate: { path: 'medId', select: 'drugName dosage scheduleInterval' }
      })
      .sort({ createdAt: -1 });
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
