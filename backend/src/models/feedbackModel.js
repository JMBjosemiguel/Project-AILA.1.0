const { query } = require('../config/database');

async function createFeedback(userId, { contextType, contextId, rating, comment }) {
  const result = await query(
    'INSERT INTO feedback (user_id, context_type, context_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
    [userId, contextType || null, contextId || null, rating, comment || null]
  );
  return result.insertId;
}

async function getAggregate() {
  const rows = await query('SELECT ROUND(AVG(rating), 1) AS average_rating, COUNT(*) AS total FROM feedback WHERE rating IS NOT NULL AND deleted_at IS NULL');
  return rows[0] || { average_rating: null, total: 0 };
}

async function getRatingDistribution() {
  return query('SELECT rating, COUNT(*) AS count FROM feedback WHERE rating IS NOT NULL AND deleted_at IS NULL GROUP BY rating');
}

async function listForUser(userId) {
  return query(
    'SELECT id, context_type, context_id, rating, comment, created_at FROM feedback WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
}

async function deleteForUser(feedbackId, userId) {
  const result = await query('DELETE FROM feedback WHERE id = ? AND user_id = ?', [feedbackId, userId]);
  return result.affectedRows;
}

const FEEDBACK_SORT_MAP = {
  newest: 'f.created_at DESC',
  oldest: 'f.created_at ASC',
  rating_high: 'f.rating DESC',
  rating_low: 'f.rating ASC',
};

async function listAdmin({ search = '', status = 'all', rating = 'all', archived = 'all', sort = 'newest', limit = 20, offset = 0 }) {
  const orderBy = FEEDBACK_SORT_MAP[sort] || FEEDBACK_SORT_MAP.newest;
  const searchTerm = `%${search}%`;
  const deletedClause = archived === 'deleted' ? 'f.deleted_at IS NOT NULL' : 'f.deleted_at IS NULL';

  const whereClause = `
    ${deletedClause}
      AND (? = '' OR f.comment LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)
      AND (? = 'all' OR f.status = ?)
      AND (? = 'all' OR f.rating = ?)
      AND (? = 'all' OR ? = 'deleted' OR (? = 'archived' AND f.is_archived = 1) OR (? = 'active' AND f.is_archived = 0))
  `;
  const ratingParam = rating === 'all' ? 'all' : Number(rating);
  const whereParams = [search, searchTerm, searchTerm, searchTerm, status, status, rating, ratingParam, archived, archived, archived, archived];

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT f.id, f.rating, f.comment, f.context_type, f.status, f.admin_notes, f.is_archived, f.deleted_at, f.created_at,
          u.id AS user_id, u.first_name, u.last_name
        FROM feedback f
        INNER JOIN users u ON u.id = f.user_id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...whereParams, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM feedback f INNER JOIN users u ON u.id = f.user_id WHERE ${whereClause}`, whereParams),
  ]);

  return { rows, total: countRows[0].total };
}

async function updateAdmin(feedbackId, { adminNotes, status }) {
  const fields = [];
  const params = [];
  if (adminNotes !== undefined) { fields.push('admin_notes = ?'); params.push(adminNotes); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (!fields.length) return 0;

  params.push(feedbackId);
  const result = await query(`UPDATE feedback SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
  return result.affectedRows;
}

async function setArchivedAdmin(feedbackId, isArchived) {
  const result = await query('UPDATE feedback SET is_archived = ? WHERE id = ? AND deleted_at IS NULL', [isArchived ? 1 : 0, feedbackId]);
  return result.affectedRows;
}

async function softDeleteAdmin(feedbackId) {
  const result = await query('UPDATE feedback SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL', [feedbackId]);
  return result.affectedRows;
}

async function restoreAdmin(feedbackId) {
  const result = await query('UPDATE feedback SET deleted_at = NULL WHERE id = ?', [feedbackId]);
  return result.affectedRows;
}

async function getContextBreakdown() {
  return query(
    'SELECT COALESCE(context_type, \'general\') AS context_type, COUNT(*) AS count FROM feedback WHERE deleted_at IS NULL GROUP BY context_type'
  );
}

async function getTrendOverTime(days = 30) {
  return query(
    `
      SELECT DATE(created_at) AS date, COUNT(*) AS count, ROUND(AVG(rating), 1) AS avg_rating
      FROM feedback
      WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    [days]
  );
}

module.exports = {
  createFeedback,
  getAggregate,
  getRatingDistribution,
  listForUser,
  deleteForUser,
  listAdmin,
  updateAdmin,
  setArchivedAdmin,
  softDeleteAdmin,
  restoreAdmin,
  getContextBreakdown,
  getTrendOverTime,
};
