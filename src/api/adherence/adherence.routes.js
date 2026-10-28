const express = require('express');
const adherenceController = require('./adherence.controller');
const { protect } = require('../../core/middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/confirm/:logId', adherenceController.confirm);
router.get('/', adherenceController.getLogs);

// Caregiver Alerts & SMS Fallback Acknowledgment
router.get('/alerts', adherenceController.getCaregiverAlerts);
router.post('/alerts/:alertId/view', adherenceController.viewAlert);
router.post('/alerts/:alertId/acknowledge', adherenceController.acknowledgeAlert);

// Test/Development endpoints
router.post('/trigger', adherenceController.triggerSchedule);
router.post('/sweep', adherenceController.sweepEscalations);

module.exports = router;
