import { getNotificationsData } from '../services/api/notificationService';
import { useAsyncData } from './useAsyncData';

export function useNotificationsData(refreshKey) {
  return useAsyncData(getNotificationsData, [refreshKey]);
}
