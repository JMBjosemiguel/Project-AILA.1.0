const express = require('express');
const gamificationController = require('../controllers/gamificationController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { leaderboardValidator } = require('../validators/gamificationValidator');

const router = express.Router();

router.get('/summary', authenticate, gamificationController.getSummary);
router.get('/achievements', authenticate, gamificationController.getAchievements);
router.get('/leaderboard', authenticate, leaderboardValidator, validateRequest, gamificationController.getLeaderboard);

module.exports = router;
