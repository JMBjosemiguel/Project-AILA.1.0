const achievementModel = require('../models/achievementModel');
const { awardXpOnce } = require('../utils/gamification');
const { notifyUser } = require('../utils/notify');

// A learning event -> the achievement categories worth re-checking. Nothing
// scans the whole catalog on a page load; evaluation only runs on real events.
const TRIGGER_CATEGORIES = {
  lesson_completed: ['learning'],
  quiz_submitted: ['learning'],
  checkpoint_passed: ['course'],
  course_final_passed: ['course'],
  streak_updated: ['streak'],
  level_changed: ['level'],
};

const ALL_CATEGORIES = ['learning', 'course', 'streak', 'level'];

function meetsCriteria(achievement, metrics) {
  switch (achievement.criteria_type) {
    case 'lessons_completed': return metrics.lessonsCompleted >= achievement.criteria_value;
    case 'first_quiz':        return metrics.hasSubmittedQuiz;
    case 'perfect_quiz':      return metrics.hasPerfectQuiz;
    case 'checkpoint_passed': return metrics.hasPassedCheckpoint;
    case 'course_completed':  return metrics.hasPassedFinal;
    case 'streak_days':       return metrics.streakDays >= achievement.criteria_value;
    case 'level_reached':     return metrics.level >= achievement.criteria_value;
    default: return false;
  }
}

// Simple, honest progress toward a *countable* achievement. Binary achievements
// ("Perfect Score", "Quiz Starter"…) return null — we never fake a fraction.
function progressFor(criteriaType, criteriaValue, metrics) {
  switch (criteriaType) {
    case 'lessons_completed': return { current: metrics.lessonsCompleted, target: criteriaValue };
    case 'streak_days':       return { current: metrics.streakDays, target: criteriaValue };
    case 'level_reached':     return { current: metrics.level, target: criteriaValue };
    default: return null;
  }
}

function serialize(a) {
  return {
    slug: a.slug,
    name: a.name,
    description: a.description,
    category: a.category,
    iconKey: a.icon_key,
    xpReward: a.xp_reward,
  };
}

/**
 * Grant any newly-qualifying achievements for one or more learning triggers,
 * inside the caller's transaction. Deterministic and loop-free:
 *   1. one metrics read, one "unearned in these categories" read
 *   2. grant each qualifying achievement once (INSERT IGNORE — UNIQUE guard)
 *   3. apply its one-time XP bonus via awardXpOnce
 *   4. if any bonus XP was awarded, re-check LEVEL achievements ONCE
 *      (level achievements have xp_reward = 0 → no further cascade)
 *   5. one notification per newly-earned achievement
 * Returns the newly-earned achievements (serialized) for the API response.
 */
async function evaluateForEvent(userId, triggers, connection = null, { notify = true } = {}) {
  const list = Array.isArray(triggers) ? triggers : [triggers];
  const categories = [...new Set(list.flatMap((t) => TRIGGER_CATEGORIES[t] || []))];
  if (!categories.length) return [];

  const newlyEarned = [];
  let metrics = await achievementModel.getUserMetrics(userId, connection);
  const candidates = await achievementModel.listUnearnedInCategories(userId, categories, connection);

  let awardedBonus = false;
  for (const a of candidates) {
    if (!meetsCriteria(a, metrics)) continue;
    if (!(await achievementModel.grantAchievement(userId, a.id, 'earned', connection))) continue;
    newlyEarned.push(a);
    if (a.xp_reward > 0) {
      const xp = await awardXpOnce(userId, { eventKey: `achievement:${a.slug}`, points: a.xp_reward, reason: `Achievement: ${a.name}` }, connection);
      if (xp.awarded > 0) awardedBonus = true;
    }
  }

  if (awardedBonus && !categories.includes('level')) {
    metrics = await achievementModel.getUserMetrics(userId, connection);
    const levelCandidates = await achievementModel.listUnearnedInCategories(userId, ['level'], connection);
    for (const a of levelCandidates) {
      if (meetsCriteria(a, metrics) && (await achievementModel.grantAchievement(userId, a.id, 'earned', connection))) {
        newlyEarned.push(a); // xp_reward 0 → stops here
      }
    }
  }

  if (notify) {
    for (const a of newlyEarned) {
      await notifyUser(userId, {
        type: 'system',
        title: 'Achievement unlocked',
        body: `You earned "${a.name}" — ${a.description}.`,
        connection,
      });
    }
  }

  return newlyEarned.map(serialize);
}

// --- historical reconciliation ----------------------------------------
// One-time, local: grant already-earned achievements from real history.
// NO bonus XP (avoids retroactive XP inflation) and NO notifications.
async function reconcileUser(userId) {
  const metrics = await achievementModel.getUserMetrics(userId);
  const candidates = await achievementModel.listUnearnedInCategories(userId, ALL_CATEGORIES);
  const granted = [];
  for (const a of candidates) {
    if (meetsCriteria(a, metrics) && (await achievementModel.grantAchievement(userId, a.id, 'backfill'))) {
      granted.push(a.slug);
    }
  }
  return granted;
}

async function reconcileAllUsers() {
  const ids = await achievementModel.listAllUserIds();
  const summary = { usersProcessed: ids.length, granted: {} };
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const slugs = await reconcileUser(id);
    if (slugs.length) summary.granted[id] = slugs;
  }
  return summary;
}

// --- read models for the summary / achievements page -----------------
async function getUserAchievementView(userId) {
  const [rows, metrics] = await Promise.all([
    achievementModel.listCatalogWithUserState(userId),
    achievementModel.getUserMetrics(userId),
  ]);
  const earned = [];
  const locked = [];
  for (const r of rows) {
    const base = {
      slug: r.slug, name: r.name, description: r.description, category: r.category,
      iconKey: r.icon_key, xpReward: r.xp_reward,
    };
    if (r.earned_at) {
      earned.push({ ...base, earnedAt: r.earned_at, source: r.source });
    } else {
      locked.push({ ...base, progress: progressFor(r.criteria_type, r.criteria_value, metrics) });
    }
  }
  return { earned, locked, earnedCount: earned.length, totalCount: rows.length, metrics };
}

module.exports = {
  evaluateForEvent,
  reconcileUser,
  reconcileAllUsers,
  getUserAchievementView,
  progressFor,
  meetsCriteria,
};
