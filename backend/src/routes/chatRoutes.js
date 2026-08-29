const express = require('express');
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter } = require('../middlewares/aiRateLimiter');
const {
  sendMessageValidator,
  conversationIdParamValidator,
  renameConversationValidator,
} = require('../validators/chatValidator');

const router = express.Router();

router.post('/', authenticate, aiRateLimiter, sendMessageValidator, validateRequest, chatController.createChatResponse);
router.post('/:conversationId/regenerate', authenticate, aiRateLimiter, conversationIdParamValidator, validateRequest, chatController.regenerateResponse);
router.get('/history', authenticate, chatController.listConversations);
router.get('/suggested-questions', authenticate, chatController.listSuggestedQuestions);
router.get('/:conversationId', authenticate, conversationIdParamValidator, validateRequest, chatController.getConversation);
router.patch('/:conversationId', authenticate, conversationIdParamValidator, renameConversationValidator, validateRequest, chatController.renameConversation);
router.delete('/:conversationId', authenticate, conversationIdParamValidator, validateRequest, chatController.deleteConversation);

module.exports = router;
