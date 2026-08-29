const { query } = require('../config/database');

async function createConversation(userId, connection = null, resourceId = null) {
  const sql = 'INSERT INTO chat_conversations (user_id, resource_id) VALUES (?, ?)';

  if (connection) {
    const [result] = await connection.execute(sql, [userId, resourceId]);
    return result.insertId;
  }

  const result = await query(sql, [userId, resourceId]);
  return result.insertId;
}

async function appendMessages(conversationId, userText, botText, botMessageType, connection = null) {
  const sql = `
    INSERT INTO chat_messages (conversation_id, sender, message_type, message_text)
    VALUES (?, 'user', 'text', ?), (?, 'bot', ?, ?)
  `;
  const params = [conversationId, userText, conversationId, botMessageType, botText];

  if (connection) {
    await connection.execute(sql, params);
    return;
  }

  await query(sql, params);
}

async function updateMessage(messageId, messageText, messageType) {
  await query(
    'UPDATE chat_messages SET message_text = ?, message_type = ? WHERE id = ?',
    [messageText, messageType, messageId]
  );
}

async function setConversationTitleIfMissing(conversationId, title, connection = null) {
  const sql = 'UPDATE chat_conversations SET title = ? WHERE id = ? AND title IS NULL';
  const params = [title, conversationId];

  if (connection) {
    await connection.execute(sql, params);
    return;
  }

  await query(sql, params);
}

async function listConversationsForUser(userId) {
  return query(
    `
      SELECT
        c.id,
        c.title,
        c.started_at,
        (
          SELECT m.message_text
          FROM chat_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message
      FROM chat_conversations c
      WHERE c.user_id = ?
      ORDER BY c.started_at DESC
    `,
    [userId]
  );
}

async function renameConversation(conversationId, userId, title) {
  const result = await query(
    'UPDATE chat_conversations SET title = ? WHERE id = ? AND user_id = ?',
    [title, conversationId, userId]
  );

  return result.affectedRows;
}

async function deleteConversationForUser(conversationId, userId) {
  const result = await query(
    'DELETE FROM chat_conversations WHERE id = ? AND user_id = ?',
    [conversationId, userId]
  );

  return result.affectedRows;
}

async function getConversationForUser(conversationId, userId) {
  const rows = await query(
    'SELECT id, user_id, title, started_at, resource_id FROM chat_conversations WHERE id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId]
  );

  return rows[0] || null;
}

async function getMessagesForConversation(conversationId) {
  return query(
    `
      SELECT id, sender, message_type, message_text, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `,
    [conversationId]
  );
}

async function listSuggestedQuestions() {
  return query(
    'SELECT id, question_text FROM suggested_questions WHERE is_active = 1 ORDER BY display_order ASC, id ASC LIMIT 8'
  );
}

async function listConversationUsersAdmin({ search = '', limit = 20, offset = 0 } = {}) {
  const searchTerm = `%${search}%`;
  const whereClause = `u.deleted_at IS NULL AND (? = '' OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
  const whereParams = [search, searchTerm, searchTerm, searchTerm];

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT
          u.id, u.first_name, u.last_name, u.email,
          COUNT(c.id) AS conversation_count,
          MAX(c.started_at) AS last_activity_at
        FROM users u
        INNER JOIN chat_conversations c ON c.user_id = u.id AND c.deleted_at IS NULL
        WHERE ${whereClause}
        GROUP BY u.id, u.first_name, u.last_name, u.email
        ORDER BY last_activity_at DESC
        LIMIT ? OFFSET ?
      `,
      [...whereParams, limit, offset]
    ),
    query(
      `
        SELECT COUNT(DISTINCT u.id) AS total
        FROM users u
        INNER JOIN chat_conversations c ON c.user_id = u.id AND c.deleted_at IS NULL
        WHERE ${whereClause}
      `,
      whereParams
    ),
  ]);

  return { rows, total: countRows[0].total };
}

const CONVERSATION_SORT_MAP = {
  newest: 'c.started_at DESC',
  oldest: 'c.started_at ASC',
  most_active: 'message_count DESC',
};

async function listConversationsForUserAdmin(userId, { filter = 'newest', limit = 20, offset = 0 } = {}) {
  const archivedClause = filter === 'archived' ? 'c.is_archived = 1' : 'c.is_archived = 0';
  const orderBy = CONVERSATION_SORT_MAP[filter] || CONVERSATION_SORT_MAP.newest;

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT
          c.id, c.title, c.started_at, c.is_archived,
          (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count,
          (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.conversation_id = c.id) AS last_activity_at
        FROM chat_conversations c
        WHERE c.user_id = ? AND c.deleted_at IS NULL AND ${archivedClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [userId, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM chat_conversations c WHERE c.user_id = ? AND c.deleted_at IS NULL AND ${archivedClause}`, [userId]),
  ]);

  return { rows, total: countRows[0].total };
}

async function getConversationAdmin(conversationId) {
  const rows = await query(
    `
      SELECT c.id, c.title, c.started_at, c.is_archived, u.id AS user_id, u.first_name, u.last_name, u.email
      FROM chat_conversations c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.id = ? AND c.deleted_at IS NULL
      LIMIT 1
    `,
    [conversationId]
  );

  return rows[0] || null;
}

async function deleteConversation(conversationId) {
  const result = await query('UPDATE chat_conversations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL', [conversationId]);
  return result.affectedRows;
}

async function setConversationArchivedAdmin(conversationId, isArchived) {
  const result = await query('UPDATE chat_conversations SET is_archived = ? WHERE id = ? AND deleted_at IS NULL', [isArchived ? 1 : 0, conversationId]);
  return result.affectedRows;
}

async function renameConversationAdmin(conversationId, title) {
  const result = await query('UPDATE chat_conversations SET title = ? WHERE id = ? AND deleted_at IS NULL', [title, conversationId]);
  return result.affectedRows;
}

module.exports = {
  createConversation,
  appendMessages,
  updateMessage,
  setConversationTitleIfMissing,
  renameConversation,
  deleteConversationForUser,
  listConversationsForUser,
  listSuggestedQuestions,
  getConversationForUser,
  getMessagesForConversation,
  listConversationUsersAdmin,
  listConversationsForUserAdmin,
  getConversationAdmin,
  deleteConversation,
  setConversationArchivedAdmin,
  renameConversationAdmin,
};
