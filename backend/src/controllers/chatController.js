const aiService = require('../services/aiService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');

const createChatResponse = asyncHandler(async (req, res) => {
  const result = await aiService.generateChatResponse({
    userId: req.auth.user.id,
    message: req.body.message,
    conversationId: req.body.conversation_id || null,
    resourceId: req.body.resource_id || null,
  });

  sendSuccess(res, result, 200, 'AILA response generated.');
});

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await aiService.listConversations(req.auth.user.id);

  sendSuccess(res, { conversations }, 200, 'Conversations retrieved.');
});

const listSuggestedQuestions = asyncHandler(async (req, res) => {
  const questions = await aiService.listSuggestedQuestions();

  sendSuccess(res, { questions }, 200, 'Suggested questions retrieved.');
});

const renameConversation = asyncHandler(async (req, res) => {
  await aiService.renameConversation(req.auth.user.id, req.params.conversationId, req.body.title);

  sendSuccess(res, null, 200, 'Conversation renamed.');
});

const deleteConversation = asyncHandler(async (req, res) => {
  await aiService.deleteConversation(req.auth.user.id, req.params.conversationId);

  sendSuccess(res, null, 200, 'Conversation deleted.');
});

const regenerateResponse = asyncHandler(async (req, res) => {
  const result = await aiService.regenerateLastResponse(req.auth.user.id, req.params.conversationId);

  sendSuccess(res, result, 200, 'Response regenerated.');
});

const getConversation = asyncHandler(async (req, res) => {
  const result = await aiService.getConversation(req.auth.user.id, req.params.conversationId);

  sendSuccess(res, result, 200, 'Conversation retrieved.');
});

module.exports = {
  createChatResponse,
  regenerateResponse,
  listConversations,
  listSuggestedQuestions,
  renameConversation,
  deleteConversation,
  getConversation,
};
