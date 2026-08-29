import { getResourceLibraryData } from '../services/api/resourceService';
import { useAsyncData } from './useAsyncData';

export function useResourceLibraryData(refreshKey) {
  return useAsyncData(getResourceLibraryData, [refreshKey]);
}
