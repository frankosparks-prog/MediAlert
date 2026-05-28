const express = require('express');
const medicationController = require('./medication.controller');
const { protect } = require('../../core/middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post('/', medicationController.create);
router.get('/', medicationController.list);

module.exports = router;
