'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

// Drive the gamification services in-process against the real local DB. No AI is
// involved anywhere in gamification (by design), so the only stub is notify —
// captured so we can assert "one notification per unlock, not per page load".
const notify = require('../../src/utils/notify');
const notifications = [];
notify.notifyUser = async (userId, options = {}) => { notifications.push({ userId, ...options }); };

// Guard: nothing in gamification may reach Gemini.
const gemini = require('../../src/services/geminiClient');
gemini.callGemini = async () => { throw new Error('gamification must never call Gemini'); };

const learningService = require('../../src/services/learningService');
const quizService = require('../../src/services/quizService');
const plannerService = require('../../src/services/plannerService');
const profileService = require('../../src/services/profileService');
const achievementService = require('../../src/services/achievementService');
const gamificationService = require('../../src/services/gamificationService');
const userModel = require('../../src/models/userModel');

const TAG = `qa.itest.gami.${Date.now()}`;
const subjectIds = [];
const userIds = [];

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix, { firstName = 'ITest', lastName = suffix } = {}) {
  const email = `${TAG}.${suffix}@example.com`;
  const r = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', ?, ?, 1)",
    [`G-${suffix}-${Date.now() % 100000}`, email, firstName, lastName]
  );
  await db.query('INSERT INTO user_profiles (user_id, xp_points, level) VALUES (?, 0, 1)', [r.insertId]);
  userIds.push(r.insertId);
  return { id: r.insertId, email };
}

// A course with one module / one topic / `lessonCount` lessons.
async function makeCourse(userId, lessonCount = 1) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [userId, `${TAG} course`]
  );
  subjectIds.push(s.insertId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [s.insertId, 'Module 1']);
  const tp = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, 'Topic 1']);
  const lessons = [];
  for (let i = 0; i < lessonCount; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, 'x', 'medium')", [tp.insertId, `Lesson ${i + 1}`]);
    lessons.push(l.insertId);
  }
  return { subjectId: s.insertId, topicId: tp.insertId, lessons };
}

async function makePracticeQuiz(userId, correctValue = 'a') {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 2)",
    [userId, `${TAG} quiz`]
  );
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q1', ?, ?, 'x', 0), (?, 'Q2', ?, ?, 'x', 1)",
    [q.insertId, JSON.stringify(['a', 'b']), correctValue, q.insertId, JSON.stringify(['a', 'b']), correctValue]
  );
  const questions = await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [q.insertId]);
  return { quizId: q.insertId, questionIds: questions.map((row) => row.id) };
}

async function takeQuiz(userId, quizId, questionIds, answers) {
  const start = await quizService.startAttempt(userId, quizId);
  for (let i = 0; i < questionIds.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await quizService.saveAttemptAnswer(userId, start.attempt.id, { questionId: questionIds[i], selectedAnswer: answers[i] });
  }
  return quizService.submitAttempt(userId, start.attempt.id);
}

const xpOf = async (userId) => Number((await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [userId]))[0].xp_points);
const ledgerCount = async (userId, key) => Number((await db.query('SELECT COUNT(*) c FROM xp_events WHERE user_id = ? AND event_key = ?', [userId, key]))[0].c);
const achievementSlugs = async (userId) => (await db.query(
  'SELECT a.slug FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY a.sort_order', [userId]
)).map((r) => r.slug);

async function wipeCourse(subjectId) {
  const tail = 'JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE lpr FROM lesson_progress lpr JOIN lessons l ON l.id=lpr.lesson_id ${tail}`, [subjectId]).catch(() => {});
  await db.query('DELETE lp FROM learning_progress lp JOIN topics t ON t.id=lp.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query(`DELETE l FROM lessons l ${tail}`, [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

test('gamification — achievements, streaks, leaderboard', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    for (const uid of userIds) {
      await db.query('DELETE FROM quiz_attempt_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ?)', [uid]).catch(() => {});
      await db.query('DELETE FROM quiz_attempts WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE qq FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id WHERE q.user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM quizzes WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM study_tasks WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM user_achievements WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM xp_events WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM dashboard_activity_log WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM notification_recipients WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM learning_streaks WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM user_profiles WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('first lesson completion unlocks "First Steps" once, with its one-time XP bonus', async () => {
    const A = await makeStudent('lesson');
    const { lessons } = await makeCourse(A.id, 1);
    notifications.length = 0;

    const res = await learningService.completeLesson(A.id, lessons[0]);
    assert.equal(res.xpAwarded, 10);
    assert.deepEqual(res.newAchievements.map((a) => a.slug), ['first_lesson']);
    assert.equal(res.newAchievements[0].xpReward, 5);

    // 10 (lesson) + 5 (achievement bonus)
    assert.equal(await xpOf(A.id), 15);
    assert.equal(await ledgerCount(A.id, 'achievement:first_lesson'), 1);
    assert.deepEqual(await achievementSlugs(A.id), ['first_lesson']);

    // Exactly one "Achievement unlocked" notification — not one per later read.
    const unlockNotifs = notifications.filter((n) => n.title === 'Achievement unlocked');
    assert.equal(unlockNotifs.length, 1);

    // A repeat completion is a no-op: no new achievement, no new XP.
    const again = await learningService.completeLesson(A.id, lessons[0]);
    assert.equal(again.alreadyCompleted, true);
    assert.equal(await xpOf(A.id), 15);
    assert.equal(await ledgerCount(A.id, 'achievement:first_lesson'), 1);

    // Re-evaluating the same trigger grants nothing new.
    const reEval = await achievementService.evaluateForEvent(A.id, ['lesson_completed']);
    assert.deepEqual(reEval, []);
  });

  await t.test('completing 10 unique lessons unlocks "Dedicated Learner"', async () => {
    const A = await makeStudent('ten');
    const { lessons } = await makeCourse(A.id, 10);

    let last;
    for (const lessonId of lessons) {
      // eslint-disable-next-line no-await-in-loop
      last = await learningService.completeLesson(A.id, lessonId);
    }
    const slugs = await achievementSlugs(A.id);
    assert.ok(slugs.includes('first_lesson'));
    assert.ok(slugs.includes('lessons_10'));
    assert.ok(last.newAchievements.some((a) => a.slug === 'lessons_10'), 'the 10th completion reports the unlock');
  });

  await t.test('submitting a practice quiz is a qualifying streak day and unlocks quiz achievements', async () => {
    const A = await makeStudent('quiz');
    const perfect = await makePracticeQuiz(A.id, 'a');

    const review = await takeQuiz(A.id, perfect.quizId, perfect.questionIds, ['a', 'a']);
    assert.equal(review.score, 2);
    const slugs = review.newAchievements.map((a) => a.slug);
    assert.ok(slugs.includes('first_quiz'));
    assert.ok(slugs.includes('perfect_quiz'));

    const streak = await db.query('SELECT current_streak FROM learning_streaks WHERE user_id = ?', [A.id]);
    assert.equal(streak[0].current_streak, 1, 'a quiz submission counts as a study day');

    // An imperfect quiz on another day would not re-award perfect_quiz; here just
    // confirm re-submitting logic grants nothing new.
    const imperfect = await makePracticeQuiz(A.id, 'a');
    const review2 = await takeQuiz(A.id, imperfect.quizId, imperfect.questionIds, ['a', 'b']);
    assert.deepEqual(review2.newAchievements, []);
  });

  await t.test('completing a planner task awards +5 XP once and counts as a streak day', async () => {
    const A = await makeStudent('task');
    const created = await plannerService.createTask(A.id, { title: `${TAG} real task` });

    const done = await plannerService.updateTask(A.id, created.id, { status: 'completed' });
    assert.equal(done.xpAwarded, 5);
    assert.equal(await ledgerCount(A.id, `task_completed:${created.id}`), 1);
    assert.equal((await db.query('SELECT current_streak FROM learning_streaks WHERE user_id = ?', [A.id]))[0].current_streak, 1);

    // Re-open and re-complete: no second XP award.
    await plannerService.updateTask(A.id, created.id, { status: 'pending' });
    const redone = await plannerService.updateTask(A.id, created.id, { status: 'completed' });
    assert.equal(redone.xpAwarded, 0);
    assert.equal(await ledgerCount(A.id, `task_completed:${created.id}`), 1);
    assert.equal(await xpOf(A.id), 5);
  });

  await t.test('concurrent evaluation of the same trigger grants each achievement exactly once', async () => {
    const A = await makeStudent('race');
    const { lessons } = await makeCourse(A.id, 1);
    await db.query('INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)', [A.id, lessons[0]]);

    const [r1, r2] = await Promise.all([
      achievementService.evaluateForEvent(A.id, ['lesson_completed']),
      achievementService.evaluateForEvent(A.id, ['lesson_completed']),
    ]);
    const combined = [...r1, ...r2].filter((a) => a.slug === 'first_lesson');
    assert.equal(combined.length, 1, 'only one of the two racers reports the unlock');
    assert.equal((await db.query('SELECT COUNT(*) c FROM user_achievements WHERE user_id = ? AND achievement_id = (SELECT id FROM achievements WHERE slug = ?)', [A.id, 'first_lesson']))[0].c, 1);
    assert.equal(await ledgerCount(A.id, 'achievement:first_lesson'), 1, 'the bonus XP is not double-awarded');
  });

  await t.test('historical reconciliation grants earned achievements with source=backfill and NO bonus XP', async () => {
    const A = await makeStudent('backfill');
    const { lessons } = await makeCourse(A.id, 1);
    // Seed history directly — as if it predated the achievements feature.
    await db.query('INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)', [A.id, lessons[0]]);
    await db.query("INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date) VALUES (?, 1, 8, CURRENT_DATE)", [A.id]);
    const xpBefore = await xpOf(A.id);

    const granted = await achievementService.reconcileUser(A.id);
    assert.ok(granted.includes('first_lesson'));
    assert.ok(granted.includes('streak_7'));

    const rows = await db.query('SELECT source FROM user_achievements WHERE user_id = ?', [A.id]);
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((r) => r.source === 'backfill'));
    assert.equal(await xpOf(A.id), xpBefore, 'backfill never inflates XP');
    assert.equal(await ledgerCount(A.id, 'achievement:first_lesson'), 0);
    assert.equal(await ledgerCount(A.id, 'achievement:streak_7'), 0);
  });

  await t.test('leaderboard: opt-in gated, ranked by the period, first-name + last-initial only', async () => {
    const opted1 = await makeStudent('lb1', { firstName: 'Alice', lastName: 'Alvarez' });
    const opted2 = await makeStudent('lb2', { firstName: 'Bruno', lastName: 'Bautista' });
    const hidden = await makeStudent('lb3', { firstName: 'Carmen', lastName: 'Cruz' });

    // Give them XP this week via real awards.
    const seedXp = async (userId, points, key) => {
      await db.query('INSERT INTO xp_events (user_id, event_key, points) VALUES (?, ?, ?)', [userId, key, points]);
      const total = Number((await db.query('SELECT COALESCE(SUM(points),0) s FROM xp_events WHERE user_id = ?', [userId]))[0].s);
      await db.query('UPDATE user_profiles SET xp_points = ?, level = ? WHERE user_id = ?', [total, Math.floor(total / 100) + 1, userId]);
    };
    await seedXp(opted1.id, 40, 'lesson_completed:x1');
    await seedXp(opted2.id, 90, 'lesson_completed:x2');
    await seedXp(hidden.id, 500, 'lesson_completed:x3');

    // Nobody opted in yet.
    let board = await gamificationService.getLeaderboard(opted1.id, 'all_time');
    assert.equal(board.entries.length, 0);
    assert.equal(board.me, null);

    await profileService.updateProfile(opted1.id, { leaderboard_opt_in: true });
    await profileService.updateProfile(opted2.id, { leaderboard_opt_in: true });

    board = await gamificationService.getLeaderboard(opted1.id, 'all_time');
    assert.deepEqual(board.entries.map((e) => e.displayName), ['Bruno B.', 'Alice A.']);
    assert.deepEqual(board.entries.map((e) => e.rank), [1, 2]);
    assert.equal(board.entries.find((e) => e.displayName === 'Carmen C.'), undefined, 'a hidden student never appears');
    assert.deepEqual(board.me, { rank: 2, xp: 40 });

    // No PII leaks in the payload.
    const serialized = JSON.stringify(board);
    assert.doesNotMatch(serialized, /Alvarez|Bautista|Cruz|@example\.com/);
    assert.doesNotMatch(serialized, new RegExp(`"${opted1.id}"|user_id|userId`));

    // Weekly board carries the same rows here (all XP is from this week).
    const weekly = await gamificationService.getLeaderboard(opted2.id, 'weekly');
    assert.equal(weekly.period, 'weekly');
    assert.deepEqual(weekly.me, { rank: 1, xp: 90 });
    assert.ok(weekly.weekStart);
  });

  await t.test('leaderboard weekly excludes legacy_balance; all-time includes it', async () => {
    const A = await makeStudent('legacy', { firstName: 'Dana', lastName: 'Dizon' });
    await db.query("INSERT INTO xp_events (user_id, event_key, points) VALUES (?, 'legacy_balance', 300)", [A.id]);
    await db.query("INSERT INTO xp_events (user_id, event_key, points) VALUES (?, 'lesson_completed:z', 10)", [A.id]);
    await db.query('UPDATE user_profiles SET xp_points = 310, level = 4 WHERE user_id = ?', [A.id]);
    await profileService.updateProfile(A.id, { leaderboard_opt_in: true });

    const allTime = await gamificationService.getLeaderboard(A.id, 'all_time');
    assert.equal(allTime.me.xp, 310);

    const weekly = await gamificationService.getLeaderboard(A.id, 'weekly');
    assert.equal(weekly.me.xp, 10, 'legacy_balance is not weekly XP');
  });

  await t.test('leaderboard rejects an unknown period', async () => {
    const A = await makeStudent('period');
    await assert.rejects(
      () => gamificationService.getLeaderboard(A.id, 'yearly'),
      (e) => e.statusCode === 400
    );
  });

  await t.test('summary exposes derived XP fields, streak, and achievement previews', async () => {
    const A = await makeStudent('summary');
    const { lessons } = await makeCourse(A.id, 1);
    await learningService.completeLesson(A.id, lessons[0]);

    const summary = await gamificationService.getSummary(A.id);
    assert.equal(summary.xp, 15);
    assert.equal(summary.level, 1);
    assert.equal(summary.xpIntoLevel, 15);
    assert.equal(summary.xpForNextLevel, 100);
    assert.equal(summary.progressPercent, 15);
    assert.equal(summary.streak.current, 1);
    assert.equal(summary.achievementCount, 1);
    assert.equal(summary.recentAchievements[0].slug, 'first_lesson');
    assert.ok(summary.nextAchievements.length > 0);
    assert.equal(summary.leaderboardOptIn, false);
  });

  await t.test('profile leaderboard opt-in is owner-persisted and reflected on the user record', async () => {
    const A = await makeStudent('optin');
    let user = await userModel.findUserById(A.id);
    assert.equal(user.profile.leaderboard_opt_in, false);

    await profileService.updateProfile(A.id, { leaderboard_opt_in: true });
    user = await userModel.findUserById(A.id);
    assert.equal(user.profile.leaderboard_opt_in, true);

    await profileService.updateProfile(A.id, { leaderboard_opt_in: false });
    user = await userModel.findUserById(A.id);
    assert.equal(user.profile.leaderboard_opt_in, false);
  });
});
