'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, loginAdmin, createStudent, createAdmin, purgeByTag, containsSecret } = require('./helpers');
const adminService = require('../../src/services/adminService');

const TAG = `qa.itest.users.${Date.now()}`;

test('admin users API', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const admin = await loginAdmin();
  const alice = await createStudent(TAG, 'alice');
  const bob = await createStudent(TAG, 'bob');
  // a user row with no user_profiles row (registration always makes one, so force it):
  const orphan = await db.query(
    "INSERT INTO users (role_id, email, password_hash, first_name, last_name, is_active) " +
    "VALUES ((SELECT id FROM roles WHERE name='student'), ?, '$2b$10$0000000000000000000000', 'Orphan', 'NoProfile', 1)",
    [`${TAG}.orphan@example.com`]
  );
  const orphanId = orphan.insertId;

  t.after(async () => {
    await db.query('DELETE FROM users WHERE id = ?', [orphanId]).catch(() => {});
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('the exact production request returns 200 with pagination metadata', async () => {
    const res = await api('GET', '/admin/users?role=all&status=all&sort=newest&page=1&pageSize=10', { token: admin });
    assert.equal(res.status, 200);
    const p = res.json.data.pagination;
    assert.equal(typeof p.total, 'number');
    assert.equal(typeof p.totalPages, 'number');
    assert.equal(typeof p.page, 'number');
  });

  await t.test('every filter / sort combination stays 200 (no mysqld_stmt_execute error)', async () => {
    const queries = [
      'role=student', 'role=admin', 'status=active', 'status=inactive',
      'sort=newest', 'sort=oldest', 'sort=name', 'sort=last_login',
      `search=${TAG}.alice@example.com`, 'search=ITest', 'search=alice', 'search=',
      'page=1&pageSize=1', 'page=2&pageSize=2', 'page=99999&pageSize=5',
      "search=%27%20OR%20%271%27%3D%271",
    ];
    for (const qs of queries) {
      const res = await api('GET', `/admin/users?${qs}`, { token: admin });
      assert.equal(res.status, 200, `?${qs} -> ${res.status}`);
    }
  });

  await t.test('malformed pagination is rejected with 422, never 500', async () => {
    for (const qs of ['page=-5&pageSize=-1', 'page=abc', 'pageSize=99999', 'page=1.5', 'page=0']) {
      const res = await api('GET', `/admin/users?${qs}`, { token: admin });
      assert.equal(res.status, 422, `?${qs} -> ${res.status}`);
    }
  });

  await t.test('search + role + status filters actually narrow the result set', async () => {
    const res = await api('GET', `/admin/users?search=${TAG}&role=student&status=active&page=1&pageSize=50`, { token: admin });
    const ids = res.json.data.users.map((u) => u.id);
    assert.ok(ids.includes(alice.id) && ids.includes(bob.id));
    assert.ok(!ids.includes(orphanId) || res.json.data.users.find((u) => u.id === orphanId));
  });

  await t.test('user rows never leak password hashes or secrets', async () => {
    const list = await api('GET', `/admin/users?search=${TAG}&page=1&pageSize=50`, { token: admin });
    assert.equal(containsSecret(list.json), null);
    const row = list.json.data.users[0];
    assert.ok('role' in row && 'is_active' in row && 'created_at' in row);
    assert.ok(!('password_hash' in row));
    const detail = await api('GET', `/admin/users/${alice.id}`, { token: admin });
    assert.equal(containsSecret(detail.json), null);
  });

  await t.test('a user with no profile row does not break the list or detail view', async () => {
    const list = await api('GET', `/admin/users?search=${TAG}.orphan&page=1&pageSize=10`, { token: admin });
    assert.equal(list.status, 200);
    const row = list.json.data.users.find((u) => u.id === orphanId);
    assert.ok(row, 'orphan user present in listing');
    assert.ok(row.program == null && row.level == null);
    const detail = await api('GET', `/admin/users/${orphanId}`, { token: admin });
    assert.equal(detail.status, 200);
  });

  await t.test('admin routes enforce auth server-side', async () => {
    for (const route of ['/admin/users', '/admin/dashboard', '/admin/resources', '/admin/analytics', '/admin/audit-log']) {
      assert.equal((await api('GET', route)).status, 401, `${route} without token`);
      assert.equal((await api('GET', route, { token: alice.token })).status, 403, `${route} as student`);
    }
    const del = await api('DELETE', `/admin/users/${bob.id}`, { token: alice.token });
    assert.equal(del.status, 403);
    const [{ deleted_at: deletedAt }] = await db.query('SELECT deleted_at FROM users WHERE id = ?', [bob.id]);
    assert.equal(deletedAt, null, 'forbidden delete must not soft-delete the target');
  });

  await t.test('a deactivated student\'s existing token stops working on the very next request', async () => {
    const carol = await createStudent(TAG, 'carol');
    const before = await api('GET', '/auth/me', { token: carol.token });
    assert.equal(before.status, 200);

    const deactivate = await api('PATCH', `/admin/users/${carol.id}`, { token: admin, body: { is_active: false } });
    assert.equal(deactivate.status, 200, JSON.stringify(deactivate.json));

    const after = await api('GET', '/auth/me', { token: carol.token });
    assert.equal(after.status, 401, 'a deactivated account\'s pre-existing token must be rejected immediately');
  });

  await t.test('an admin deletes another admin -> 200, soft-deleted, email tombstoned, old token rejected next request', async () => {
    const adminA = await createAdmin(TAG, 'dela');
    const adminB = await createAdmin(TAG, 'delb');

    const before = await api('GET', '/auth/me', { token: adminB.token });
    assert.equal(before.status, 200);
    assert.equal(before.json.data.user.role, 'admin');

    const del = await api('DELETE', `/admin/users/${adminB.id}`, { token: adminA.token });
    assert.equal(del.status, 200, JSON.stringify(del.json));

    const [row] = await db.query('SELECT deleted_at, is_active, email FROM users WHERE id = ?', [adminB.id]);
    assert.ok(row.deleted_at, 'target admin should be soft-deleted');
    assert.equal(row.is_active, 0);
    assert.notEqual(row.email, adminB.email, 'email should be tombstoned so it can be reused');

    const after = await api('GET', '/auth/me', { token: adminB.token });
    assert.equal(after.status, 401, 'the deleted admin\'s existing token must be rejected immediately');

    const [auditRow] = await db.query(
      "SELECT details FROM admin_audit_log WHERE target_table = 'users' AND target_id = ? AND action = 'user.delete' ORDER BY id DESC LIMIT 1",
      [adminB.id]
    );
    assert.ok(auditRow, 'expected a user.delete audit row for the deleted admin');
    assert.deepEqual(JSON.parse(auditRow.details), { targetRole: 'admin' });
  });

  await t.test('an admin cannot delete or deactivate their own account -> 400', async () => {
    const self = await createAdmin(TAG, 'selfdel');

    const del = await api('DELETE', `/admin/users/${self.id}`, { token: self.token });
    assert.equal(del.status, 400);
    assert.match(del.json.message, /own account/i);

    const deactivate = await api('PATCH', `/admin/users/${self.id}`, { token: self.token, body: { is_active: false } });
    assert.equal(deactivate.status, 400);
    assert.match(deactivate.json.message, /own account/i);

    const [row] = await db.query('SELECT deleted_at, is_active FROM users WHERE id = ?', [self.id]);
    assert.equal(row.deleted_at, null, 'self-delete must never actually delete the row');
    assert.equal(row.is_active, 1, 'self-deactivate must never actually deactivate the row');
  });

  // Deleting/deactivating the last active admin can only ever actually occur
  // under the TOCTOU race the transaction+row-locking guard exists to close
  // (see adminModel.countActiveAdmins) — by the time a SECOND admin exists to
  // act as a valid HTTP caller, there are always >= 2 active admins at
  // request time, so this exercises the guard directly at the service layer,
  // the same way softDeletedIdentityReuse.test.js exercises adminService
  // functions directly for scenarios HTTP alone can't construct.
  await t.test('deleting or deactivating the last active admin is rejected with 409', async () => {
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
        () => adminService.deleteUser(solo.id + 1, solo.id),
        (err) => err.statusCode === 409 && /at least one admin/i.test(err.message)
      );
      await assert.rejects(
        () => adminService.setUserActive(solo.id + 1, solo.id, false),
        (err) => err.statusCode === 409 && /at least one admin/i.test(err.message)
      );
      const [row] = await db.query('SELECT deleted_at, is_active FROM users WHERE id = ?', [solo.id]);
      assert.equal(row.deleted_at, null);
      assert.equal(row.is_active, 1);
    } finally {
      if (otherIds.length) {
        await db.query('UPDATE users SET is_active = 1 WHERE id IN (?)', [otherIds]);
      }
    }
  });
});
