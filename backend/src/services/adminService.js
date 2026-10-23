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
  const [stats, activity, feedbackPending, unverifiedOver24h, studentsNeedingHelp, activeStudentsByDay] = await Promise.all([
    adminModel.getDashboardStats(),
    adminModel.getRecentActivity(6),
    adminModel.getFeedbackPendingCount(),
    adminModel.getUnverifiedOver24hCount(),
    adminModel.getStudentsNeedingHelp(5),
    adminModel.getActiveStudentsByDay(7),
  ]);
  return {
    ...stats,
    recentActivity: activity,
    needsAttention: {
      feedbackPending,
      unverifiedOver24h,
      studentsNeedingHelp: studentsNeedingHelp.total,
    },
    studentsNeedingHelp: studentsNeedingHelp.students,
    activeStudentsByDay,
  };
}

async function resolveTargetUserIds({ targetType, targetValue }) {
  if (targetType === 'user') {
    return targetValue ? [Number(targetValue)] : [];
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

// Deactivating an admin is a removal of access just like deleting one, so it
// gets the same two guards: never yourself, never the last active admin.
// Both checks run inside the transaction that performs the update, with
// countActiveAdmins' row locking (see adminModel) serializing concurrent
// requests against each other.
async function setUserActive(adminId, userId, isActive) {
  const numericUserId = Number(userId);
  if (!isActive && Number(adminId) === numericUserId) {
    throw new ApiError(400, "You can't deactivate your own account.");
  }

  const affectedRows = await transaction(async (connection) => {
    const target = await adminModel.getUserForDeletion(numericUserId, connection);
    if (!target) return 0;
    if (!isActive && target.role === 'admin') {
      const activeAdmins = await adminModel.countActiveAdmins(connection);
      if (activeAdmins <= 1) {
        throw new ApiError(409, 'AILA needs at least one admin.');
      }
    }
    return adminModel.setUserActive(numericUserId, isActive, connection);
  });

  if (!affectedRows) {
    throw new ApiError(404, 'User not found.');
  }
  await logAdminAction(adminId, isActive ? 'user.reactivate' : 'user.deactivate', 'users', numericUserId);
}

async function deleteUser(adminId, userId) {
  const numericUserId = Number(userId);
  if (Number(adminId) === numericUserId) {
    throw new ApiError(400, "You can't delete your own account.");
  }

  const { affectedRows, targetRole } = await transaction(async (connection) => {
    const target = await adminModel.getUserForDeletion(numericUserId, connection);
    if (!target) return { affectedRows: 0, targetRole: null };
    if (target.role === 'admin') {
      const activeAdmins = await adminModel.countActiveAdmins(connection);
      if (activeAdmins <= 1) {
        throw new ApiError(409, 'AILA needs at least one admin.');
      }
    }
    const affected = await adminModel.deleteUser(numericUserId, connection);
    return { affectedRows: affected, targetRole: target.role };
  });

  if (!affectedRows) {
    throw new ApiError(404, 'User not found.');
  }
  await logAdminAction(adminId, 'user.delete', 'users', numericUserId, targetRole === 'admin' ? { targetRole: 'admin' } : null);
}

// Promote only, no demote. Resource visibility hardcodes role_id = 2 (admin)
// in several places (resourceModel.js x5, learningModel.js x1) to show every
// admin's uploads to every student, so a student with personal uploads is
// blocked rather than silently making those uploads visible app-wide.
async function promoteToAdmin(adminId, userId) {
  const user = await adminModel.getUserForPromotion(Number(userId));
  if (!user) {
    throw new ApiError(404, 'User not found.');
  }
  if (user.role === 'admin') {
    throw new ApiError(400, 'This user is already an admin.');
  }
  if (!user.email_verified_at) {
    throw new ApiError(400, 'This student has not verified their email yet. They must verify before being promoted.');
  }
  if (!user.is_active) {
    throw new ApiError(400, 'This student account is deactivated. Reactivate it before promoting.');
  }

  const uploadCount = await adminModel.countPersonalUploads(Number(userId));
  if (uploadCount > 0) {
    throw new ApiError(400, `This student has ${uploadCount} personal upload${uploadCount === 1 ? '' : 's'} that would become visible to all students. Remove them first.`);
  }

  const affectedRows = await adminModel.promoteToAdmin(Number(userId));
  if (!affectedRows) {
    throw new ApiError(404, 'User not found.');
  }
  await logAdminAction(adminId, 'user.promote_to_admin', 'users', Number(userId), { fromRole: 'student', toRole: 'admin' });
}

// Demote only ever flips role_id back to student — the account, its data,
// and verification status are untouched. Unlike promoteToAdmin there is no
// upload check to run first: role_id = 2 (admin) is read live off the
// user's CURRENT role wherever resource visibility hardcodes it, so a
// demoted admin's own uploads simply stop being shown app-wide the moment
// the role changes — nothing can leak by demoting.
//
// Access ends immediately without any session/token change: authenticate
// re-fetches the user (and therefore its role) from the DB on every request
// (see middlewares/authenticate.js -> findUserById), and authorize reads
// req.auth.user.role from that fresh fetch — never from the JWT payload —
// so the very next request after demotion already sees 'student'.
async function demoteToStudent(adminId, userId) {
  const numericUserId = Number(userId);
  if (Number(adminId) === numericUserId) {
    throw new ApiError(400, "You can't demote your own account.");
  }

  const affectedRows = await transaction(async (connection) => {
    const target = await adminModel.getUserForDeletion(numericUserId, connection);
    if (!target) return 0;
    if (target.role !== 'admin') {
      throw new ApiError(400, 'This user is not an admin.');
    }
    const activeAdmins = await adminModel.countActiveAdmins(connection);
    if (activeAdmins <= 1) {
      throw new ApiError(400, 'At least one administrator must remain.');
    }
    return adminModel.demoteToStudent(numericUserId, connection);
  });

  if (!affectedRows) {
    throw new ApiError(404, 'User not found.');
  }
  await logAdminAction(adminId, 'user.demote_to_student', 'users', numericUserId, { fromRole: 'admin', toRole: 'student' });
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
    } catch (error) {
      console.error(`[adminService] bulk ${action} failed for resource ${id} (admin ${adminId}): ${error.message}`);
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
  promoteToAdmin,
  demoteToStudent,
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
