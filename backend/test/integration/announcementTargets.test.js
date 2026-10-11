'use strict';
/*
 * Announcement targeting was narrowed to Everyone / Specific student / Role.
 * 'course' and 'year_level' are rejected for new announcements, but existing
 * rows created with those target types (back when they were allowed) must
 * keep displaying correctly — see adminValidator.js's announcementValidator
 * and src/pages/admin/Settings/index.jsx's targetLabel().
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, loginAdmin, purgeByTag } = require('./helpers');

const TAG = `qa.itest.anntargets.${Date.now()}`;

test('announcement targeting: course/year_level rejected, legacy rows still display', async (t) => {
  if (!(await serverReachable())) {
    t.skip('backend not reachable on localhost:5000');
    return;
  }

  const adminToken = await loginAdmin();
  let legacyNotificationId;

  t.after(async () => {
    if (legacyNotificationId) {
      await db.query('DELETE FROM notification_recipients WHERE notification_id = ?', [legacyNotificationId]).catch(() => {});
      await db.query('DELETE FROM notifications WHERE id = ?', [legacyNotificationId]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('new announcement with target_type=course is rejected', async () => {
    const res = await api('POST', '/admin/announcements', {
      token: adminToken,
      body: { title: `${TAG} course target`, body: 'body', target_type: 'course', target_value: '1' },
    });
    assert.equal(res.status, 422);
  });

  await t.test('new announcement with target_type=year_level is rejected', async () => {
    const res = await api('POST', '/admin/announcements', {
      token: adminToken,
      body: { title: `${TAG} year target`, body: 'body', target_type: 'year_level', target_value: '1' },
    });
    assert.equal(res.status, 422);
  });

  await t.test('target_type=all/user/role still work', async () => {
    const res = await api('POST', '/admin/announcements', {
      token: adminToken,
      body: { title: `${TAG} everyone`, body: 'body', target_type: 'all' },
    });
    assert.equal(res.status, 201);
    assert.ok(res.json.data.notified > 0);
  });

  await t.test('a legacy course/year_level row (already in the DB) still lists correctly', async () => {
    // Simulate a row created before this change — the DB enum still allows
    // it (no schema change), only the HTTP validator now rejects new ones.
    const insert = await db.query(
      `INSERT INTO notifications (type, title, body, target_type, target_value) VALUES ('announcement', ?, 'legacy body', 'course', '1')`,
      [`${TAG} legacy course`]
    );
    legacyNotificationId = insert.insertId;

    const res = await api('GET', `/admin/announcements/list?search=${encodeURIComponent(TAG)}&pageSize=50`, { token: adminToken });
    assert.equal(res.status, 200);
    const row = res.json.data.announcements.find((a) => a.id === legacyNotificationId);
    assert.ok(row, 'legacy announcement should still be listed');
    assert.equal(row.target_type, 'course');
    assert.equal(row.target_value, '1');
  });
});
