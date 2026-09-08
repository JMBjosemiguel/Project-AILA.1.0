import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

// --- owner: manage share links ---

export function getShareStatus(materialType, materialId) {
  return apiClient.get(API_ENDPOINTS.materials.share(materialType, materialId));
}

// Creates (or replaces) the unlisted link. Returns { token, sharePath, ... };
// the token is only ever returned here.
export function createShare(materialType, materialId) {
  return apiClient.post(API_ENDPOINTS.materials.share(materialType, materialId), { visibility: 'unlisted' });
}

export function revokeShare(materialType, materialId) {
  return apiClient.delete(API_ENDPOINTS.materials.share(materialType, materialId));
}

// --- recipient / public ---

// Read-only view of a shared material. Works logged-out.
export function viewSharedMaterial(token) {
  return apiClient.get(API_ENDPOINTS.share.view(token));
}

// Copy the shared material into the authenticated recipient's own materials.
export function copySharedMaterial(token) {
  return apiClient.post(API_ENDPOINTS.share.copy(token));
}

// Build the full, shareable URL from a relative share path.
export function absoluteShareUrl(sharePath) {
  return `${window.location.origin}${sharePath}`;
}
