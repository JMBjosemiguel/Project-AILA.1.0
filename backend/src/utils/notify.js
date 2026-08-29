const { query } = require('../config/database');

async function notifyUsers({ type, title, body, userIds, createdBy = null, connection = null, targetType = 'all', targetValue = null }) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (!ids.length) return null;

  const notificationSql = 'INSERT INTO notifications (created_by, type, title, body, target_type, target_value) VALUES (?, ?, ?, ?, ?, ?)';
  const notificationParams = [createdBy, type, title, body, targetType, targetValue];

  const notificationId = connection
    ? (await connection.execute(notificationSql, notificationParams))[0].insertId
    : (await query(notificationSql, notificationParams)).insertId;

  const placeholders = ids.map(() => '(?, ?)').join(', ');
  const recipientParams = ids.flatMap((userId) => [notificationId, userId]);
  const recipientSql = `INSERT INTO notification_recipients (notification_id, user_id) VALUES ${placeholders}`;

  if (connection) {
    await connection.execute(recipientSql, recipientParams);
  } else {
    await query(recipientSql, recipientParams);
  }

  return notificationId;
}

async function notifyUser(userId, options) {
  return notifyUsers({ ...options, userIds: [userId] });
}

module.exports = {
  notifyUsers,
  notifyUser,
};
