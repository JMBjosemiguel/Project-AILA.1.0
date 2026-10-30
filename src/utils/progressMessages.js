import { SHOW_GAMIFICATION, isStudyMilestone } from '../constants/studentFeatures';

// Toast wording for XP side effects (level reached, achievement earned). Kept
// calm and study-focused; the XP and achievement features themselves are
// unchanged.
export function levelReachedMessage(level) {
  return `Progress: Level ${level} reached.`;
}

export function achievementEarnedMessage(name, show = SHOW_GAMIFICATION) {
  return show ? `Achievement earned: ${name}` : `Study milestone reached: ${name}`;
}

// " +N XP earned." after a completion toast, or nothing while XP is hidden.
export function xpEarnedSuffix(xp, show = SHOW_GAMIFICATION) {
  return show && xp > 0 ? ` +${xp} XP earned.` : '';
}

// The follow-up toasts after a lesson, quiz or task completes: the level
// reached (only while gamification is shown) and each new achievement (XP /
// level achievements left out while it's hidden).
export function progressToastMessages(result, show = SHOW_GAMIFICATION) {
  const messages = [];
  if (show && result?.leveledUp) messages.push(levelReachedMessage(result.level));
  (result?.newAchievements ?? [])
    .filter((a) => show || isStudyMilestone(a))
    .forEach((a) => messages.push(achievementEarnedMessage(a.name, show)));
  return messages;
}
