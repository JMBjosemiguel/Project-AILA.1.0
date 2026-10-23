'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, createAdmin, loginAdmin, purgeByTag } = require('./helpers');
const adminService = require('../../src/services/adminService');

const TAG = `qa.itest.demote.${Date.now()}`;

test('demote to student', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const rootAdminToken = await loginAdmin();

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('demotion succeeds, writes an audit row, and the demoted user\'s /auth/me returns student', async () => {
    const admin = await createAdmin(TAG, 'ok');
    // A second admin keeps the "at least one admin" guard from blocking this.
    await createAdmin(TAG, 'ok-keeper');

    const demote = await api('PATCH', `/admin/users/${admin.id}/demote`, { token: rootAdminToken });
    assert.equal(demote.status, 200, JSON.stringify(demote.json));

    const me = await api('GET', '/auth/me', { token: admin.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.data.user.role, 'student');

    const [auditRow] = await db.query(
      "SELECT target_table, target_id, details FROM admin_audit_log WHERE target_table = 'users' AND target_id = ? AND action = 'user.demote_to_student' ORDER BY id DESC LIMIT 1",
      [admin.id]
    );
    assert.ok(auditRow, 'expected a user.demote_to_student audit row');
    assert.equal(auditRow.target_table, 'users');
    assert.equal(auditRow.target_id, admin.id);
    const details = JSON.parse(auditRow.details);
    assert.equal(details.fromRole, 'admin');
    assert.equal(details.toRole, 'student');
  });

  await t.test('the account, its data and verification status are untouched — only the role changes', async () => {
    const admin = await createAdmin(TAG, 'preserve');
    await createAdmin(TAG, 'preserve-keeper');

    const [before] = await db.query('SELECT id, email, email_verified_at, is_active FROM users WHERE id = ?', [admin.id]);
    const demote = await api('PATCH', `/admin/users/${admin.id}/demote`, { token: rootAdminToken });
    assert.equal(demote.status, 200);
    const [after] = await db.query('SELECT id, email, email_verified_at, is_active FROM users WHERE id = ?', [admin.id]);

    assert.equal(after.id, before.id);
    assert.equal(after.email, before.email);
    assert.deepEqual(after.email_verified_at, before.email_verified_at, 'verification status is preserved exactly');
    assert.equal(after.is_active, before.is_active);

    const me = await api('GET', '/auth/me', { token: admin.token });
    assert.equal(me.json.data.user.role, 'student');
  });

  await t.test('demoted access ends immediately, no re-login needed — the SAME token loses admin endpoint access on the very next request', async () => {
    const admin = await createAdmin(TAG, 'immediate');
    await createAdmin(TAG, 'immediate-keeper');

    const before = await api('GET', '/admin/dashboard', { token: admin.token });
    assert.equal(before.status, 200, 'sanity check: this token really was an admin token');

    await api('PATCH', `/admin/users/${admin.id}/demote`, { token: rootAdminToken });

    const after = await api('GET', '/admin/dashboard', { token: admin.token });
    assert.equal(after.status, 403, 'the SAME, still-unexpired token must lose admin access right away');
  });

  await t.test('an admin cannot demote themselves', async () => {
    const admin = await createAdmin(TAG, 'self');
    await createAdmin(TAG, 'self-keeper');

    const res = await api('PATCH', `/admin/users/${admin.id}/demote`, { token: admin.token });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /your own account/i);

    const me = await api('GET', '/auth/me', { token: admin.token });
    assert.equal(me.json.data.user.role, 'admin', 'role must be unchanged after a blocked self-demote');
  });

  // Demoting the last active admin can only ever actually occur under the
  // TOCTOU race the transaction+row-locking guard exists to close (see
  // adminModel.countActiveAdmins) — by the time a SECOND admin exists to act
  // as a valid HTTP caller, there are always >= 2 active admins at request
  // time, so (mirroring adminUsers.test.js's identical delete/deactivate
  // guard test) this exercises the guard directly at the service layer,
  // temporarily deactivating every other active admin in the DB.
  await t.test('the last remaining active admin cannot be demoted', async () => {
    const solo = await createAdmin(TAG, 'solo');
    const others = await db.query(
      "SELECT u.id FROM users u INNER JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.deleted_at IS NULL AND u.is_active = 1 AND u.id != ?",
      [solo.id]
    );
    const otherIds = others.map((o) => o.id);
    if (otherIds.length) {
      await db.query('UPDATE users SET is_active = 0 WHERE id IN (?)', [otherIds]);
    }
    try {
      await assert.rejects(
        () => adminService.demoteToStudent(solo.id + 1, solo.id),
        (err) => err.statusCode === 400 && /at least one administrator must remain/i.test(err.message)
      );
      const [row] = await db.query('SELECT role_id FROM users u INNER JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [solo.id]);
      assert.ok(row, 'solo admin row still exists');
    } finally {
      if (otherIds.length) {
        await db.query('UPDATE users SET is_active = 1 WHERE id IN (?)', [otherIds]);
      }
    }

    const me = await api('GET', '/auth/me', { token: solo.token });
    assert.equal(me.json.data.user.role, 'admin', 'role must be unchanged after a blocked demotion');
  });

  await t.test('a student cannot call the demote endpoint', async () => {
    const admin = await createAdmin(TAG, 'byStudent');
    await createAdmin(TAG, 'byStudent-keeper');
    const student = await createStudent(TAG, 'actor');

    const res = await api('PATCH', `/admin/users/${admin.id}/demote`, { token: student.token });
    assert.equal(res.status, 403);
  });

  await t.test('demoting a student (not an admin) is rejected', async () => {
    const student = await createStudent(TAG, 'notadmin');

    const res = await api('PATCH', `/admin/users/${student.id}/demote`, { token: rootAdminToken });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /not an admin/i);
  });
});
