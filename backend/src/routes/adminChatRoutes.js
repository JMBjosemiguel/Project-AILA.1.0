const express = require('express');
const { param } = require('express-validator');
const adminChatController = require('../controllers/adminChatController');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { conversationIdParamValidator, renameConversationValidator } = require('../validators/chatValidator');
const { validateRequest } = require('../middlewares/validateRequest');

const userIdParamValidator = [param('userId').isInt({ min: 1 }).withMessage('Invalid user id.')];

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/users', adminChatController.listConversationUsers);
router.get('/users/:userId', userIdParamValidator, validateRequest, adminChatController.listConversationsForUser);
router.get('/:conversationId', conversationIdParamValidator, validateRequest, adminChatController.getChatSession);
router.patch('/:conversationId', conversationIdParamValidator, renameConversationValidator, validateRequest, adminChatController.renameChatSession);
router.post('/:conversationId/archive', conversationIdParamValidator, validateRequest, adminChatController.archiveChatSession);
router.post('/:conversationId/unarchive', conversationIdParamValidator, validateRequest, adminChatController.unarchiveChatSession);
router.delete('/:conversationId', conversationIdParamValidator, validateRequest, adminChatController.deleteChatSession);

module.exports = router;
