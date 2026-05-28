const express = require('express');
const adherenceController = require('./adherence.controller');
const { protect } = require('../../core/middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/confirm/:logId', adherenceController.confirm);
router.get('/', adherenceController.getLogs);

// Test/Development endpoints
router.post('/trigger', adherenceController.triggerSchedule);
router.post('/sweep', adherenceController.sweepEscalations);

module.exports = router;
