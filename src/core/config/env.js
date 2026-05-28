const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const config = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medialert',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_secret_key_change_me_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  ESCALATION_INTERVAL_MINUTES: parseFloat(process.env.ESCALATION_INTERVAL_MINUTES || '15'),
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// Simple configuration validation
if (!process.env.JWT_SECRET && config.NODE_ENV === 'production') {
  console.warn('WARNING: JWT_SECRET is not set in production. Using fallback secret.');
}

module.exports = config;
