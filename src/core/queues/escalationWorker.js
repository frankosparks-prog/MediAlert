const { Worker } = require('bullmq');
const env = require('../config/env');
const { getRedisClient, isRedisEnabled } = require('../config/redis');

let worker = null;

/**
 * Job processing function
 * @param {Object} job - BullMQ Job
 */
async function processEscalationJob(job) {
  // Handle SMS Fallback Jobs
  if (job.name === 'sms-fallback' || job.data?.type === 'sms_fallback') {
    const { alertId } = job.data;
    console.log(`\n⚡ [BullMQ Worker] Processing SMS Fallback Job "${job.name}" (ID: ${job.id}) | Alert: ${alertId}`);
    const adherenceService = require('../../api/adherence/adherence.service');
    const result = await adherenceService.processSmsFallback(alertId);
    return { status: 'processed', ...result };
  }

  const { logId, targetLevel } = job.data;
  console.log(`\n⚡ [BullMQ Worker] Processing Job "${job.name}" (ID: ${job.id}) | Log: ${logId} -> Level ${targetLevel}`);

  // Import services dynamically to prevent circular dependencies
  const AdherenceLog = require('../../api/adherence/adherence.model');
  const adherenceService = require('../../api/adherence/adherence.service');

  const log = await AdherenceLog.findById(logId);
  if (!log) {
    console.warn(`   ⚠️ [Worker] AdherenceLog ${logId} not found in database. Skipping job.`);
    return { status: 'skipped', reason: 'log_not_found' };
  }

  // Idempotency / Cancellation Check:
  // If the user marked the dose as Taken or it was already resolved, skip!
  if (log.status !== 'Escalated') {
    console.log(`   🟢 [Worker] AdherenceLog ${logId} is already "${log.status}". No alert needed.`);
    return { status: 'skipped', reason: 'already_resolved', logStatus: log.status };
  }

  // Check if log is already at or past this level
  if (log.escalationLevel >= targetLevel) {
    console.log(`   ℹ️ [Worker] AdherenceLog ${logId} is already at Level ${log.escalationLevel}. Target was ${targetLevel}. Skipping.`);
    return { status: 'skipped', reason: 'already_at_level' };
  }

  // Execute escalation via adherence service
  const updatedLog = await adherenceService.escalateLog(log);
  console.log(`   ✅ [Worker] AdherenceLog ${logId} successfully escalated to Level ${updatedLog.escalationLevel} (Status: ${updatedLog.status})`);

  return {
    status: 'success',
    logId,
    level: updatedLog.escalationLevel,
    logStatus: updatedLog.status
  };
}

/**
 * Initialize and start the BullMQ worker
 * @param {number} concurrency - Number of concurrent jobs (default: 5)
 */
function startEscalationWorker(concurrency = 5) {
  if (worker) {
    return worker;
  }

  if (!isRedisEnabled()) {
    console.warn('⚠️ [BullMQ Worker] Redis is not ready. Worker not started (running in fallback mode).');
    return null;
  }

  try {
    const connection = getRedisClient();
    worker = new Worker(env.ESCALATION_QUEUE_NAME, processEscalationJob, {
      connection,
      concurrency,
      prefix: '{medialert}',
      lockDuration: 30000 // 30s lock duration
    });

    worker.on('ready', () => {
      console.log(`👷 [BullMQ Worker] Listening on queue "${env.ESCALATION_QUEUE_NAME}" (Concurrency: ${concurrency})`);
    });

    worker.on('completed', (job, result) => {
      console.log(`🏁 [BullMQ Worker] Job ${job.id} completed. Result: ${JSON.stringify(result)}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`🔴 [BullMQ Worker] Job ${job?.id} failed with error: ${err.message}`);
    });

    worker.on('error', (err) => {
      console.error(`🔴 [BullMQ Worker] Worker error:`, err.message);
    });

    worker.on('stalled', (jobId) => {
      console.warn(`⚠️ [BullMQ Worker] Job ${jobId} stalled and will be reprocessed.`);
    });

    return worker;
  } catch (error) {
    console.error(`🔴 [BullMQ Worker] Failed to start worker:`, error.message);
    return null;
  }
}

/**
 * Gracefully close worker
 */
async function closeEscalationWorker() {
  if (worker) {
    try {
      await worker.close();
      console.log('👷 [BullMQ Worker] Worker closed cleanly.');
      worker = null;
    } catch (err) {
      console.warn('⚠️ [BullMQ Worker] Error closing worker:', err.message);
    }
  }
}

// Standalone execution support: node src/core/queues/escalationWorker.js
if (require.main === module) {
  const connectDB = require('../config/db');
  console.log('🚀 Starting Standalone MediAlert Escalation Worker Process...');
  connectDB().then(() => {
    startEscalationWorker();
  });

  // Handle termination signals
  const shutdown = async () => {
    console.log('\n🛑 Shutting down standalone worker...');
    await closeEscalationWorker();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  startEscalationWorker,
  closeEscalationWorker,
  processEscalationJob
};
