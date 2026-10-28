const cron = require('node-cron');
const env = require('../config/env');
const AdherenceLog = require('../../api/adherence/adherence.model');

class ScheduleService {
  constructor() {
    this.adherenceService = null; // Lazy load to prevent circular dependencies
  }

  /**
   * Initialize and start the background scheduler
   */
  start() {
    console.log(`⏱️ [Schedule Service] Starting background scheduler...`);
    console.log(`   Escalation check frequency: Every 1 minute`);
    console.log(`   Escalation transition threshold: ${env.ESCALATION_INTERVAL_MINUTES} minute(s)`);

    // Run every minute
    cron.schedule('* * * * *', async () => {
      console.log(`⏱️ [Schedule Service] Running scheduled active escalation sweep...`);
      try {
        await this.sweepActiveEscalations();
      } catch (error) {
        console.error(`⏱️ [Schedule Service] Sweep failed:`, error);
      }
    });
  }

  /**
   * Sweep and advance any unconfirmed logs past their escalation thresholds
   */
  async sweepActiveEscalations() {
    // Lazy-load AdherenceService to bypass circular import (AdherenceService references ScheduleService for endpoints)
    if (!this.adherenceService) {
      this.adherenceService = require('../../api/adherence/adherence.service');
    }

    const activeLogs = await this.adherenceService.getActiveEscalations();
    const now = new Date();
    let processedCount = 0;

    if (activeLogs.length > 0) {
      console.log(`   Found ${activeLogs.length} active escalated log(s). Checking time thresholds...`);
      for (const log of activeLogs) {
        const elapsedMilliseconds = now - new Date(log.lastAlertSentAt);
        const elapsedMinutes = elapsedMilliseconds / (1000 * 60);

        console.log(`     Log ID: ${log._id} | Level: ${log.escalationLevel} | Elapsed: ${elapsedMinutes.toFixed(2)} min | Limit: ${env.ESCALATION_INTERVAL_MINUTES} min`);

        if (elapsedMinutes >= env.ESCALATION_INTERVAL_MINUTES) {
          await this.adherenceService.escalateLog(log);
          processedCount++;
        }
      }
    } else {
      console.log(`   No active escalated logs to process.`);
    }

    // Secondary sweep: Check for overdue unviewed Caregiver Alerts needing SMS fallback
    try {
      const CaregiverAlert = require('../../api/adherence/caregiverAlert.model');
      const pendingAlerts = await CaregiverAlert.find({ status: 'PUSH_SENT' });
      for (const alert of pendingAlerts) {
        const elapsedSmsMinutes = (now - new Date(alert.pushSentAt)) / (1000 * 60);
        if (elapsedSmsMinutes >= env.SMS_FALLBACK_MINUTES) {
          console.log(`⏱️ [Schedule Service] Sweeping unviewed CaregiverAlert ${alert._id} (${elapsedSmsMinutes.toFixed(2)} min elapsed). Dispatching SMS fallback.`);
          await this.adherenceService.processSmsFallback(alert._id);
        }
      }
    } catch (alertSweepErr) {
      console.warn(`⚠️ [Schedule Service] CaregiverAlert sweep warning:`, alertSweepErr.message);
    }

    return processedCount;
  }
}

module.exports = new ScheduleService();
