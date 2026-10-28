const { Queue } = require('bullmq');
const env = require('../config/env');
const { getRedisClient, isRedisEnabled } = require('../config/redis');

class EscalationQueueService {
  constructor() {
    this.queue = null;
    this.queueName = env.ESCALATION_QUEUE_NAME;
    // In-memory fallback timers for local environments when Redis is offline
    this.fallbackTimers = new Map();
  }

  /**
   * Lazily get or initialize the BullMQ Queue
   */
  getQueue() {
    if (!this.queue && isRedisEnabled()) {
      try {
        const connection = getRedisClient();
        this.queue = new Queue(this.queueName, {
          connection,
          prefix: '{medialert}'
        });
        console.log(`📦 [BullMQ] Initialized Queue: "${this.queueName}"`);
      } catch (error) {
        console.warn(`⚠️ [BullMQ] Failed to initialize queue: ${error.message}`);
        this.queue = null;
      }
    }
    return this.queue;
  }

  /**
   * Schedule a delayed escalation job
   * @param {Object} log - AdherenceLog document
   * @param {number} targetLevel - Escalation level (2, 3, or 4)
   * @param {number} delayMs - Delay in milliseconds before firing
   */
  async scheduleEscalation(log, targetLevel, delayMs = null) {
    const logId = log._id.toString();
    const jobId = `esc:${logId}:lvl:${targetLevel}`;
    
    // Default delay: env.ESCALATION_INTERVAL_MINUTES converted to ms
    const delay = delayMs !== null 
      ? delayMs 
      : Math.round(env.ESCALATION_INTERVAL_MINUTES * 60 * 1000);

    const jobData = {
      logId,
      patientId: log.patientId.toString(),
      medId: log.medId.toString(),
      targetLevel,
      scheduledTime: log.scheduledTime
    };

    if (isRedisEnabled()) {
      const q = this.getQueue();
      if (q) {
        // Remove existing job with same ID if any before re-adding
        try {
          const existing = await q.getJob(jobId);
          if (existing) {
            await existing.remove();
          }
        } catch (_) {}

        await q.add(`escalation-level-${targetLevel}`, jobData, {
          jobId,
          delay,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000
          },
          removeOnComplete: true,
          removeOnFail: false
        });

        console.log(`⏱️ [BullMQ] Scheduled Level ${targetLevel} alert for log ${logId} in ${(delay / 1000).toFixed(1)}s (Job: ${jobId})`);
        return { mode: 'bullmq', jobId, delay };
      }
    }

    // In-Memory Fallback if Redis is not operational
    console.log(`⏱️ [Fallback Queue] Scheduling in-memory timer for log ${logId} (Level ${targetLevel}) in ${(delay / 1000).toFixed(1)}s`);
    
    // Clear any previous fallback timer for this job
    if (this.fallbackTimers.has(jobId)) {
      clearTimeout(this.fallbackTimers.get(jobId));
    }

    const timer = setTimeout(async () => {
      this.fallbackTimers.delete(jobId);
      try {
        const adherenceService = require('../../api/adherence/adherence.service');
        const AdherenceLog = require('../../api/adherence/adherence.model');
        const currentLog = await AdherenceLog.findById(logId);
        if (currentLog && currentLog.status === 'Escalated' && currentLog.escalationLevel < targetLevel) {
          console.log(`⚡ [Fallback Queue] Executing delayed escalation for log ${logId} -> Level ${targetLevel}`);
          await adherenceService.escalateLog(currentLog);
        }
      } catch (err) {
        console.error(`🔴 [Fallback Queue] Timer execution failed:`, err.message);
      }
    }, delay);

    this.fallbackTimers.set(jobId, timer);
    return { mode: 'memory-fallback', jobId, delay };
  }

  /**
   * Cancel and remove all pending escalation jobs for a given AdherenceLog
   * Called when medication is marked as Taken ("Nourish My Garden")
   * @param {string} logId
   */
  async cancelPendingEscalations(logId) {
    const idStr = logId.toString();
    console.log(`🛑 [Queue] Cancelling pending escalation alerts for AdherenceLog: ${idStr}`);

    // 1. Cancel in BullMQ Redis
    if (isRedisEnabled()) {
      const q = this.getQueue();
      if (q) {
        // Check levels 2, 3, 4
        const targetLevels = [2, 3, 4];
        for (const lvl of targetLevels) {
          const jobId = `esc:${idStr}:lvl:${lvl}`;
          try {
            const job = await q.getJob(jobId);
            if (job) {
              await job.remove();
              console.log(`   🟢 [BullMQ] Cancelled & purged job: ${jobId}`);
            }
          } catch (err) {
            console.warn(`   ⚠️ [BullMQ] Error purging job ${jobId}:`, err.message);
          }
        }
      }
    }

    // 2. Cancel in Memory Fallback
    for (const [jobId, timer] of this.fallbackTimers.entries()) {
      if (jobId.startsWith(`esc:${idStr}:`) || jobId.startsWith(`sms:fallback:${idStr}:`)) {
        clearTimeout(timer);
        this.fallbackTimers.delete(jobId);
        console.log(`   🟢 [Fallback Queue] Cleared in-memory timer: ${jobId}`);
      }
    }

    return true;
  }

  /**
   * Schedule a delayed SMS fallback job for an unviewed caregiver alert
   * @param {Object} alert - CaregiverAlert document
   * @param {number|null} delayMs - Optional override delay in milliseconds
   */
  async scheduleSmsFallback(alert, delayMs = null) {
    const alertId = alert._id.toString();
    const logId = alert.logId.toString();
    const jobId = `sms:fallback:${logId}:${alertId}`;

    const delay = delayMs !== null
      ? delayMs
      : Math.round(env.SMS_FALLBACK_MINUTES * 60 * 1000);

    const jobData = {
      type: 'sms_fallback',
      alertId,
      logId,
      caregiverId: alert.caregiverId.toString(),
      recipientPhone: alert.recipientPhone
    };

    if (isRedisEnabled()) {
      const q = this.getQueue();
      if (q) {
        try {
          const existing = await q.getJob(jobId);
          if (existing) {
            await existing.remove();
          }
        } catch (_) {}

        await q.add('sms-fallback', jobData, {
          jobId,
          delay,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000
          },
          removeOnComplete: true,
          removeOnFail: false
        });

        console.log(`⏱️ [BullMQ] Scheduled SMS Fallback for Alert ${alertId} in ${(delay / 1000).toFixed(1)}s (Job: ${jobId})`);
        return { mode: 'bullmq', jobId, delay };
      }
    }

    // In-Memory Fallback if Redis is not active
    console.log(`⏱️ [Fallback Queue] Scheduling in-memory SMS Fallback timer for Alert ${alertId} in ${(delay / 1000).toFixed(1)}s`);
    if (this.fallbackTimers.has(jobId)) {
      clearTimeout(this.fallbackTimers.get(jobId));
    }

    const timer = setTimeout(async () => {
      this.fallbackTimers.delete(jobId);
      try {
        const adherenceService = require('../../api/adherence/adherence.service');
        console.log(`⚡ [Fallback Queue] Executing delayed SMS Fallback for Alert ${alertId}`);
        await adherenceService.processSmsFallback(alertId);
      } catch (err) {
        console.error(`🔴 [Fallback Queue] SMS Fallback timer execution failed:`, err.message);
      }
    }, delay);

    this.fallbackTimers.set(jobId, timer);
    return { mode: 'memory-fallback', jobId, delay };
  }

  /**
   * Cancel a pending SMS fallback job when the caregiver views or acknowledges the notification
   * @param {string} alertId
   */
  async cancelSmsFallback(alertId) {
    const idStr = alertId.toString();
    console.log(`🛑 [Queue] Cancelling pending SMS Fallback for CaregiverAlert: ${idStr}`);

    if (isRedisEnabled()) {
      const q = this.getQueue();
      if (q) {
        try {
          // Find any job containing alertId in jobId
          const delayedJobs = await q.getDelayed();
          for (const job of delayedJobs) {
            if (job.data?.alertId === idStr || job.id.includes(idStr)) {
              await job.remove();
              console.log(`   🟢 [BullMQ] Cancelled SMS Fallback job: ${job.id}`);
            }
          }
        } catch (err) {
          console.warn(`   ⚠️ [BullMQ] Error cancelling SMS Fallback for alert ${idStr}:`, err.message);
        }
      }
    }

    // Clear matching in-memory fallback timers
    for (const [jobId, timer] of this.fallbackTimers.entries()) {
      if (jobId.includes(idStr)) {
        clearTimeout(timer);
        this.fallbackTimers.delete(jobId);
        console.log(`   🟢 [Fallback Queue] Cleared in-memory SMS timer: ${jobId}`);
      }
    }

    return true;
  }

  /**
   * Get queue health / status
   */
  async getQueueStatus() {
    const redisActive = isRedisEnabled();
    if (!redisActive) {
      return {
        mode: 'in-memory-fallback',
        redisConnected: false,
        activeFallbackTimers: this.fallbackTimers.size
      };
    }

    const q = this.getQueue();
    if (!q) {
      return {
        mode: 'initializing',
        redisConnected: true
      };
    }

    try {
      const [waiting, active, delayed, failed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getDelayedCount(),
        q.getFailedCount()
      ]);

      return {
        mode: 'bullmq-redis',
        redisConnected: true,
        queueName: this.queueName,
        metrics: { waiting, active, delayed, failed }
      };
    } catch (err) {
      return {
        mode: 'error',
        redisConnected: true,
        error: err.message
      };
    }
  }

  /**
   * Gracefully close queue
   */
  async closeQueue() {
    // Clear all in-memory timers
    for (const [, timer] of this.fallbackTimers.entries()) {
      clearTimeout(timer);
    }
    this.fallbackTimers.clear();

    if (this.queue) {
      try {
        await this.queue.close();
        this.queue = null;
        console.log('📦 [BullMQ] Escalation queue closed cleanly.');
      } catch (err) {
        console.warn('⚠️ [BullMQ] Error closing queue:', err.message);
      }
    }
  }
}

module.exports = new EscalationQueueService();
