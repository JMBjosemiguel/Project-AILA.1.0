const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middlewares/authenticate');

const router = express.Router();

router.get('/summary', authenticate, analyticsController.getSummary);

module.exports = router;
