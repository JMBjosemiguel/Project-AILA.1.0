const { query } = require('../config/database');

const SORT_MAP = {
  title: 'r.title ASC',
  recent: 'r.created_at DESC',
  popular: 'view_count DESC',
};

async function listResources(userId, { search = '', type = 'all', sort = 'title' }) {
  const orderBy = SORT_MAP[sort] || SORT_MAP.title;
  const searchTerm = `%${search}%`;

  return query(
    `
      SELECT
        r.id, r.title, r.type, r.file_path, r.external_url, r.description, r.created_at,
        r.ai_summary, r.ai_keywords, r.ai_topic, r.ai_difficulty, r.ai_analyzed_at,
        rc.name AS category_name,
        (SELECT COUNT(*) FROM resource_views_log rvl WHERE rvl.resource_id = r.id) AS view_count
      FROM resources r
      LEFT JOIN resource_categories rc ON rc.id = r.category_id
      LEFT JOIN users u ON u.id = r.uploaded_by
      WHERE r.deleted_at IS NULL
        AND (r.uploaded_by = ? OR u.role_id = 2)
        AND (? = '' OR r.title LIKE ?)
        AND (? = 'all' OR r.type = ?)
      ORDER BY ${orderBy}
    `,
    [userId, search, searchTerm, type, type]
  );
}

async function createUploadedResource({ uploadedBy, title, type, filePath, fileSizeBytes, subjectId }) {
  const result = await query(
    'INSERT INTO resources (uploaded_by, title, type, file_path, file_size_bytes) VALUES (?, ?, ?, ?, ?)',
    [uploadedBy, title, type, filePath, fileSizeBytes || null]
  );
  const resourceId = result.insertId;

  if (subjectId) {
    await query('INSERT INTO resource_subjects (resource_id, subject_id) VALUES (?, ?)', [resourceId, subjectId]);
  }

  return resourceId;
}

async function createLinkResource({ uploadedBy, title, externalUrl, description, subjectId }) {
  const result = await query(
    "INSERT INTO resources (uploaded_by, title, type, external_url, description) VALUES (?, ?, 'link', ?, ?)",
    [uploadedBy, title, externalUrl, description || null]
  );
  const resourceId = result.insertId;

  if (subjectId) {
    await query('INSERT INTO resource_subjects (resource_id, subject_id) VALUES (?, ?)', [resourceId, subjectId]);
  }

  return resourceId;
}

async function updateResourceAnalysis(resourceId, { extractedText, summary, keywords, topic, difficulty }) {
  await query(
    `
      UPDATE resources
      SET extracted_text = ?, ai_summary = ?, ai_keywords = ?, ai_topic = ?, ai_difficulty = ?, ai_analyzed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [extractedText, summary, JSON.stringify(keywords || []), topic, difficulty, resourceId]
  );
}

async function getExtractedText(resourceId, userId) {
  const rows = await query(
    `
      SELECT r.extracted_text
      FROM resources r
      LEFT JOIN users u ON u.id = r.uploaded_by
      WHERE r.id = ? AND r.deleted_at IS NULL AND (r.uploaded_by = ? OR u.role_id = 2)
      LIMIT 1
    `,
    [resourceId, userId]
  );
  return rows[0]?.extracted_text || null;
}

async function getResourceSubjectsMap() {
  const rows = await query(
    `
      SELECT rs.resource_id, s.id, s.name
      FROM resource_subjects rs
      INNER JOIN subjects s ON s.id = rs.subject_id AND s.deleted_at IS NULL
    `
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.resource_id)) map.set(row.resource_id, []);
    map.get(row.resource_id).push({ id: row.id, name: row.name });
  }
  return map;
}

async function listSubjectsLite(userId) {
  return query('SELECT id, name FROM subjects WHERE deleted_at IS NULL AND created_by = ? ORDER BY name ASC', [userId]);
}

async function getResourceById(resourceId, userId) {
  const rows = await query(
    `
      SELECT r.id, r.title, r.type, r.file_path, r.external_url, r.uploaded_by
      FROM resources r
      LEFT JOIN users u ON u.id = r.uploaded_by
      WHERE r.id = ? AND r.deleted_at IS NULL AND (r.uploaded_by = ? OR u.role_id = 2)
      LIMIT 1
    `,
    [resourceId, userId]
  );
  return rows[0] || null;
}

async function getResourceByIdAdmin(resourceId) {
  const rows = await query(
    `
      SELECT id, title, type, file_path, external_url, uploaded_by
      FROM resources
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [resourceId]
  );
  return rows[0] || null;
}

async function getOwnedResourceById(resourceId, userId) {
  const rows = await query(
    `
      SELECT id, title, type, file_path, external_url, uploaded_by
      FROM resources
      WHERE id = ? AND uploaded_by = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [resourceId, userId]
  );
  return rows[0] || null;
}

async function logView(userId, resourceId) {
  await query('INSERT INTO resource_views_log (user_id, resource_id) VALUES (?, ?)', [userId, resourceId]);
}

async function updateResourceMeta(resourceId, userId, { title, subjectId }) {
  if (title !== undefined) {
    await query('UPDATE resources SET title = ? WHERE id = ? AND uploaded_by = ?', [title, resourceId, userId]);
  }
  if (subjectId !== undefined) {
    await query('DELETE FROM resource_subjects WHERE resource_id = ?', [resourceId]);
    if (subjectId) {
      await query('INSERT INTO resource_subjects (resource_id, subject_id) VALUES (?, ?)', [resourceId, subjectId]);
    }
  }
}

async function softDeleteResource(resourceId, userId) {
  const rows = await query(
    'SELECT file_path FROM resources WHERE id = ? AND uploaded_by = ? AND deleted_at IS NULL LIMIT 1',
    [resourceId, userId]
  );
  if (!rows.length) return null;

  await query('UPDATE resources SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [resourceId]);
  return rows[0].file_path;
}

async function listRecentlyOpened(userId, limit = 5) {
  return query(
    `
      SELECT r.id, r.title, r.type, MAX(rvl.viewed_at) AS last_viewed_at
      FROM resource_views_log rvl
      INNER JOIN resources r ON r.id = rvl.resource_id AND r.deleted_at IS NULL
      WHERE rvl.user_id = ?
      GROUP BY r.id, r.title, r.type
      ORDER BY last_viewed_at DESC
      LIMIT ?
    `,
    [userId, limit]
  );
}

async function listRecommended(userId, limit = 5) {
  return query(
    `
      SELECT DISTINCT r.id, r.title, r.type,
        (SELECT COUNT(*) FROM resource_views_log rvl WHERE rvl.resource_id = r.id) AS view_count
      FROM resources r
      LEFT JOIN users u ON u.id = r.uploaded_by
      INNER JOIN resource_subjects rs ON rs.resource_id = r.id
      INNER JOIN topics t ON t.module_id IN (
        SELECT m.id FROM modules m WHERE m.subject_id = rs.subject_id
      )
      INNER JOIN learning_progress lp ON lp.topic_id = t.id AND lp.user_id = ? AND lp.status = 'in_progress'
      WHERE r.deleted_at IS NULL
        AND (r.uploaded_by = ? OR u.role_id = 2)
        AND r.id NOT IN (SELECT resource_id FROM resource_views_log WHERE user_id = ?)
      ORDER BY view_count ASC
      LIMIT ?
    `,
    [userId, userId, userId, Number(limit)]
  );
}

async function listPopular(userId, limit = 5) {
  return query(
    `
      SELECT r.id, r.title, r.type, COUNT(rvl.id) AS view_count
      FROM resources r
      LEFT JOIN resource_views_log rvl ON rvl.resource_id = r.id
      LEFT JOIN users u ON u.id = r.uploaded_by
      WHERE r.deleted_at IS NULL
        AND (r.uploaded_by = ? OR u.role_id = 2)
      GROUP BY r.id, r.title, r.type
      ORDER BY view_count DESC
      LIMIT ?
    `,
    [userId, limit]
  );
}

module.exports = {
  listResources,
  createUploadedResource,
  createLinkResource,
  updateResourceAnalysis,
  getExtractedText,
  getResourceSubjectsMap,
  listSubjectsLite,
  getResourceById,
  getResourceByIdAdmin,
  getOwnedResourceById,
  logView,
  updateResourceMeta,
  softDeleteResource,
  listRecentlyOpened,
  listPopular,
  listRecommended,
};
