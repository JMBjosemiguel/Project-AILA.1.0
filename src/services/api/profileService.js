import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getProfileData() {
  return apiClient.get(API_ENDPOINTS.users.profile);
}

export function updateProfile(updates) {
  return apiClient.patch(API_ENDPOINTS.users.profile, updates);
}

export function changePassword(currentPassword, newPassword) {
  return apiClient.patch(API_ENDPOINTS.users.password, {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
