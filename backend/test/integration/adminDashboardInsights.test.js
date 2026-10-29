'use strict';
/*
 * Admin dashboard "Needs attention" insights — students who may need help,
 * pending-feedback / unverified-24h counts, and the active-students-per-day
 * chart. These are read-only aggregate queries over qa.itest fixtures mixed
 * into the real local dataset, so most assertions are delta-based (before
 * vs. after) rather than absolute counts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, loginAdmin, createStudent, purgeByTag } = require('./helpers');
const adminModel = require('../../src/models/adminModel');
const { appDateStr } = require('../../src/utils/appTime');

const TAG = `qa.itest.dashinsights.${Date.now()}`;

async function setStreak(userId, lastActiveDate) {
  await db.query(
    'INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date) VALUES (?, 1, 1, ?)',
    [userId, lastActiveDate]
  );
}

async function addQuizAttempts(userId, scores) {
  const quiz = await db.query(
    "INSERT INTO quizzes (user_id, topic, item_count) VALUES (?, 'qa.itest topic', 10)",
    [userId]
  );
  const quizId = quiz.insertId;
  for (const score of scores) {
    await db.query(
      "INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, completed_at) VALUES (?, ?, ?, 10, 'submitted', NOW())",
      [quizId, userId, score]
    );
  }
  return quizId;
}

test('admin dashboard insights', async (t) => {
  if (!(await serverReachable())) {
    t.skip('backend not reachable on localhost:5000');
    return;
  }

  const admin = await loginAdmin();
  const quizIds = [];

  const neverActive = await createStudent(TAG, 'neveractive');
  const staleActive = await createStudent(TAG, 'staleactive');
  const lowScorer = await createStudent(TAG, 'lowscorer');
  const healthy = await createStudent(TAG, 'healthy');
  const inactiveButUnverified = await createStudent(TAG, 'unverified');
  const inactiveButDeactivated = await createStudent(TAG, 'deactivated');

  t.after(async () => {
    for (const quizId of quizIds) {
      await db.query('DELETE FROM quiz_attempts WHERE quiz_id = ?', [quizId]).catch(() => {});
      await db.query('DELETE FROM quizzes WHERE id = ?', [quizId]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  // neverActive: verified + active, no learning_streaks row, no quiz attempts at all.
  // staleActive: last activity 10 days ago (past the 7-day cutoff).
  await setStreak(staleActive.id, appDateStr(Date.now() - 10 * 24 * 60 * 60 * 1000));
  // lowScorer: active today (so inactivity doesn't also flag it), but a weak recent quiz average.
  await setStreak(lowScorer.id, appDateStr());
  quizIds.push(await addQuizAttempts(lowScorer.id, [2, 3, 2, 3, 2])); // 20-30% avg, well under 60%
  // healthy: active today, strong quiz average — must never show up.
  await setStreak(healthy.id, appDateStr());
  quizIds.push(await addQuizAttempts(healthy.id, [9, 10, 8, 9, 10])); // ~90% avg

  // inactiveButUnverified: matches the inactivity signal, but never verified.
  await db.query('UPDATE users SET email_verified_at = NULL WHERE id = ?', [inactiveButUnverified.id]);
  // inactiveButDeactivated: matches the inactivity signal, but the account is deactivated.
  await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [inactiveButDeactivated.id]);

  await t.test('getStudentsNeedingHelp flags inactivity and low scores, with the right reason text', async () => {
    const { students } = await adminModel.getStudentsNeedingHelp(1000);
    const byId = new Map(students.map((s) => [s.id, s]));

    assert.equal(byId.get(neverActive.id)?.reason, 'No learning activity recorded yet');
    assert.match(byId.get(staleActive.id)?.reason ?? '', /^No activity for \d+ days$/);
    assert.match(byId.get(lowScorer.id)?.reason ?? '', /^Recent quiz average \d+%$/);
  });

  await t.test('a healthy student (active today, strong scores) is never flagged', async () => {
    const { students } = await adminModel.getStudentsNeedingHelp(1000);
    assert.ok(!students.some((s) => s.id === healthy.id));
  });

  await t.test('unverified and deactivated students are excluded even though they are inactive', async () => {
    const { students } = await adminModel.getStudentsNeedingHelp(1000);
    assert.ok(!students.some((s) => s.id === inactiveButUnverified.id));
    assert.ok(!students.some((s) => s.id === inactiveButDeactivated.id));
  });

  await t.test('getStudentsNeedingHelp caps the displayed list but reports the true total', async () => {
    const capped = await adminModel.getStudentsNeedingHelp(2);
    assert.equal(capped.students.length, 2);
    assert.ok(capped.total >= 3); // at least neverActive, staleActive, lowScorer
  });

  await t.test('getFeedbackPendingCount counts pending feedback, not resolved', async () => {
    const before = await adminModel.getFeedbackPendingCount();
    const pending = await db.query(
      "INSERT INTO feedback (user_id, rating, comment, status) VALUES (?, 3, ?, 'pending')",
      [neverActive.id, `${TAG} pending feedback`]
    );
    const afterPending = await adminModel.getFeedbackPendingCount();
    assert.equal(afterPending, before + 1);

    await db.query(
      "INSERT INTO feedback (user_id, rating, comment, status) VALUES (?, 5, ?, 'resolved')",
      [neverActive.id, `${TAG} resolved feedback`]
    );
    const afterResolved = await adminModel.getFeedbackPendingCount();
    assert.equal(afterResolved, afterPending);

    await db.query('DELETE FROM feedback WHERE id = ?', [pending.insertId]).catch(() => {});
  });

  await t.test('getUnverifiedOver24hCount only counts accounts older than 24h', async () => {
    const before = await adminModel.getUnverifiedOver24hCount();

    const old = await createStudent(TAG, 'old24h');
    await db.query(
      'UPDATE users SET email_verified_at = NULL, created_at = NOW() - INTERVAL 25 HOUR WHERE id = ?',
      [old.id]
    );
    const afterOld = await adminModel.getUnverifiedOver24hCount();
    assert.equal(afterOld, before + 1);

    const recent = await createStudent(TAG, 'recent1h');
    await db.query(
      'UPDATE users SET email_verified_at = NULL, created_at = NOW() - INTERVAL 1 HOUR WHERE id = ?',
      [recent.id]
    );
    const afterRecent = await adminModel.getUnverifiedOver24hCount();
    assert.equal(afterRecent, afterOld);
  });

  await t.test('getActiveStudentsByDay is zero-filled for 7 days and reflects today\'s activity', async () => {
    const before = await adminModel.getActiveStudentsByDay(7);
    assert.equal(before.length, 7);

    await db.query(
      "INSERT INTO dashboard_activity_log (user_id, activity_type, description) VALUES (?, 'lesson_completed', ?)",
      [neverActive.id, `${TAG} activity`]
    );
    const after = await adminModel.getActiveStudentsByDay(7);
    const today = appDateStr();
    const beforeToday = before.find((d) => d.date === today).count;
    const afterToday = after.find((d) => d.date === today).count;
    assert.equal(afterToday, beforeToday + 1);
    // every day in the window is present, even with zero activity
    for (const row of after) assert.equal(typeof row.count, 'number');
  });

  await t.test('getTabSwitchAttempts lists recent attempts with tab switches, newest first', async () => {
    const before = await adminModel.getTabSwitchAttempts(7, 1000);
    const quiz = await db.query("INSERT INTO quizzes (user_id, topic, item_count, source_type) VALUES (?, 'qa.itest tabs', 10, 'lesson')", [lowScorer.id]);
    const chat = await db.query("INSERT INTO quizzes (user_id, topic, item_count, source_type) VALUES (?, 'qa.itest chat', 10, 'chat')", [lowScorer.id]);
    quizIds.push(quiz.insertId, chat.insertId);
    const attempt = (quizId, tabs, startedAgo, completedAgo) => db.query(
      `INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, tab_switch_count, started_at, completed_at)
       VALUES (?, ?, 6, 10, 'submitted', ?, NOW() - INTERVAL ? MINUTE, NOW() - INTERVAL ? MINUTE)`,
      [quizId, lowScorer.id, tabs, startedAgo, completedAgo]
    );
    const older = await attempt(quiz.insertId, 2, 120, 110);
    const newer = await attempt(quiz.insertId, 14, 60, 55);
    await attempt(quiz.insertId, 0, 50, 45); // never left the quiz
    await attempt(quiz.insertId, 5, 8 * 24 * 60, 8 * 24 * 60 - 5); // 8 days ago
    await attempt(chat.insertId, 3, 40, 35); // chat quiz

    const after = await adminModel.getTabSwitchAttempts(7, 1000);
    assert.equal(after.total - before.total, 2, 'only the two recent non-chat attempts with switches');
    const mine = after.attempts.filter((row) => row.user_id === lowScorer.id);
    assert.deepEqual(mine.map((row) => row.id), [newer.insertId, older.insertId], 'newest first');
    assert.equal(mine[0].tab_switch_count, 14);
    assert.equal(mine[0].topic, 'qa.itest tabs');
    assert.equal(mine[0].first_name, 'ITest');
    assert.equal(mine[0].last_name, 'lowscorer');
    assert.equal(Number(mine[0].score), 6);
    assert.equal(Number(mine[0].total), 10);

    const capped = await adminModel.getTabSwitchAttempts(7, 1);
    assert.equal(capped.attempts.length, 1);
    assert.equal(capped.total, after.total, 'the count is not capped by the list limit');
  });

  await t.test('GET /admin/dashboard exposes the new fields with the right shape', async () => {
    const res = await api('GET', '/admin/dashboard', { token: admin });
    assert.equal(res.status, 200);
    const data = res.json.data;
    assert.equal(typeof data.needsAttention.feedbackPending, 'number');
    assert.equal(typeof data.needsAttention.unverifiedOver24h, 'number');
    assert.equal(typeof data.needsAttention.studentsNeedingHelp, 'number');
    assert.ok(Array.isArray(data.studentsNeedingHelp));
    assert.ok(data.studentsNeedingHelp.length <= 5);
    assert.ok(Array.isArray(data.activeStudentsByDay));
    assert.equal(data.activeStudentsByDay.length, 7);
    assert.equal(typeof data.needsAttention.tabSwitchAttempts, 'number');
    assert.ok(Array.isArray(data.tabSwitchAttempts));
    assert.ok(data.tabSwitchAttempts.some((row) => row.user_id === lowScorer.id && row.tab_switch_count === 14));
  });
});
