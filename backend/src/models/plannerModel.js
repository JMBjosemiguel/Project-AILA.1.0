const { query } = require('../config/database');

async function listTasksForUser(userId) {
  return query(
    `
      SELECT
        st.id, st.title, st.description, st.deadline, st.status, st.completed_at, st.created_at,
        st.color, st.notes, st.repeat_interval, st.remind_me, st.difficulty, st.estimated_minutes,
        st.subject_id, st.overdue_notified,
        tp.id AS priority_id, tp.label AS priority_label,
        s.name AS subject_name
      FROM study_tasks st
      INNER JOIN task_priorities tp ON tp.id = st.priority_id
      LEFT JOIN subjects s ON s.id = st.subject_id AND s.deleted_at IS NULL
      WHERE st.user_id = ? AND st.deleted_at IS NULL
      ORDER BY (st.deadline IS NULL), st.deadline ASC
    `,
    [userId]
  );
}

async function listPriorities() {
  return query('SELECT id, label FROM task_priorities ORDER BY id ASC');
}

async function createTask(userId, { title, description, deadline, priorityId, color, notes, repeatInterval, remindMe, difficulty, estimatedMinutes, subjectId }) {
  const result = await query(
    `
      INSERT INTO study_tasks (
        user_id, priority_id, title, description, deadline, status,
        color, notes, repeat_interval, remind_me, difficulty, estimated_minutes, subject_id
      )
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId, priorityId || 2, title, description || null, deadline || null,
      color || null, notes || null, repeatInterval || 'none', remindMe ? 1 : 0,
      difficulty || null, estimatedMinutes || null, subjectId || null,
    ]
  );
  return result.insertId;
}

async function getTaskForUser(taskId, userId) {
  const rows = await query(
    `
      SELECT st.id, st.user_id, st.title, st.description, st.deadline, st.status, st.priority_id,
        st.color, st.notes, st.repeat_interval, st.remind_me, st.difficulty, st.estimated_minutes,
        st.subject_id, st.overdue_notified
      FROM study_tasks st
      WHERE st.id = ? AND st.user_id = ? AND st.deleted_at IS NULL LIMIT 1
    `,
    [taskId, userId]
  );
  return rows[0] || null;
}

async function markOverdueNotified(taskId) {
  await query('UPDATE study_tasks SET overdue_notified = 1 WHERE id = ?', [taskId]);
}

async function updateTask(taskId, fields) {
  const columns = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    columns.push(`${key} = ?`);
    params.push(value);
  }
  if (!columns.length) return;

  params.push(taskId);
  await query(`UPDATE study_tasks SET ${columns.join(', ')} WHERE id = ?`, params);
}

async function logStatusChange(taskId, oldStatus, newStatus) {
  await query(
    'INSERT INTO task_status_log (task_id, old_status, new_status) VALUES (?, ?, ?)',
    [taskId, oldStatus, newStatus]
  );
}

async function softDeleteTask(taskId, userId) {
  const result = await query(
    'UPDATE study_tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [taskId, userId]
  );
  return result.affectedRows;
}

async function duplicateTask(taskId, userId) {
  const source = await getTaskForUser(taskId, userId);
  if (!source) return null;

  const result = await query(
    `
      INSERT INTO study_tasks (
        user_id, priority_id, title, description, deadline, status,
        color, notes, repeat_interval, remind_me, difficulty, estimated_minutes, subject_id
      )
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId, source.priority_id, `${source.title} (copy)`, source.description, source.deadline,
      source.color, source.notes, source.repeat_interval, source.remind_me,
      source.difficulty, source.estimated_minutes, source.subject_id,
    ]
  );
  return result.insertId;
}

module.exports = {
  listTasksForUser,
  listPriorities,
  createTask,
  getTaskForUser,
  updateTask,
  logStatusChange,
  softDeleteTask,
  markOverdueNotified,
  duplicateTask,
};
