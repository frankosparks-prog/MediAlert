const express = require('express');
const gamificationController = require('./gamification.controller');
const { protect } = require('../../core/middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/profile', gamificationController.getProfile);

module.exports = router;
