const express = require('express');
const authController = require('./auth.controller');
const { protect } = require('../../core/middleware/authMiddleware');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.use(protect);
router.get('/profile', authController.getProfile);
router.post('/associate', authController.associate);

module.exports = router;
