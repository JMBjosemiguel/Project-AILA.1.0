import { getProfileData } from '../services/api/profileService';
import { useAsyncData } from './useAsyncData';

export function useProfileData(refreshKey) {
  return useAsyncData(getProfileData, [refreshKey]);
}
