const ApiError = require('../utils/ApiError');
const notificationModel = require('../models/notificationModel');
const { studentNotifications } = require('../utils/studentGamification');

async function listNotifications(userId) {
  // Level notifications only ever go to students; hidden unless gamification is shown.
  const notifications = studentNotifications(await notificationModel.listForUser(userId));
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  return { notifications, unreadCount };
}

async function markRead(userId, notificationId) {
  const affectedRows = await notificationModel.markRead(Number(notificationId), userId);
  if (!affectedRows) {
    throw new ApiError(404, 'Notification not found.');
  }
}

async function markAllRead(userId) {
  await notificationModel.markAllRead(userId);
}

async function deleteNotification(userId, notificationId) {
  const affectedRows = await notificationModel.deleteForUser(Number(notificationId), userId);
  if (!affectedRows) {
    throw new ApiError(404, 'Notification not found.');
  }
}

async function deleteAllNotifications(userId) {
  await notificationModel.deleteAllForUser(userId);
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  deleteAllNotifications,
};
