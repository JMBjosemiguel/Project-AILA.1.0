'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.dash.${Date.now()}`;

test('dashboard summary', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const student = await createStudent(TAG, 'a');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  await t.test('weekly activity chart counts only lesson/quiz/task completions', async () => {
    const rows = [
      ['lesson_completed', 'today'],
      ['quiz_completed', 'today'],
      ['task_completed', 'today'],
      // noise that must NOT be counted:
      ['resource_viewed', 'today'],
      ['resource_viewed', 'today'],
      ['resource_viewed', 'today'],
      ['xp_earned', 'today'],
      ['xp_earned', 'today'],
    ];
    for (const [type] of rows) {
      await db.query(
        'INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES (?, ?, 1, ?)',
        [student.id, type, `${TAG} ${type}`]
      );
    }

    const res = await api('GET', '/dashboard/summary', { token: student.token });
    assert.equal(res.status, 200);
    const totalCharted = (res.json.data.weeklyActivity || []).reduce((sum, day) => sum + day.count, 0);
    assert.equal(totalCharted, 3, 'only the 3 real learning events are charted, not the 5 noise rows');
  });

  await t.test('summary shape carries the personalized recommendation and continue-learning slot', async () => {
    const res = await api('GET', '/dashboard/summary', { token: student.token });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.recommendation);
    assert.ok('continueLearning' in res.json.data);
    assert.ok(Array.isArray(res.json.data.stats));
  });
});
