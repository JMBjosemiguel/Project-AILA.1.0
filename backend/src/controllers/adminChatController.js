const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const chatModel = require('../models/chatModel');
const { logAdminAction } = require('../utils/adminAudit');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const listConversationUsers = asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const { rows, total } = await chatModel.listConversationUsersAdmin({ search, limit, offset });
  sendSuccess(res, { users: rows, pagination: buildPaginationMeta({ page, pageSize, total }) }, 200, 'Students with conversations retrieved.');
});

const listConversationsForUser = asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query);
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'newest';

  const { rows, total } = await chatModel.listConversationsForUserAdmin(Number(req.params.userId), { filter, limit, offset });
  sendSuccess(res, { conversations: rows, pagination: buildPaginationMeta({ page, pageSize, total }) }, 200, "Student's conversations retrieved.");
});

const getChatSession = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.conversationId);
  const conversation = await chatModel.getConversationAdmin(conversationId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found.');
  }

  const messages = await chatModel.getMessagesForConversation(conversationId);

  sendSuccess(res, {
    conversation,
    messages: messages.map((row) => ({
      id: row.id,
      sender: row.sender,
      type: row.message_type,
      text: row.message_type === 'text' ? row.message_text : null,
      data: row.message_type === 'text' ? null : JSON.parse(row.message_text),
      createdAt: row.created_at,
    })),
  }, 200, 'Conversation retrieved.');
});

const renameChatSession = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.conversationId);
  const affectedRows = await chatModel.renameConversationAdmin(conversationId, req.body.title);
  if (!affectedRows) {
    throw new ApiError(404, 'Conversation not found.');
  }
  await logAdminAction(req.auth.user.id, 'conversation.rename', 'chat_conversations', conversationId, { title: req.body.title });
  sendSuccess(res, null, 200, 'Conversation renamed.');
});

const archiveChatSession = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.conversationId);
  const affectedRows = await chatModel.setConversationArchivedAdmin(conversationId, true);
  if (!affectedRows) {
    throw new ApiError(404, 'Conversation not found.');
  }
  await logAdminAction(req.auth.user.id, 'conversation.archive', 'chat_conversations', conversationId);
  sendSuccess(res, null, 200, 'Conversation archived.');
});

const unarchiveChatSession = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.conversationId);
  const affectedRows = await chatModel.setConversationArchivedAdmin(conversationId, false);
  if (!affectedRows) {
    throw new ApiError(404, 'Conversation not found.');
  }
  await logAdminAction(req.auth.user.id, 'conversation.unarchive', 'chat_conversations', conversationId);
  sendSuccess(res, null, 200, 'Conversation unarchived.');
});

const deleteChatSession = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.conversationId);
  const affectedRows = await chatModel.deleteConversation(conversationId);

  if (!affectedRows) {
    throw new ApiError(404, 'Conversation not found.');
  }
  await logAdminAction(req.auth.user.id, 'conversation.delete', 'chat_conversations', conversationId);
  sendSuccess(res, null, 200, 'Conversation deleted.');
});

module.exports = {
  listConversationUsers,
  listConversationsForUser,
  getChatSession,
  renameChatSession,
  archiveChatSession,
  unarchiveChatSession,
  deleteChatSession,
};
