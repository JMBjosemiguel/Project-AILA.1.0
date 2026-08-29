const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const notificationService = require('../services/notificationService');

const list = asyncHandler(async (req, res) => {
  const result = await notificationService.listNotifications(req.auth.user.id);
  sendSuccess(res, result, 200, 'Notifications retrieved.');
});

const markRead = asyncHandler(async (req, res) => {
  await notificationService.markRead(req.auth.user.id, req.params.notificationId);
  sendSuccess(res, null, 200, 'Notification marked read.');
});

const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.auth.user.id);
  sendSuccess(res, { updated: true }, 200, 'All notifications marked read.');
});

const remove = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(req.auth.user.id, req.params.notificationId);
  sendSuccess(res, null, 200, 'Notification deleted.');
});

const removeAll = asyncHandler(async (req, res) => {
  await notificationService.deleteAllNotifications(req.auth.user.id);
  sendSuccess(res, null, 200, 'All notifications cleared.');
});

module.exports = {
  list,
  markRead,
  markAllRead,
  remove,
  removeAll,
};
