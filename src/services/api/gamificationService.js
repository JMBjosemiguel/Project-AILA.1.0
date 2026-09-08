import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

// XP / level / streak / achievement snapshot for the dashboard + profile widgets.
export function getGamificationSummary() {
  return apiClient.get(API_ENDPOINTS.gamification.summary);
}

// Full earned + locked achievement catalog with progress, for the Achievements page.
export function getAchievements() {
  return apiClient.get(API_ENDPOINTS.gamification.achievements);
}

// Opt-in leaderboard. period: 'weekly' | 'all_time'.
export function getLeaderboard(period = 'all_time') {
  return apiClient.get(API_ENDPOINTS.gamification.leaderboard, { params: { period } });
}
