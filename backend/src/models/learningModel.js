const { query, execute } = require('../config/database');
const { colorForId } = require('../utils/palette');

function buildSubjectTree(rows) {
  const subjects = new Map();

  for (const row of rows) {
    if (!subjects.has(row.subject_id)) {
      const { color, tint } = colorForId(row.subject_id);
      subjects.set(row.subject_id, {
        id: row.subject_id,
        name: row.subject_name,
        code: row.subject_code,
        description: row.subject_description,
        is_ai_generated: Boolean(row.is_ai_generated),
        difficulty: row.subject_difficulty,
        goal: row.subject_goal,
        color,
        tint,
        modules: new Map(),
      });
    }
    const subject = subjects.get(row.subject_id);

    if (row.module_id && !subject.modules.has(row.module_id)) {
      subject.modules.set(row.module_id, {
        id: row.module_id,
        title: row.module_title,
        topics: new Map(),
      });
    }
    const module_ = row.module_id ? subject.modules.get(row.module_id) : null;

    if (module_ && row.topic_id && !module_.topics.has(row.topic_id)) {
      module_.topics.set(row.topic_id, {
        id: row.topic_id,
        title: row.topic_title,
        progress_percent: row.topic_progress_percent ?? 0,
        status: row.topic_status ?? 'not_started',
        lessons: [],
      });
    }
    const topic = module_ && row.topic_id ? module_.topics.get(row.topic_id) : null;

    if (topic && row.lesson_id) {
      topic.lessons.push({
        id: row.lesson_id,
        title: row.lesson_title,
        completed: Boolean(row.lesson_completed_at),
        difficulty: row.lesson_difficulty,
        estimated_minutes: row.lesson_estimated_minutes,
      });
    }
  }

  return [...subjects.values()].map((subject) => {
    const modules = [...subject.modules.values()].map((module_) => {
      const topics = [...module_.topics.values()];
      const topicsWithProgress = topics.filter((topic) => topic.lessons.length > 0);
      const progressPercent = topicsWithProgress.length
        ? Math.round(
            topicsWithProgress.reduce((sum, topic) => sum + topic.progress_percent, 0) /
              topicsWithProgress.length
          )
        : 0;

      return {
        ...module_,
        topics,
        topics_count: topics.length,
        progress_percent: progressPercent,
      };
    });

    const subjectProgress = modules.length
      ? Math.round(modules.reduce((sum, module_) => sum + module_.progress_percent, 0) / modules.length)
      : 0;

    return {
      ...subject,
      modules,
      progress_percent: subjectProgress,
    };
  });
}

async function listSubjectsForUser(userId) {
  const rows = await query(
    `
      SELECT
        s.id AS subject_id, s.name AS subject_name, s.code AS subject_code, s.description AS subject_description,
        s.is_ai_generated, s.difficulty AS subject_difficulty, s.goal AS subject_goal,
        m.id AS module_id, m.title AS module_title,
        t.id AS topic_id, t.title AS topic_title,
        l.id AS lesson_id, l.title AS lesson_title, l.difficulty AS lesson_difficulty, l.estimated_minutes AS lesson_estimated_minutes,
        lp.progress_percent AS topic_progress_percent, lp.status AS topic_status,
        lpr.completed_at AS lesson_completed_at
      FROM subjects s
      LEFT JOIN modules m ON m.subject_id = s.id AND m.deleted_at IS NULL
      LEFT JOIN topics t ON t.module_id = m.id AND t.deleted_at IS NULL
      LEFT JOIN lessons l ON l.topic_id = t.id AND l.deleted_at IS NULL
      LEFT JOIN learning_progress lp ON lp.topic_id = t.id AND lp.user_id = ?
      LEFT JOIN lesson_progress lpr ON lpr.lesson_id = l.id AND lpr.user_id = ?
      WHERE s.deleted_at IS NULL AND s.created_by = ?
      ORDER BY s.created_at DESC, m.order_index ASC, t.order_index ASC, l.id ASC
    `,
    [userId, userId, userId]
  );

  return buildSubjectTree(rows);
}

async function getSubjectTreeById(subjectId, userId) {
  const rows = await query(
    `
      SELECT
        s.id AS subject_id, s.name AS subject_name, s.code AS subject_code, s.description AS subject_description,
        s.is_ai_generated, s.difficulty AS subject_difficulty, s.goal AS subject_goal,
        m.id AS module_id, m.title AS module_title,
        t.id AS topic_id, t.title AS topic_title,
        l.id AS lesson_id, l.title AS lesson_title, l.difficulty AS lesson_difficulty, l.estimated_minutes AS lesson_estimated_minutes,
        lp.progress_percent AS topic_progress_percent, lp.status AS topic_status,
        lpr.completed_at AS lesson_completed_at
      FROM subjects s
      LEFT JOIN modules m ON m.subject_id = s.id AND m.deleted_at IS NULL
      LEFT JOIN topics t ON t.module_id = m.id AND t.deleted_at IS NULL
      LEFT JOIN lessons l ON l.topic_id = t.id AND l.deleted_at IS NULL
      LEFT JOIN learning_progress lp ON lp.topic_id = t.id AND lp.user_id = ?
      LEFT JOIN lesson_progress lpr ON lpr.lesson_id = l.id AND lpr.user_id = ?
      WHERE s.deleted_at IS NULL AND s.id = ? AND s.created_by = ?
      ORDER BY m.order_index ASC, t.order_index ASC, l.id ASC
    `,
    [userId, userId, subjectId, userId]
  );

  const [subject] = buildSubjectTree(rows);
  return subject || null;
}

async function getLessonBasic(lessonId) {
  const rows = await query(
    'SELECT id, topic_id, title FROM lessons WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [lessonId]
  );
  return rows[0] || null;
}

async function getLessonBasicForUser(lessonId, userId) {
  const rows = await query(
    `
      SELECT l.id, l.topic_id, l.title
      FROM lessons l
      INNER JOIN topics t ON t.id = l.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE l.id = ?
        AND l.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND s.created_by = ?
      LIMIT 1
    `,
    [lessonId, userId]
  );
  return rows[0] || null;
}

async function getLessonDetail(lessonId, userId) {
  const rows = await query(
    `
      SELECT
        l.id, l.title, l.content, l.topic_id, l.difficulty, l.estimated_minutes,
        t.title AS topic_title, t.module_id,
        m.title AS module_title, m.subject_id,
        s.name AS subject_name, s.goal AS subject_goal,
        lpr.completed_at
      FROM lessons l
      INNER JOIN topics t ON t.id = l.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      LEFT JOIN lesson_progress lpr ON lpr.lesson_id = l.id AND lpr.user_id = ?
      WHERE l.id = ?
        AND l.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND s.created_by = ?
      LIMIT 1
    `,
    [userId, lessonId, userId]
  );

  if (!rows.length) return null;
  const lesson = rows[0];

  const [definitions, examples, resources, siblingLessonRows] = await Promise.all([
    query('SELECT id, term, definition_text FROM definitions WHERE topic_id = ? ORDER BY id ASC', [lesson.topic_id]),
    query('SELECT id, title, content FROM examples WHERE topic_id = ? ORDER BY id ASC', [lesson.topic_id]),
    query(
      `
        SELECT r.id, r.title, r.type, r.external_url, r.file_path, rc.name AS category_name
        FROM resource_topics rt
        INNER JOIN resources r ON r.id = rt.resource_id AND r.deleted_at IS NULL
        LEFT JOIN resource_categories rc ON rc.id = r.category_id
        LEFT JOIN users u ON u.id = r.uploaded_by
        WHERE rt.topic_id = ? AND (r.uploaded_by = ? OR u.role_id = 2)
      `,
      [lesson.topic_id, userId]
    ),
    query(
      `
        SELECT l.id, l.title, lpr.completed_at
        FROM lessons l
        LEFT JOIN lesson_progress lpr ON lpr.lesson_id = l.id AND lpr.user_id = ?
        WHERE l.topic_id = ? AND l.deleted_at IS NULL
        ORDER BY l.id ASC
      `,
      [userId, lesson.topic_id]
    ),
  ]);

  const siblingLessons = siblingLessonRows.map((row) => ({
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed_at),
  }));

  const currentIndex = siblingLessons.findIndex((item) => item.id === lesson.id);
  const prerequisiteLesson = currentIndex > 0 ? siblingLessons[currentIndex - 1] : null;

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      completed: Boolean(lesson.completed_at),
      difficulty: lesson.difficulty,
      estimated_minutes: lesson.estimated_minutes,
    },
    topic: { id: lesson.topic_id, title: lesson.topic_title },
    module: { id: lesson.module_id, title: lesson.module_title },
    subject: { id: lesson.subject_id, name: lesson.subject_name, goal: lesson.subject_goal },
    definitions,
    examples,
    relatedResources: resources,
    siblingLessons,
    prerequisiteLesson,
  };
}

async function getLessonProgress(userId, lessonId) {
  const rows = await query(
    'SELECT id, completed_at FROM lesson_progress WHERE user_id = ? AND lesson_id = ? LIMIT 1',
    [userId, lessonId]
  );
  return rows[0] || null;
}

async function markLessonComplete(userId, lessonId, connection = null) {
  await execute(
    connection,
    'INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE completed_at = CURRENT_TIMESTAMP',
    [userId, lessonId]
  );
}

async function recomputeTopicProgress(userId, topicId, connection = null) {
  const totalResult = await execute(
    connection,
    'SELECT COUNT(*) AS total FROM lessons WHERE topic_id = ? AND deleted_at IS NULL',
    [topicId]
  );
  const completedResult = await execute(
    connection,
    `
      SELECT COUNT(*) AS completed
      FROM lesson_progress lpr
      INNER JOIN lessons l ON l.id = lpr.lesson_id
      WHERE l.topic_id = ? AND lpr.user_id = ? AND l.deleted_at IS NULL
    `,
    [topicId, userId]
  );

  const total = totalResult[0]?.total ?? 0;
  const completed = completedResult[0]?.completed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status = percent >= 100 ? 'completed' : percent > 0 ? 'in_progress' : 'not_started';

  await execute(
    connection,
    `
      INSERT INTO learning_progress (user_id, topic_id, progress_percent, status)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE progress_percent = VALUES(progress_percent), status = VALUES(status)
    `,
    [userId, topicId, percent, status]
  );

  return { percent, status };
}

async function subjectBelongsToUser(subjectId, userId) {
  const rows = await query(
    'SELECT id FROM subjects WHERE id = ? AND created_by = ? AND deleted_at IS NULL LIMIT 1',
    [subjectId, userId]
  );
  return rows.length > 0;
}

async function deleteSubjectCascade(subjectId, userId, connection) {
  await execute(
    connection,
    `
      DELETE lpr FROM lesson_progress lpr
      INNER JOIN lessons l ON l.id = lpr.lesson_id
      INNER JOIN topics t ON t.id = l.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      WHERE m.subject_id = ? AND lpr.user_id = ?
    `,
    [subjectId, userId]
  );
  await execute(
    connection,
    `
      DELETE lp FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      WHERE m.subject_id = ? AND lp.user_id = ?
    `,
    [subjectId, userId]
  );
  await execute(
    connection,
    `
      UPDATE lessons l
      INNER JOIN topics t ON t.id = l.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      SET l.deleted_at = CURRENT_TIMESTAMP
      WHERE m.subject_id = ? AND l.deleted_at IS NULL
    `,
    [subjectId]
  );
  await execute(
    connection,
    `
      UPDATE topics t
      INNER JOIN modules m ON m.id = t.module_id
      SET t.deleted_at = CURRENT_TIMESTAMP
      WHERE m.subject_id = ? AND t.deleted_at IS NULL
    `,
    [subjectId]
  );
  await execute(
    connection,
    'UPDATE modules SET deleted_at = CURRENT_TIMESTAMP WHERE subject_id = ? AND deleted_at IS NULL',
    [subjectId]
  );
  await execute(
    connection,
    'UPDATE study_tasks SET subject_id = NULL WHERE subject_id = ? AND user_id = ?',
    [subjectId, userId]
  );
  await execute(
    connection,
    'UPDATE subjects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
    [subjectId]
  );
}

module.exports = {
  listSubjectsForUser,
  getSubjectTreeById,
  getLessonBasic,
  getLessonBasicForUser,
  getLessonDetail,
  getLessonProgress,
  markLessonComplete,
  recomputeTopicProgress,
  subjectBelongsToUser,
  deleteSubjectCascade,
};
