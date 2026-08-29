const express = require('express');
const feedbackController = require('../controllers/feedbackController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { submitFeedbackValidator, feedbackIdParamValidator } = require('../validators/feedbackValidator');

const router = express.Router();

router.get('/summary', authenticate, feedbackController.getSummary);
router.get('/mine', authenticate, feedbackController.listMine);
router.post('/', authenticate, submitFeedbackValidator, validateRequest, feedbackController.submitFeedback);
router.delete('/:feedbackId', authenticate, feedbackIdParamValidator, validateRequest, feedbackController.remove);

module.exports = router;
