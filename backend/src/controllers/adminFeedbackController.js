const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const feedbackService = require('../services/feedbackService');

const listFeedback = asyncHandler(async (req, res) => {
  const { search = '', status = 'all', rating = 'all', archived = 'all', sort = 'newest' } = req.query;
  const result = await feedbackService.listAdmin({ search, status, rating, archived, sort, page: req.query.page, pageSize: req.query.pageSize });
  sendSuccess(res, result, 200, 'Feedback retrieved.');
});

const updateFeedback = asyncHandler(async (req, res) => {
  const { admin_notes: adminNotes, status } = req.body;
  await feedbackService.replyAndResolve(req.auth.user.id, req.params.feedbackId, { adminNotes, status });
  sendSuccess(res, null, 200, 'Feedback updated.');
});

const archiveFeedback = asyncHandler(async (req, res) => {
  await feedbackService.setArchived(req.auth.user.id, req.params.feedbackId, true);
  sendSuccess(res, null, 200, 'Feedback archived.');
});

const unarchiveFeedback = asyncHandler(async (req, res) => {
  await feedbackService.setArchived(req.auth.user.id, req.params.feedbackId, false);
  sendSuccess(res, null, 200, 'Feedback unarchived.');
});

const deleteFeedback = asyncHandler(async (req, res) => {
  await feedbackService.deleteAdmin(req.auth.user.id, req.params.feedbackId);
  sendSuccess(res, null, 200, 'Feedback deleted.');
});

const restoreFeedback = asyncHandler(async (req, res) => {
  await feedbackService.restoreAdmin(req.auth.user.id, req.params.feedbackId);
  sendSuccess(res, null, 200, 'Feedback restored.');
});

const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await feedbackService.getAnalytics();
  sendSuccess(res, analytics, 200, 'Feedback analytics retrieved.');
});

module.exports = {
  listFeedback,
  updateFeedback,
  archiveFeedback,
  unarchiveFeedback,
  deleteFeedback,
  restoreFeedback,
  getAnalytics,
};
