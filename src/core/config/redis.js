const Redis = require('ioredis');
const env = require('./env');

let redisClient = null;
let redisEnabled = false;
let connectionAttempted = false;

/**
 * Standard IORedis options required for BullMQ compatibility
 */
const redisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times > 3) {
      console.warn('⚠️ [Redis] Connection failed after 3 attempts. Entering In-Memory / Cron Fallback mode.');
      return null; // Stop retrying, allow graceful fallback
    }
    const delay = Math.min(times * 1000, 3000);
    return delay;
  }
};

/**
 * Initialize or get Redis client
 */
function initRedis() {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = new Redis(env.REDIS_URL, redisOptions);

    redisClient.on('connect', () => {
      console.log(`🔌 [Redis] Connecting to ${env.REDIS_URL}...`);
    });

    redisClient.on('ready', () => {
      redisEnabled = true;
      connectionAttempted = true;
      console.log(`🟢 [Redis] Connection established and ready. BullMQ active.`);
    });

    redisClient.on('error', (err) => {
      connectionAttempted = true;
      // Do not crash, log warning and set fallback
      if (redisEnabled) {
        console.error('🔴 [Redis] Error encountered:', err.message);
      }
      redisEnabled = false;
    });

    redisClient.on('close', () => {
      if (redisEnabled) {
        console.warn('🟡 [Redis] Connection closed.');
      }
      redisEnabled = false;
    });
  } catch (error) {
    console.warn(`⚠️ [Redis] Could not initialize client: ${error.message}. Running in Fallback mode.`);
    redisEnabled = false;
  }

  return redisClient;
}

/**
 * Get the singleton Redis instance
 */
function getRedisClient() {
  if (!redisClient) {
    initRedis();
  }
  return redisClient;
}

/**
 * Check if Redis is successfully connected and operational
 */
function isRedisEnabled() {
  return redisEnabled && redisClient && redisClient.status === 'ready';
}

/**
 * Return Redis connection config for BullMQ instances
 */
function getRedisConnectionOptions() {
  return {
    ...redisOptions,
    url: env.REDIS_URL
  };
}

/**
 * Gracefully close Redis client
 */
async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('🔌 [Redis] Connection cleanly terminated.');
    } catch (err) {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      redisEnabled = false;
    }
  }
}

// Pre-initialize client on module import
initRedis();

module.exports = {
  initRedis,
  getRedisClient,
  isRedisEnabled,
  getRedisConnectionOptions,
  closeRedis
};
