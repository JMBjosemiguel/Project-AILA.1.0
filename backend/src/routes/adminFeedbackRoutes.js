const express = require('express');
const adminFeedbackController = require('../controllers/adminFeedbackController');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { validateRequest } = require('../middlewares/validateRequest');
const { feedbackIdParamValidator, updateFeedbackValidator } = require('../validators/feedbackValidator');
const { paginationQueryValidator } = require('../validators/adminValidator');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/', paginationQueryValidator, validateRequest, adminFeedbackController.listFeedback);
router.get('/analytics', adminFeedbackController.getAnalytics);
router.patch('/:feedbackId', feedbackIdParamValidator, updateFeedbackValidator, validateRequest, adminFeedbackController.updateFeedback);
router.post('/:feedbackId/archive', feedbackIdParamValidator, validateRequest, adminFeedbackController.archiveFeedback);
router.post('/:feedbackId/unarchive', feedbackIdParamValidator, validateRequest, adminFeedbackController.unarchiveFeedback);
router.post('/:feedbackId/restore', feedbackIdParamValidator, validateRequest, adminFeedbackController.restoreFeedback);
router.delete('/:feedbackId', feedbackIdParamValidator, validateRequest, adminFeedbackController.deleteFeedback);

module.exports = router;
