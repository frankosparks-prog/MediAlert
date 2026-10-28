const app = require('./app');
const env = require('./core/config/env');
const connectDB = require('./core/config/db');
const scheduleService = require('./core/services/scheduleService');
const { startEscalationWorker, closeEscalationWorker } = require('./core/queues/escalationWorker');
const escalationQueueService = require('./core/queues/escalationQueueService');
const { closeRedis } = require('./core/config/redis');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Boot Database
connectDB();

// Boot BullMQ Worker (listening to Redis queue if enabled)
startEscalationWorker();

// Boot Schedule Engine (backup cron sweep for logs past timeout)
scheduleService.start();

// Launch Server
const server = app.listen(env.PORT, () => {
  console.log(`🚀 MediAlert Backend API running on port ${env.PORT} in ${env.NODE_ENV} mode.`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 [Shutdown] Received ${signal}. Closing services gracefully...`);
  server.close(async () => {
    console.log('   HTTP server closed.');
    await closeEscalationWorker();
    await escalationQueueService.closeQueue();
    await closeRedis();
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
