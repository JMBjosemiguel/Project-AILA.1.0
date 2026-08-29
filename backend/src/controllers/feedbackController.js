const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const feedbackService = require('../services/feedbackService');

const submitFeedback = asyncHandler(async (req, res) => {
  const { rating, context_type: contextType, context_id: contextId, comment } = req.body;
  const result = await feedbackService.submitFeedback(req.auth.user.id, { contextType, contextId, rating, comment });
  sendSuccess(res, result, 201, 'Feedback submitted.');
});

const getSummary = asyncHandler(async (req, res) => {
  const summary = await feedbackService.getSummary();
  sendSuccess(res, summary, 200, 'Feedback summary retrieved.');
});

const listMine = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.listMine(req.auth.user.id);
  sendSuccess(res, { feedback }, 200, 'Your feedback retrieved.');
});

const remove = asyncHandler(async (req, res) => {
  await feedbackService.deleteFeedback(req.auth.user.id, req.params.feedbackId);
  sendSuccess(res, null, 200, 'Feedback deleted.');
});

module.exports = {
  submitFeedback,
  getSummary,
  listMine,
  remove,
};
