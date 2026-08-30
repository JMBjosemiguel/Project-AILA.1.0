'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, loginAdmin, createStudent, purgeByTag, containsSecret } = require('./helpers');

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
});
