const app = require('./app');
const env = require('./core/config/env');
const connectDB = require('./core/config/db');
const scheduleService = require('./core/services/scheduleService');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Boot Database
connectDB();

// Boot Schedule Engine (Cron sweeps)
scheduleService.start();

// Launch Server
const server = app.listen(env.PORT, () => {
  console.log(`🚀 MediAlert Backend API running on port ${env.PORT} in ${env.NODE_ENV} mode.`);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
