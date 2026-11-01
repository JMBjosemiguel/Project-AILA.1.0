const { body, param } = require('express-validator');

// Longest chat message accepted (the chat box limits the input to match).
const MAX_CHAT_MESSAGE_LENGTH = 4000;

const sendMessageValidator = [
  body('message').trim().notEmpty().withMessage('Please enter a message for AILA.')
    .isLength({ max: MAX_CHAT_MESSAGE_LENGTH }).withMessage(`Messages can be up to ${MAX_CHAT_MESSAGE_LENGTH.toLocaleString('en-US')} characters. Please shorten yours.`),
  body('conversation_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Invalid conversation id.'),
  // .toInt() matters here specifically: aiService.generateChatResponse branches on
  // `typeof resourceId === 'number'` to tell "attach/switch" apart from "no change"
  // (key omitted) and "detach" (explicit null) — a numeric STRING would silently
  // fall through to "no change" without this, skipping the ownership check too.
  body('resource_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Invalid resource id.').toInt(),
];

const conversationIdParamValidator = [
  param('conversationId').isInt({ min: 1 }).withMessage('Invalid conversation id.'),
];

const renameConversationValidator = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 120 }).withMessage('Title must be 120 characters or fewer.'),
];

module.exports = {
  MAX_CHAT_MESSAGE_LENGTH,
  sendMessageValidator,
  conversationIdParamValidator,
  renameConversationValidator,
};
