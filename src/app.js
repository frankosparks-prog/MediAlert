const express = require('express');
const cors = require('cors');
const { errorHandler, AppError } = require('./core/middleware/errorHandler');

// Route Imports
const authRoutes = require('./api/auth/auth.routes');
const medicationRoutes = require('./api/medications/medication.routes');
const adherenceRoutes = require('./api/adherence/adherence.routes');
const gamificationRoutes = require('./api/gamification/gamification.routes');
const communityRoutes = require('./api/community/community.routes');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());

// Base Route / Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'MediAlert Backend API is healthy.',
    timestamp: new Date()
  });
});

// Feature routes mapping to Vertical Slices
app.use('/api/auth', authRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/adherence', adherenceRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/community', communityRoutes);

// Catch-all route for unhandled paths
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find path ${req.originalUrl} on this server`, 404));
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
