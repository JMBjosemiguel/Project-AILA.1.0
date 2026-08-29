import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

function toQueryString(params = {}) {
  const usable = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return new URLSearchParams(usable).toString();
}

export function getAdminDashboard() {
  return apiClient.get(API_ENDPOINTS.admin.dashboard);
}

export function sendAnnouncement(title, body, targetType, targetValue) {
  return apiClient.post(API_ENDPOINTS.admin.announcements, {
    title, body, target_type: targetType || undefined, target_value: targetValue || undefined,
  });
}

// Users
export function listAdminUsers(params) {
  return apiClient.get(`${API_ENDPOINTS.admin.users}?${toQueryString(params)}`);
}

export function getAdminUserDetail(userId) {
  return apiClient.get(API_ENDPOINTS.admin.user(userId));
}

export function setUserActive(userId, isActive) {
  return apiClient.patch(API_ENDPOINTS.admin.user(userId), { is_active: isActive });
}

export function deleteAdminUser(userId) {
  return apiClient.delete(API_ENDPOINTS.admin.user(userId));
}

export function resetUserProgress(userId) {
  return apiClient.post(API_ENDPOINTS.admin.userResetProgress(userId));
}

// Resources
export function listAdminResources(params) {
  return apiClient.get(`${API_ENDPOINTS.admin.resources}?${toQueryString(params)}`);
}

export function deleteAdminResource(resourceId) {
  return apiClient.delete(API_ENDPOINTS.admin.resource(resourceId));
}

export function archiveAdminResource(resourceId) {
  return apiClient.post(API_ENDPOINTS.admin.resourceArchive(resourceId));
}

export function unarchiveAdminResource(resourceId) {
  return apiClient.post(API_ENDPOINTS.admin.resourceUnarchive(resourceId));
}

const INLINE_VIEWABLE_TYPES = ['pdf', 'image'];

export async function openAdminResourceFile(resourceId, fileName, type) {
  const viewableInline = INLINE_VIEWABLE_TYPES.includes(type);
  const newTab = viewableInline ? window.open('', '_blank') : null;

  try {
    const response = await apiClient.get(API_ENDPOINTS.admin.resourceDownload(resourceId), {
      responseType: 'blob',
    });
    const blob = response instanceof Blob ? response : new Blob([response]);
    const url = window.URL.createObjectURL(blob);

    if (viewableInline && newTab) {
      newTab.location.href = url;
    } else {
      newTab?.close();
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    }
  } catch (error) {
    newTab?.close();
    throw error;
  }
}

export async function downloadAdminResource(resourceId, fileName) {
  const response = await apiClient.get(API_ENDPOINTS.admin.resourceDownload(resourceId), {
    responseType: 'blob',
  });

  const blob = response instanceof Blob ? response : new Blob([response]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function bulkResourceAction(ids, action) {
  return apiClient.post(API_ENDPOINTS.admin.resourcesBulk, { ids, action });
}

// Feedback
export function listAdminFeedback(params) {
  return apiClient.get(`${API_ENDPOINTS.admin.feedback}?${toQueryString(params)}`);
}

export function getAdminFeedbackAnalytics() {
  return apiClient.get(API_ENDPOINTS.admin.feedbackAnalytics);
}

export function updateAdminFeedback(feedbackId, { adminNotes, status }) {
  return apiClient.patch(API_ENDPOINTS.admin.feedbackEntry(feedbackId), { admin_notes: adminNotes, status });
}

export function archiveAdminFeedback(feedbackId) {
  return apiClient.post(API_ENDPOINTS.admin.feedbackArchive(feedbackId));
}

export function unarchiveAdminFeedback(feedbackId) {
  return apiClient.post(API_ENDPOINTS.admin.feedbackUnarchive(feedbackId));
}

export function deleteAdminFeedback(feedbackId) {
  return apiClient.delete(API_ENDPOINTS.admin.feedbackEntry(feedbackId));
}

export function restoreAdminFeedback(feedbackId) {
  return apiClient.post(API_ENDPOINTS.admin.feedbackRestore(feedbackId));
}

// Learning management
export function listAdminCourses(params) {
  return apiClient.get(`${API_ENDPOINTS.admin.learning}?${toQueryString(params)}`);
}

export function getAdminCourseDetail(courseId) {
  return apiClient.get(API_ENDPOINTS.admin.learningCourse(courseId));
}

export function deleteAdminCourse(courseId) {
  return apiClient.delete(API_ENDPOINTS.admin.learningCourse(courseId));
}

export function archiveAdminCourse(courseId) {
  return apiClient.post(API_ENDPOINTS.admin.learningArchive(courseId));
}

export function unarchiveAdminCourse(courseId) {
  return apiClient.post(API_ENDPOINTS.admin.learningUnarchive(courseId));
}

// Analytics
export function getAdminAnalytics() {
  return apiClient.get(API_ENDPOINTS.admin.analytics);
}

// Audit log
export function listAuditLog(params) {
  return apiClient.get(`${API_ENDPOINTS.admin.auditLog}?${toQueryString(params)}`);
}

export async function exportAuditLog(params) {
  const response = await apiClient.get(`${API_ENDPOINTS.admin.auditLogExport}?${toQueryString(params)}`, { responseType: 'blob' });
  const blob = response instanceof Blob ? response : new Blob([response]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Announcements management
export function listAnnouncements(params) {
  return apiClient.get(`${API_ENDPOINTS.admin.announcementsList}?${toQueryString(params)}`);
}

export function updateAnnouncement(id, { title, body }) {
  return apiClient.patch(API_ENDPOINTS.admin.announcement(id), { title, body });
}

export function archiveAnnouncement(id) {
  return apiClient.post(API_ENDPOINTS.admin.announcementArchive(id));
}

export function unarchiveAnnouncement(id) {
  return apiClient.post(API_ENDPOINTS.admin.announcementUnarchive(id));
}

export function deleteAnnouncement(id) {
  return apiClient.delete(API_ENDPOINTS.admin.announcement(id));
}

