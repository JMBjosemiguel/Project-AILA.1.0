'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');

const TAG = `qa.itest.promote.${Date.now()}`;

// 1x1 png — same fixture used by resourceUpload.test.js / studentAuditLog.test.js.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function uploadPng(token, name) {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const res = await fetch(`${BASE_URL}/resources/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function registerUnverified(suffix) {
  const email = `${TAG}.${suffix}@example.com`;
  const reg = await api('POST', '/auth/register', {
    body: {
      first_name: 'ITest',
      last_name: suffix,
      email,
      password: 'ItestPassw0rd!',
      student_number: `IT-UV-${Date.now()}`.slice(0, 30),
    },
  });
  if (reg.status !== 201) throw new Error(`register ${suffix} failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  return { id: reg.json.data.user.id, email };
}

test('promote to admin', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const adminToken = await loginAdmin();

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('promotion succeeds, writes an audit row, and the promoted user\'s /auth/me returns admin', async () => {
    const student = await createStudent(TAG, 'ok');

    const promote = await api('PATCH', `/admin/users/${student.id}/role`, { token: adminToken });
    assert.equal(promote.status, 200, JSON.stringify(promote.json));

    const me = await api('GET', '/auth/me', { token: student.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.data.user.role, 'admin');

    // admin_id is the ACTOR (the admin who performed the promotion) — the
    // student is only the target, never the actor, so this must filter by
    // target_id, not admin_id.
    const [auditRow] = await db.query(
      "SELECT target_table, target_id, details FROM admin_audit_log WHERE target_table = 'users' AND target_id = ? AND action = 'user.promote_to_admin' ORDER BY id DESC LIMIT 1",
      [student.id]
    );
    assert.ok(auditRow, 'expected a user.promote_to_admin audit row');
    assert.equal(auditRow.target_table, 'users');
    assert.equal(auditRow.target_id, student.id);
    const details = JSON.parse(auditRow.details);
    assert.equal(details.fromRole, 'student');
    assert.equal(details.toRole, 'admin');
  });

  await t.test('an already-admin target is rejected', async () => {
    const student = await createStudent(TAG, 'already');
    const first = await api('PATCH', `/admin/users/${student.id}/role`, { token: adminToken });
    assert.equal(first.status, 200, JSON.stringify(first.json));

    const second = await api('PATCH', `/admin/users/${student.id}/role`, { token: adminToken });
    assert.equal(second.status, 400);
    assert.match(second.json.message, /already an admin/i);
  });

  await t.test('an unverified student is rejected', async () => {
    const { id } = await registerUnverified('unverified');
    const res = await api('PATCH', `/admin/users/${id}/role`, { token: adminToken });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /verif/i);
  });

  await t.test('an inactive student is rejected', async () => {
    const student = await createStudent(TAG, 'inactive');
    const deactivate = await api('PATCH', `/admin/users/${student.id}`, { token: adminToken, body: { is_active: false } });
    assert.equal(deactivate.status, 200, JSON.stringify(deactivate.json));

    const res = await api('PATCH', `/admin/users/${student.id}/role`, { token: adminToken });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /deactivat/i);
  });

  await t.test('a student with personal uploads is rejected, naming the count', async () => {
    const student = await createStudent(TAG, 'uploads');
    const up = await uploadPng(student.token, `${TAG} upload.png`);
    assert.equal(up.status, 201, JSON.stringify(up.json));

    const res = await api('PATCH', `/admin/users/${student.id}/role`, { token: adminToken });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /1 personal upload/i);
    assert.match(res.json.message, /remove them first/i);
  });

  await t.test('a student cannot call the promote endpoint themselves', async () => {
    const actor = await createStudent(TAG, 'actor');
    const target = await createStudent(TAG, 'target');

    const res = await api('PATCH', `/admin/users/${target.id}/role`, { token: actor.token });
    assert.equal(res.status, 403);
  });
});
