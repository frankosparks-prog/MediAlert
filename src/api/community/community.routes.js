const express = require('express');
const communityController = require('./community.controller');
const { protect } = require('../../core/middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', communityController.create);
router.get('/', communityController.list);

module.exports = router;
