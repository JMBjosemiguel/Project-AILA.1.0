const express = require('express');
const aiStudyToolsController = require('../controllers/aiStudyToolsController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter } = require('../middlewares/aiRateLimiter');
const { generateValidator, objectivesPreviewValidator } = require('../validators/aiStudyToolsValidator');

const router = express.Router();

router.post('/', authenticate, aiRateLimiter, generateValidator, validateRequest, aiStudyToolsController.generate);
router.get('/objectives', authenticate, aiRateLimiter, objectivesPreviewValidator, validateRequest, aiStudyToolsController.objectivesPreview);

module.exports = router;
