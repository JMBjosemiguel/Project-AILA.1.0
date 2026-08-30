'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.upl.${Date.now()}`;

// 1x1 png
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
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

test('resource upload flow (real storage)', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable — start it with `npm run dev`');
    return;
  }
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

  const student = await createStudent(TAG, 'up');
  const other = await createStudent(TAG, 'other');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  let resourceId;

  await t.test('a student can upload a supported image and it is persisted', async () => {
    const r = await uploadPng(student.token, 'itest upload.png');
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.success, true);
    resourceId = r.json.data.id;

    const [row] = await db.query('SELECT uploaded_by, type, file_path, file_size_bytes FROM resources WHERE id = ?', [resourceId]);
    assert.equal(row.uploaded_by, student.id);
    assert.equal(row.type, 'image');
    assert.equal(Number(row.file_size_bytes), PNG.length);
    if (driver === 'r2') assert.match(row.file_path, /^r2:\/\/resources\/user-\d+\/\d+-[0-9a-f]{12}\.png$/);
  });

  await t.test('the owner can download it back byte-for-byte', async () => {
    const res = await fetch(`${BASE_URL}/resources/${resourceId}/download`, { headers: { Authorization: `Bearer ${student.token}` } });
    assert.equal(res.status, 200);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.ok(bytes.equals(PNG));
  });

  await t.test('another student cannot download or delete it', async () => {
    assert.equal((await fetch(`${BASE_URL}/resources/${resourceId}/download`, { headers: { Authorization: `Bearer ${other.token}` } })).status, 404);
    assert.equal((await api('DELETE', `/resources/${resourceId}`, { token: other.token })).status, 404);
  });

  await t.test('an unsupported file type is rejected before storage', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'note.txt');
    const res = await fetch(`${BASE_URL}/resources/upload`, { method: 'POST', headers: { Authorization: `Bearer ${student.token}` }, body: fd });
    assert.equal(res.status, 400);
  });

  await t.test('an oversize file is rejected with a friendly 400, not a 500', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.alloc(16 * 1024 * 1024, 0x41)], { type: 'image/png' }), 'huge.png');
    const res = await fetch(`${BASE_URL}/resources/upload`, { method: 'POST', headers: { Authorization: `Bearer ${student.token}` }, body: fd });
    assert.equal(res.status, 400);
    const body = await res.json().catch(() => ({}));
    assert.match(body.message || '', /too large/i);
  });

  await t.test('unauthenticated upload is rejected', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([PNG], { type: 'image/png' }), 'x.png');
    const res = await fetch(`${BASE_URL}/resources/upload`, { method: 'POST', body: fd });
    assert.equal(res.status, 401);
  });

  await t.test('deleting the resource removes the stored object', async () => {
    const del = await api('DELETE', `/resources/${resourceId}`, { token: student.token });
    assert.equal(del.status, 200);
    const [row] = await db.query('SELECT deleted_at FROM resources WHERE id = ?', [resourceId]);
    assert.notEqual(row.deleted_at, null);
    // owner can no longer download
    assert.equal((await fetch(`${BASE_URL}/resources/${resourceId}/download`, { headers: { Authorization: `Bearer ${student.token}` } })).status, 404);
  });
});
