const ApiError = require('../utils/ApiError');
const adminModel = require('../models/adminModel');
const learningModel = require('../models/learningModel');
const notificationModel = require('../models/notificationModel');
const adminAnalyticsModel = require('../models/adminAnalyticsModel');
const auditLogModel = require('../models/auditLogModel');
const { query, transaction } = require('../config/database');
const { notifyUsers } = require('../utils/notify');
const { deleteStoredFile } = require('./resourceService');
const { logAdminAction } = require('../utils/adminAudit');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

async function getDashboardStats() {
  const [stats, activity] = await Promise.all([
    adminModel.getDashboardStats(),
    adminModel.getRecentActivity(6),
  ]);
  return { ...stats, recentActivity: activity };
}

async function resolveTargetUserIds({ targetType, targetValue }) {
  if (targetType === 'user') {
    return targetValue ? [Number(targetValue)] : [];
  }
  if (targetType === 'course') {
    const rows = await query('SELECT created_by FROM subjects WHERE id = ? AND created_by IS NOT NULL', [Number(targetValue)]);
    return rows.map((row) => row.created_by);
  }
  if (targetType === 'year_level') {
    const rows = await query(
      `
        SELECT u.id FROM users u
        INNER JOIN user_profiles up ON up.user_id = u.id
        WHERE up.year_level = ? AND u.deleted_at IS NULL AND u.is_active = 1
      `,
      [Number(targetValue)]
    );
    return rows.map((row) => row.id);
  }
  if (targetType === 'role') {
    const rows = await query(
      `SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = ?) AND deleted_at IS NULL AND is_active = 1`,
      [targetValue]
    );
    return rows.map((row) => row.id);
  }
  return adminModel.listStudentUserIds();
}

async function createAnnouncement(adminId, { title, body, targetType = 'all', targetValue = null }) {
  const userIds = await resolveTargetUserIds({ targetType, targetValue });
  if (!userIds.length) {
    throw new ApiError(400, 'There are no matching users to notify.');
  }

  const notificationId = await notifyUsers({ type: 'announcement', title, body, userIds, createdBy: adminId, targetType, targetValue });
  await logAdminAction(adminId, 'announcement.create', 'notifications', notificationId, { title, targetType, targetValue, notified: userIds.length });
  return { notified: userIds.length, id: notificationId };
}

async function listUsers(userId, params) {
  const { page, pageSize, limit, offset } = parsePagination(params);
  const { rows, total } = await adminModel.listUsers({ ...params, limit, offset });
  return { users: rows, pagination: buildPaginationMeta({ page, pageSize, total }) };
}

async function getUserDetail(userId) {
  const detail = await adminModel.getUserDetail(Number(userId));
  if (!detail) {
    throw new ApiError(404, 'User not found.');
  }
  return detail;
}

async function setUserActive(adminId, userId, isActive) {
  const affectedRows = await adminModel.setUserActive(Number(userId), isActive);
  if (!affectedRows) {
    throw new ApiError(404, 'User not found.');
  }
  await logAdminAction(adminId, isActive ? 'user.reactivate' : 'user.deactivate', 'users', Number(userId));
}

async function deleteUser(adminId, userId) {
  const affectedRows = await adminModel.deleteUser(Number(userId));
  if (!affectedRows) {
    throw new ApiError(404, 'User not found.');
  }
  await logAdminAction(adminId, 'user.delete', 'users', Number(userId));
}

async function resetUserProgress(adminId, userId) {
  await transaction((connection) => adminModel.resetUserProgress(Number(userId), connection));
  await logAdminAction(adminId, 'user.reset_progress', 'users', Number(userId));
}

async function listResources(userId, params) {
  const { page, pageSize, limit, offset } = parsePagination(params);
  const { rows, total } = await adminModel.listResourcesAdmin({ ...params, limit, offset });
  return { resources: rows, pagination: buildPaginationMeta({ page, pageSize, total }) };
}

async function deleteResource(adminId, resourceId) {
  const filePath = await adminModel.deleteResourceAdmin(Number(resourceId));
  if (filePath === null) {
    throw new ApiError(404, 'Resource not found.');
  }
  await deleteStoredFile(filePath);
  await logAdminAction(adminId, 'resource.delete', 'resources', Number(resourceId));
}

async function setResourceArchived(adminId, resourceId, isArchived) {
  const affectedRows = await adminModel.setResourceArchived(Number(resourceId), isArchived);
  if (!affectedRows) {
    throw new ApiError(404, 'Resource not found.');
  }
  await logAdminAction(adminId, isArchived ? 'resource.archive' : 'resource.unarchive', 'resources', Number(resourceId));
}

async function bulkResourceAction(adminId, { ids, action }) {
  const results = [];
  for (const id of ids) {
    try {
      if (action === 'delete') await deleteResource(adminId, id);
      else if (action === 'archive') await setResourceArchived(adminId, id, true);
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false });
    }
  }
  return { results };
}

async function listCourses(params) {
  const { page, pageSize, limit, offset } = parsePagination(params);
  const { rows, total } = await adminModel.listSubjectsAdmin({ ...params, limit, offset });
  return { courses: rows, pagination: buildPaginationMeta({ page, pageSize, total }) };
}

async function getCourseDetail(courseId) {
  const ownerId = await adminModel.getSubjectOwner(Number(courseId));
  if (!ownerId) {
    throw new ApiError(404, 'Course not found.');
  }

  const [course, owner, studentRows] = await Promise.all([
    learningModel.getSubjectTreeById(Number(courseId), ownerId),
    query('SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1', [ownerId]),
    query(
      `
        SELECT ROUND(AVG(qa.score / qa.total * 100)) AS avg_quiz_score
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.completed_at IS NOT NULL AND qa.user_id = ?
          AND (
            (q.source_type = 'topic' AND q.source_id IN (SELECT t.id FROM topics t INNER JOIN modules m ON m.id = t.module_id WHERE m.subject_id = ?))
            OR (q.source_type = 'lesson' AND q.source_id IN (SELECT l.id FROM lessons l INNER JOIN topics t ON t.id = l.topic_id INNER JOIN modules m ON m.id = t.module_id WHERE m.subject_id = ?))
          )
      `,
      [ownerId, courseId, courseId]
    ),
  ]);

  if (!course) {
    throw new ApiError(404, 'Course not found.');
  }

  return { course, owner: owner[0] || null, avgQuizScore: studentRows[0]?.avg_quiz_score ?? null };
}

async function deleteCourse(adminId, courseId) {
  const ownerId = await adminModel.getSubjectOwner(Number(courseId));
  if (!ownerId) {
    throw new ApiError(404, 'Course not found.');
  }

  await transaction((connection) => learningModel.deleteSubjectCascade(Number(courseId), ownerId, connection));
  await logAdminAction(adminId, 'course.delete', 'subjects', Number(courseId));
}

async function setCourseArchived(adminId, courseId, isArchived) {
  const affectedRows = await adminModel.setSubjectArchived(Number(courseId), isArchived);
  if (!affectedRows) {
    throw new ApiError(404, 'Course not found.');
  }
  await logAdminAction(adminId, isArchived ? 'course.archive' : 'course.unarchive', 'subjects', Number(courseId));
}

async function listAnnouncements(params) {
  const { page, pageSize, limit, offset } = parsePagination(params);
  const { rows, total } = await notificationModel.listAnnouncementsAdmin({ ...params, limit, offset });
  return { announcements: rows, pagination: buildPaginationMeta({ page, pageSize, total }) };
}

async function updateAnnouncement(adminId, announcementId, { title, body }) {
  const affectedRows = await notificationModel.updateAnnouncementAdmin(Number(announcementId), { title, body });
  if (!affectedRows) {
    throw new ApiError(404, 'Announcement not found.');
  }
  await logAdminAction(adminId, 'announcement.update', 'notifications', Number(announcementId));
}

async function setAnnouncementArchived(adminId, announcementId, isArchived) {
  const affectedRows = await notificationModel.setAnnouncementArchived(Number(announcementId), isArchived);
  if (!affectedRows) {
    throw new ApiError(404, 'Announcement not found.');
  }
  await logAdminAction(adminId, isArchived ? 'announcement.archive' : 'announcement.unarchive', 'notifications', Number(announcementId));
}

async function deleteAnnouncement(adminId, announcementId) {
  const affectedRows = await notificationModel.deleteAnnouncementAdmin(Number(announcementId));
  if (!affectedRows) {
    throw new ApiError(404, 'Announcement not found.');
  }
  await logAdminAction(adminId, 'announcement.delete', 'notifications', Number(announcementId));
}

async function getAnalytics() {
  const [
    registrations, aiUsage, quizTrend, lessonCompletions,
    popularCourses, popularResources, activeStudents, strongTopics, weakTopics,
  ] = await Promise.all([
    adminAnalyticsModel.getRegistrationsOverTime(14),
    adminAnalyticsModel.getAiUsageOverTime(14),
    adminAnalyticsModel.getQuizScoreTrend(14),
    adminAnalyticsModel.getLessonCompletionsOverTime(14),
    adminAnalyticsModel.getPopularCourses(5),
    adminAnalyticsModel.getPopularResources(5),
    adminAnalyticsModel.getMostActiveStudents(5),
    adminAnalyticsModel.getTopicMasteryPlatform('desc', 5),
    adminAnalyticsModel.getTopicMasteryPlatform('asc', 5),
  ]);

  return {
    registrations, aiUsage, quizTrend, lessonCompletions,
    popularCourses, popularResources, activeStudents, strongTopics, weakTopics,
  };
}

async function listAuditLog(params) {
  const { page, pageSize, limit, offset } = parsePagination(params);
  const [{ rows, total }, actions] = await Promise.all([
    auditLogModel.listAuditLog({ ...params, limit, offset }),
    auditLogModel.listDistinctActions(),
  ]);
  return { entries: rows, actions, pagination: buildPaginationMeta({ page, pageSize, total }) };
}

async function exportAuditLogCsv(params) {
  return auditLogModel.listAuditLogForExport(params);
}

module.exports = {
  getDashboardStats,
  createAnnouncement,
  listUsers,
  getUserDetail,
  setUserActive,
  deleteUser,
  resetUserProgress,
  listResources,
  deleteResource,
  setResourceArchived,
  bulkResourceAction,
  listCourses,
  getCourseDetail,
  deleteCourse,
  setCourseArchived,
  listAnnouncements,
  updateAnnouncement,
  setAnnouncementArchived,
  deleteAnnouncement,
  getAnalytics,
  listAuditLog,
  exportAuditLogCsv,
};
