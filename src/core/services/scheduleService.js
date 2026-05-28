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
    if (activeLogs.length === 0) {
      console.log(`   No active escalated logs to process.`);
      return 0;
    }

    console.log(`   Found ${activeLogs.length} active escalated log(s). Checking time thresholds...`);
    const now = new Date();
    let processedCount = 0;

    for (const log of activeLogs) {
      const elapsedMilliseconds = now - new Date(log.lastAlertSentAt);
      const elapsedMinutes = elapsedMilliseconds / (1000 * 60);

      console.log(`     Log ID: ${log._id} | Level: ${log.escalationLevel} | Elapsed: ${elapsedMinutes.toFixed(2)} min | Limit: ${env.ESCALATION_INTERVAL_MINUTES} min`);

      if (elapsedMinutes >= env.ESCALATION_INTERVAL_MINUTES) {
        await this.adherenceService.escalateLog(log);
        processedCount++;
      }
    }

    return processedCount;
  }
}

module.exports = new ScheduleService();
