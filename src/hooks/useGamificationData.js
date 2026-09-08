import { getAchievements, getGamificationSummary, getLeaderboard } from '../services/api/gamificationService';
import { useAsyncData } from './useAsyncData';

export function useGamificationSummary(refreshKey) {
  return useAsyncData(getGamificationSummary, [refreshKey]);
}

export function useAchievementsData(refreshKey) {
  return useAsyncData(getAchievements, [refreshKey]);
}

export function useLeaderboardData(period, refreshKey) {
  return useAsyncData(() => getLeaderboard(period), [period, refreshKey]);
}
