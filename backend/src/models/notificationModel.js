const { query, transaction } = require('../config/database');

async function listForUser(userId) {
  return query(
    `
      SELECT n.id, n.type, n.title, n.body, n.created_at, nr.is_read, nr.read_at
      FROM notification_recipients nr
      INNER JOIN notifications n ON n.id = nr.notification_id
      WHERE nr.user_id = ?
      ORDER BY n.created_at DESC
    `,
    [userId]
  );
}

async function markRead(notificationId, userId) {
  const result = await query(
    'UPDATE notification_recipients SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE notification_id = ? AND user_id = ?',
    [notificationId, userId]
  );
  return result.affectedRows;
}

async function markAllRead(userId) {
  await query(
    'UPDATE notification_recipients SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
    [userId]
  );
}

async function deleteForUser(notificationId, userId) {
  return transaction(async (connection) => {
    const [result] = await connection.execute(
      'DELETE FROM notification_recipients WHERE notification_id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (result.affectedRows) {
      const [remaining] = await connection.execute(
        'SELECT id FROM notification_recipients WHERE notification_id = ? LIMIT 1',
        [notificationId]
      );
      if (!remaining.length) {
        await connection.execute('DELETE FROM notifications WHERE id = ?', [notificationId]);
      }
    }

    return result.affectedRows;
  });
}

async function deleteAllForUser(userId) {
  return transaction(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT DISTINCT notification_id FROM notification_recipients WHERE user_id = ?',
      [userId]
    );
    const notificationIds = rows.map((row) => row.notification_id);

    await connection.execute('DELETE FROM notification_recipients WHERE user_id = ?', [userId]);

    if (notificationIds.length) {
      const placeholders = notificationIds.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM notifications WHERE id IN (${placeholders}) AND id NOT IN (SELECT DISTINCT notification_id FROM notification_recipients)`,
        notificationIds
      );
    }

    return notificationIds.length;
  });
}

const ANNOUNCEMENT_SORT_MAP = {
  newest: 'n.created_at DESC',
  oldest: 'n.created_at ASC',
};

async function listAnnouncementsAdmin({ search = '', archived = 'all', sort = 'newest', limit = 20, offset = 0 }) {
  const orderBy = ANNOUNCEMENT_SORT_MAP[sort] || ANNOUNCEMENT_SORT_MAP.newest;
  const searchTerm = `%${search}%`;

  const whereClause = `
    n.type = 'announcement'
      AND (? = '' OR n.title LIKE ? OR n.body LIKE ?)
      AND (? = 'all' OR (? = 'archived' AND n.is_archived = 1) OR (? = 'active' AND n.is_archived = 0))
  `;
  const whereParams = [search, searchTerm, searchTerm, archived, archived, archived];

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT n.id, n.title, n.body, n.target_type, n.target_value, n.is_archived, n.created_at,
          (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id) AS recipient_count,
          (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id AND nr.is_read = 1) AS read_count
        FROM notifications n
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...whereParams, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM notifications n WHERE ${whereClause}`, whereParams),
  ]);

  return { rows, total: countRows[0].total };
}

async function updateAnnouncementAdmin(id, { title, body }) {
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (body !== undefined) { fields.push('body = ?'); params.push(body); }
  if (!fields.length) return 0;

  params.push(id);
  const result = await query(`UPDATE notifications SET ${fields.join(', ')} WHERE id = ? AND type = 'announcement'`, params);
  return result.affectedRows;
}

async function setAnnouncementArchived(id, isArchived) {
  const result = await query("UPDATE notifications SET is_archived = ? WHERE id = ? AND type = 'announcement'", [isArchived ? 1 : 0, id]);
  return result.affectedRows;
}

async function deleteAnnouncementAdmin(id) {
  const result = await query("DELETE FROM notifications WHERE id = ? AND type = 'announcement'", [id]);
  return result.affectedRows;
}

module.exports = {
  listForUser,
  markRead,
  markAllRead,
  deleteForUser,
  deleteAllForUser,
  listAnnouncementsAdmin,
  updateAnnouncementAdmin,
  setAnnouncementArchived,
  deleteAnnouncementAdmin,
};
