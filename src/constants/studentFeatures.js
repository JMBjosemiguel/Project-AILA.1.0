// Whether students see XP, levels, the leaderboard and level achievements.
// One switch shared with the server (it also hides level notifications and
// level achievements there): backend/src/constants/studentFeatures.json.
// Default off. XP and levels are still earned and stored, so turning this on
// brings everything back.
import features from '../../backend/src/constants/studentFeatures.json';

export const SHOW_GAMIFICATION = features.showGamificationToStudents === true;

// Achievement categories that only measure XP/levels (not studying).
const XP_ONLY_CATEGORIES = new Set(['level']);

export function isStudyMilestone(achievement) {
  return !XP_ONLY_CATEGORIES.has(achievement?.category);
}
