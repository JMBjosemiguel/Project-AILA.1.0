import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getResourceLibraryData({ search = '', type = 'all', sort = 'title' } = {}) {
  const params = new URLSearchParams({ search, type, sort });
  return apiClient.get(`${API_ENDPOINTS.resources.resources}?${params.toString()}`);
}

export function logResourceView(resourceId) {
  return apiClient.post(API_ENDPOINTS.resources.view(resourceId));
}

export function uploadResource(file, subjectId) {
  const formData = new FormData();
  formData.append('file', file);
  if (subjectId) formData.append('subject_id', subjectId);

  return apiClient.post(API_ENDPOINTS.resources.upload, formData);
}

export function addLinkResource(url, title, subjectId) {
  return apiClient.post(API_ENDPOINTS.resources.link, {
    url,
    title: title || undefined,
    subject_id: subjectId || undefined,
  });
}

export function updateResource(resourceId, { title, subjectId }) {
  const payload = {};
  if (title !== undefined) payload.title = title;
  if (subjectId !== undefined) payload.subject_id = subjectId;
  return apiClient.patch(API_ENDPOINTS.resources.resource(resourceId), payload);
}

export function deleteResource(resourceId) {
  return apiClient.delete(API_ENDPOINTS.resources.resource(resourceId));
}

const INLINE_VIEWABLE_TYPES = ['pdf', 'image'];

export async function openResourceFile(resourceId, fileName, type) {
  const viewableInline = INLINE_VIEWABLE_TYPES.includes(type);
  const newTab = viewableInline ? window.open('', '_blank') : null;

  try {
    const response = await apiClient.get(API_ENDPOINTS.resources.download(resourceId), {
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

export async function downloadResource(resourceId, fileName) {
  const response = await apiClient.get(API_ENDPOINTS.resources.download(resourceId), {
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
