const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const adminService = require('../services/adminService');
const resourceService = require('../services/resourceService');

const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await adminService.getDashboardStats();
  sendSuccess(res, stats, 200, 'Dashboard stats retrieved.');
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, target_type: targetType, target_value: targetValue } = req.body;
  const result = await adminService.createAnnouncement(req.auth.user.id, { title, body, targetType, targetValue });
  sendSuccess(res, result, 201, 'Announcement sent.');
});

const listUsers = asyncHandler(async (req, res) => {
  const { search = '', role = 'all', status = 'all', sort = 'newest' } = req.query;
  const result = await adminService.listUsers(req.auth.user.id, { search, role, status, sort, page: req.query.page, pageSize: req.query.pageSize });
  sendSuccess(res, result, 200, 'Users retrieved.');
});

const getUserDetail = asyncHandler(async (req, res) => {
  const detail = await adminService.getUserDetail(req.params.userId);
  sendSuccess(res, detail, 200, 'User retrieved.');
});

const setUserActive = asyncHandler(async (req, res) => {
  await adminService.setUserActive(req.auth.user.id, req.params.userId, req.body.is_active);
  sendSuccess(res, null, 200, 'User updated.');
});

const deleteUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.auth.user.id, req.params.userId);
  sendSuccess(res, null, 200, 'User deleted.');
});

const resetUserProgress = asyncHandler(async (req, res) => {
  await adminService.resetUserProgress(req.auth.user.id, req.params.userId);
  sendSuccess(res, null, 200, "User's progress has been reset.");
});

const listResources = asyncHandler(async (req, res) => {
  const { search = '', type = 'all', archived = 'all', sort = 'newest' } = req.query;
  const result = await adminService.listResources(req.auth.user.id, { search, type, archived, sort, page: req.query.page, pageSize: req.query.pageSize });
  sendSuccess(res, result, 200, 'Resources retrieved.');
});

function sendStoredFile(res, storedFile) {
  res.setHeader('Content-Type', storedFile.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(storedFile.fileName)}"`);
  if (storedFile.contentLength) {
    res.setHeader('Content-Length', storedFile.contentLength);
  }
  storedFile.stream.pipe(res);
}

const downloadResource = asyncHandler(async (req, res) => {
  const storedFile = await resourceService.prepareAdminDownload(req.params.resourceId);
  sendStoredFile(res, storedFile);
});

const deleteResource = asyncHandler(async (req, res) => {
  await adminService.deleteResource(req.auth.user.id, req.params.resourceId);
  sendSuccess(res, null, 200, 'Resource deleted.');
});

const archiveResource = asyncHandler(async (req, res) => {
  await adminService.setResourceArchived(req.auth.user.id, req.params.resourceId, true);
  sendSuccess(res, null, 200, 'Resource archived.');
});

const unarchiveResource = asyncHandler(async (req, res) => {
  await adminService.setResourceArchived(req.auth.user.id, req.params.resourceId, false);
  sendSuccess(res, null, 200, 'Resource unarchived.');
});

const bulkResourceAction = asyncHandler(async (req, res) => {
  const result = await adminService.bulkResourceAction(req.auth.user.id, req.body);
  sendSuccess(res, result, 200, 'Bulk action completed.');
});

const listCourses = asyncHandler(async (req, res) => {
  const { search = '', archived = 'all', sort = 'newest' } = req.query;
  const result = await adminService.listCourses({ search, archived, sort, page: req.query.page, pageSize: req.query.pageSize });
  sendSuccess(res, result, 200, 'Courses retrieved.');
});

const getCourseDetail = asyncHandler(async (req, res) => {
  const detail = await adminService.getCourseDetail(req.params.courseId);
  sendSuccess(res, detail, 200, 'Course retrieved.');
});

const deleteCourse = asyncHandler(async (req, res) => {
  await adminService.deleteCourse(req.auth.user.id, req.params.courseId);
  sendSuccess(res, null, 200, 'Course deleted.');
});

const archiveCourse = asyncHandler(async (req, res) => {
  await adminService.setCourseArchived(req.auth.user.id, req.params.courseId, true);
  sendSuccess(res, null, 200, 'Course archived.');
});

const unarchiveCourse = asyncHandler(async (req, res) => {
  await adminService.setCourseArchived(req.auth.user.id, req.params.courseId, false);
  sendSuccess(res, null, 200, 'Course unarchived.');
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const { search = '', archived = 'all', sort = 'newest' } = req.query;
  const result = await adminService.listAnnouncements({ search, archived, sort, page: req.query.page, pageSize: req.query.pageSize });
  sendSuccess(res, result, 200, 'Announcements retrieved.');
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const { title, body } = req.body;
  await adminService.updateAnnouncement(req.auth.user.id, req.params.announcementId, { title, body });
  sendSuccess(res, null, 200, 'Announcement updated.');
});

const archiveAnnouncement = asyncHandler(async (req, res) => {
  await adminService.setAnnouncementArchived(req.auth.user.id, req.params.announcementId, true);
  sendSuccess(res, null, 200, 'Announcement archived.');
});

const unarchiveAnnouncement = asyncHandler(async (req, res) => {
  await adminService.setAnnouncementArchived(req.auth.user.id, req.params.announcementId, false);
  sendSuccess(res, null, 200, 'Announcement unarchived.');
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  await adminService.deleteAnnouncement(req.auth.user.id, req.params.announcementId);
  sendSuccess(res, null, 200, 'Announcement deleted.');
});

const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await adminService.getAnalytics();
  sendSuccess(res, analytics, 200, 'Analytics retrieved.');
});

const listAuditLog = asyncHandler(async (req, res) => {
  const { search = '', action = 'all', from = '', to = '' } = req.query;
  const result = await adminService.listAuditLog({ search, action, from, to, page: req.query.page, pageSize: req.query.pageSize });
  sendSuccess(res, result, 200, 'Audit log retrieved.');
});

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const exportAuditLog = asyncHandler(async (req, res) => {
  const { search = '', action = 'all', from = '', to = '' } = req.query;
  const rows = await adminService.exportAuditLogCsv({ search, action, from, to });

  const header = ['Timestamp', 'Admin', 'Email', 'Action', 'Target Table', 'Target ID'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      new Date(row.created_at).toISOString(),
      csvEscape(`${row.first_name} ${row.last_name}`),
      csvEscape(row.email),
      csvEscape(row.action),
      csvEscape(row.target_table),
      row.target_id ?? '',
    ].join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = {
  getDashboardStats,
  createAnnouncement,
  listUsers,
  getUserDetail,
  setUserActive,
  deleteUser,
  resetUserProgress,
  listResources,
  downloadResource,
  deleteResource,
  archiveResource,
  unarchiveResource,
  bulkResourceAction,
  listCourses,
  getCourseDetail,
  deleteCourse,
  archiveCourse,
  unarchiveCourse,
  listAnnouncements,
  updateAnnouncement,
  archiveAnnouncement,
  unarchiveAnnouncement,
  deleteAnnouncement,
  getAnalytics,
  listAuditLog,
  exportAuditLog,
};
