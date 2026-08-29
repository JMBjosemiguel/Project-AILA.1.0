const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { notificationIdParamValidator } = require('../validators/notificationValidator');

const router = express.Router();

router.get('/', authenticate, notificationController.list);
router.post('/mark-all-read', authenticate, notificationController.markAllRead);
router.patch('/:notificationId/read', authenticate, notificationIdParamValidator, validateRequest, notificationController.markRead);
router.delete('/', authenticate, notificationController.removeAll);
router.delete('/:notificationId', authenticate, notificationIdParamValidator, validateRequest, notificationController.remove);

module.exports = router;
