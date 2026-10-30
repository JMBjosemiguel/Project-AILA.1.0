'use strict';
/*
 * Study focus: with gamification hidden from students (the default,
 * constants/studentFeatures.json), the API leaves out level notifications
 * and level achievements while XP and levels are still stored. Admins get
 * study stats (lessons completed, average quiz score) instead of Level / XP.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, loginAdmin, createStudent, purgeByTag } = require('./helpers');
const { notifyUser } = require('../../src/utils/notify');
const adminAnalyticsModel = require('../../src/models/adminAnalyticsModel');
const { SHOW_GAMIFICATION_TO_STUDENTS } = require('../../src/utils/studentGamification');

const TAG = `qa.itest.studyfocus.${Date.now()}`;

test('study focus — gamification hidden from students, study stats for admins', async (t) => {
  if (!(await serverReachable())) {
    t.skip('backend not reachable on localhost:5000');
    return;
  }
  assert.equal(SHOW_GAMIFICATION_TO_STUDENTS, false, 'these checks are for the default (hidden)');

  const admin = await loginAdmin();
  const S = await createStudent(TAG, 'student');
  const notificationIds = [];

  t.after(async () => {
    for (const id of notificationIds) {
      await db.query('DELETE FROM notification_recipients WHERE notification_id = ?', [id]).catch(() => {});
      await db.query('DELETE FROM notifications WHERE id = ?', [id]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('notifications: level ones are hidden, XP text dropped, achievements shown as study milestones', async () => {
    for (const n of [
      { title: 'Level up!', body: 'You reached Level 2. Keep up the momentum.' },
      { title: 'Progress: Level 3 reached', body: 'Your lessons, quizzes and tasks brought you to Level 3.' },
      { title: 'Achievement unlocked', body: 'You earned "Rising Scholar" — Reach Level 5.' },
      { title: 'Achievement earned', body: 'You earned "First Steps" — Complete your first lesson.' },
      { title: 'Lesson completed', body: 'You completed "Cells". +10 XP earned.' },
    ]) {
      notificationIds.push(await notifyUser(S.id, { type: 'system', ...n }));
    }

    const res = await api('GET', '/notifications', { token: S.token });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const { notifications, unreadCount } = res.json.data;
    const mine = notifications.filter((n) => notificationIds.includes(n.id));
    assert.deepEqual(mine.map((n) => n.title).sort(), ['Lesson completed', 'Study milestone reached']);
    assert.equal(mine.find((n) => n.title === 'Lesson completed').body, 'You completed "Cells".');
    assert.ok(!notifications.some((n) => /level/i.test(`${n.title} ${n.body}`) && n.type === 'system'));
    assert.equal(unreadCount, notifications.filter((n) => !n.is_read).length, 'the unread count matches what is shown');

    const stored = await db.query('SELECT COUNT(*) AS c FROM notification_recipients WHERE user_id = ?', [S.id]);
    assert.ok(Number(stored[0].c) >= 5, 'nothing was deleted, only hidden');
  });

  await t.test('achievements: level achievements are left out of the list and the counts; XP and level still stored', async () => {
    await db.query(
      "INSERT INTO user_achievements (user_id, achievement_id) SELECT ?, id FROM achievements WHERE slug IN ('level_5', 'first_lesson')",
      [S.id]
    );
    const catalog = await db.query("SELECT category, COUNT(*) AS c FROM achievements GROUP BY category");
    const studyTotal = catalog.filter((r) => r.category !== 'level').reduce((sum, r) => sum + Number(r.c), 0);

    const list = await api('GET', '/gamification/achievements', { token: S.token });
    assert.equal(list.status, 200, JSON.stringify(list.json));
    const all = [...list.json.data.earned, ...list.json.data.locked];
    assert.ok(!all.some((a) => a.category === 'level'));
    assert.equal(list.json.data.totalCount, studyTotal);
    assert.deepEqual(list.json.data.earned.map((a) => a.slug), ['first_lesson']);
    assert.equal(list.json.data.earnedCount, 1);

    const summary = await api('GET', '/gamification/summary', { token: S.token });
    assert.equal(summary.status, 200);
    assert.equal(summary.json.data.totalAchievements, studyTotal);
    assert.equal(summary.json.data.achievementCount, 1);
    assert.ok(!summary.json.data.recentAchievements.some((a) => a.category === 'level'));
    assert.equal(typeof summary.json.data.xp, 'number', 'XP is still computed');
    assert.equal(typeof summary.json.data.level, 'number', 'the level is still computed');

    const stored = await db.query('SELECT COUNT(*) AS c FROM user_achievements WHERE user_id = ?', [S.id]);
    assert.equal(Number(stored[0].c), 2, 'the level achievement is still stored');
  });

  await t.test('admin Users list and most active students use study stats', async () => {
    const quiz = await db.query("INSERT INTO quizzes (user_id, topic, item_count, source_type) VALUES (?, ?, 4, 'lesson')", [S.id, `${TAG} quiz`]);
    const chat = await db.query("INSERT INTO quizzes (user_id, topic, item_count, source_type) VALUES (?, ?, 4, 'chat')", [S.id, `${TAG} chat`]);
    const attempt = (quizId, score, status) => db.query(
      "INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, completed_at) VALUES (?, ?, ?, 4, ?, IF(? = 'submitted', NOW(), NULL))",
      [quizId, S.id, score, status, status]
    );
    await attempt(quiz.insertId, 3, 'submitted');
    await attempt(quiz.insertId, 1, 'submitted');
    await attempt(quiz.insertId, 0, 'in_progress'); // not finished: not counted
    await attempt(chat.insertId, 0, 'submitted'); // chat quiz: not counted

    const users = await api('GET', `/admin/users?search=${encodeURIComponent(S.email)}`, { token: admin });
    assert.equal(users.status, 200, JSON.stringify(users.json));
    const row = users.json.data.users.find((u) => u.id === S.id);
    assert.equal(Number(row.lessons_completed), 0);
    assert.equal(Number(row.avg_quiz_score), 50, '(75% + 25%) / 2, submitted non-chat attempts only');

    const detail = await api('GET', `/admin/users/${S.id}`, { token: admin });
    assert.equal(detail.status, 200);
    assert.equal(Number(detail.json.data.quizAverage), 50, 'user details use the same quiz average');

    const active = await adminAnalyticsModel.getMostActiveStudents(100000);
    const me = active.find((s) => s.id === S.id);
    assert.deepEqual(
      { lessons: me.lessons_completed, quizzes: me.quizzes_completed, avg: me.avg_quiz_score },
      { lessons: 0, quizzes: 2, avg: 50 }
    );
    assert.ok(!('xp_points' in me) && !('level' in me));
    for (let i = 1; i < active.length; i += 1) {
      const score = (s) => s.lessons_completed + s.quizzes_completed;
      assert.ok(score(active[i - 1]) >= score(active[i]), 'ordered by lessons + quizzes completed');
    }

    const analytics = await api('GET', '/admin/analytics', { token: admin });
    assert.equal(analytics.status, 200);
    for (const s of analytics.json.data.activeStudents) {
      assert.deepEqual(Object.keys(s).sort(), ['avg_quiz_score', 'first_name', 'id', 'last_name', 'lessons_completed', 'quizzes_completed']);
    }
  });
});
