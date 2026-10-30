// What students see of XP, levels and the leaderboard. There is no settings
// table, so this is one config constant shared with the frontend
// (constants/studentFeatures.json, default off). Off only HIDES things from
// students: XP, levels, level achievements and notifications are still
// computed and stored exactly as before, so turning it on restores them all.
const { showGamificationToStudents } = require('../constants/studentFeatures.json');

const SHOW_GAMIFICATION_TO_STUDENTS = showGamificationToStudents === true;

// Achievement categories that only measure XP/levels (not studying).
const XP_ONLY_CATEGORIES = new Set(['level']);

const LEVEL_TITLE = /^(level up!?|progress: level \d+ reached)$/i;
const ACHIEVEMENT_TITLE = /^achievement (unlocked|earned)$/i;
const LEVEL_ACHIEVEMENT_BODY = /reach level \d+/i;
const XP_SUFFIX = /\s*\+\d+\s*XP earned\.?/i;

function isStudyMilestone(achievement) {
  return !XP_ONLY_CATEGORIES.has(achievement?.category);
}

// Only the server's own 'system' notifications; announcements are never touched.
function isLevelNotification(notification) {
  if (notification?.type !== 'system') return false;
  const title = notification.title || '';
  return LEVEL_TITLE.test(title)
    || (ACHIEVEMENT_TITLE.test(title) && LEVEL_ACHIEVEMENT_BODY.test(notification?.body || ''));
}

// A student's notification list as they should see it: level notifications
// left out, "+N XP earned." dropped from the text and achievements titled as
// study milestones. Stored rows are untouched.
function studentNotifications(notifications, show = SHOW_GAMIFICATION_TO_STUDENTS) {
  if (show) return notifications;
  return notifications
    .filter((n) => !isLevelNotification(n))
    .map((n) => {
      if (n.type !== 'system') return n;
      let next = n;
      if (XP_SUFFIX.test(n.body || '')) next = { ...next, body: n.body.replace(XP_SUFFIX, '') };
      if (ACHIEVEMENT_TITLE.test(n.title || '')) next = { ...next, title: 'Study milestone reached' };
      return next;
    });
}

module.exports = {
  SHOW_GAMIFICATION_TO_STUDENTS,
  isStudyMilestone,
  isLevelNotification,
  studentNotifications,
};
