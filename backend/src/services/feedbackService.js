const ApiError = require('../utils/ApiError');
const feedbackModel = require('../models/feedbackModel');
const { logAdminAction } = require('../utils/adminAudit');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const CONTEXTS = ['ai_assistant', 'learning_hub', 'resources', 'planner', 'quiz'];

const RATING_COLORS = {
  1: '#EF4444',
  2: '#F97316',
  3: '#F59E0B',
  4: '#84CC16',
  5: '#10B981',
};

async function submitFeedback(userId, payload) {
  const id = await feedbackModel.createFeedback(userId, payload);
  return { id, ...payload };
}

async function getSummary() {
  const [aggregate, distributionRows] = await Promise.all([
    feedbackModel.getAggregate(),
    feedbackModel.getRatingDistribution(),
  ]);

  const total = aggregate.total || 0;
  const countByRating = new Map(distributionRows.map((row) => [row.rating, row.count]));

  const distribution = [1, 2, 3, 4, 5].map((rating) => {
    const count = countByRating.get(rating) || 0;
    return {
      label: String(rating),
      pct: total ? Math.round((count / total) * 100) : 0,
      color: RATING_COLORS[rating],
    };
  });

  return {
    averageRating: aggregate.average_rating,
    totalResponses: total,
    distribution,
    contexts: CONTEXTS,
  };
}

async function listMine(userId) {
  return feedbackModel.listForUser(userId);
}

async function deleteFeedback(userId, feedbackId) {
  const affectedRows = await feedbackModel.deleteForUser(Number(feedbackId), userId);
  if (!affectedRows) {
    throw new ApiError(404, 'Feedback entry not found.');
  }
}

async function listAdmin(params) {
  const { page, pageSize, limit, offset } = parsePagination(params);
  const { rows, total } = await feedbackModel.listAdmin({ ...params, limit, offset });
  return { feedback: rows, pagination: buildPaginationMeta({ page, pageSize, total }) };
}

async function replyAndResolve(adminId, feedbackId, { adminNotes, status }) {
  const affectedRows = await feedbackModel.updateAdmin(Number(feedbackId), { adminNotes, status });
  if (!affectedRows) {
    throw new ApiError(404, 'Feedback entry not found.');
  }
  await logAdminAction(adminId, 'feedback.update', 'feedback', Number(feedbackId), { adminNotes, status });
}

async function setArchived(adminId, feedbackId, isArchived) {
  const affectedRows = await feedbackModel.setArchivedAdmin(Number(feedbackId), isArchived);
  if (!affectedRows) {
    throw new ApiError(404, 'Feedback entry not found.');
  }
  await logAdminAction(adminId, isArchived ? 'feedback.archive' : 'feedback.unarchive', 'feedback', Number(feedbackId));
}

async function deleteAdmin(adminId, feedbackId) {
  const affectedRows = await feedbackModel.softDeleteAdmin(Number(feedbackId));
  if (!affectedRows) {
    throw new ApiError(404, 'Feedback entry not found.');
  }
  await logAdminAction(adminId, 'feedback.delete', 'feedback', Number(feedbackId));
}

async function restoreAdmin(adminId, feedbackId) {
  const affectedRows = await feedbackModel.restoreAdmin(Number(feedbackId));
  if (!affectedRows) {
    throw new ApiError(404, 'Feedback entry not found.');
  }
  await logAdminAction(adminId, 'feedback.restore', 'feedback', Number(feedbackId));
}

async function getAnalytics() {
  const [contextBreakdown, trend, summary] = await Promise.all([
    feedbackModel.getContextBreakdown(),
    feedbackModel.getTrendOverTime(30),
    getSummary(),
  ]);
  return { contextBreakdown, trend, summary };
}

module.exports = {
  submitFeedback,
  getSummary,
  listMine,
  deleteFeedback,
  listAdmin,
  replyAndResolve,
  setArchived,
  deleteAdmin,
  restoreAdmin,
  getAnalytics,
};
