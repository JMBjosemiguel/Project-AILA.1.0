'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, purgeByTag } = require('./helpers');

const TAG = `qa.itest.regvalid.${Date.now()}`;
let n = 0;
function nextEmail() {
  n += 1;
  return `${TAG}.${n}@example.com`;
}

function basePayload(overrides = {}) {
  return {
    first_name: 'ITest',
    last_name: 'RegValid',
    email: nextEmail(),
    password: 'ItestPassw0rd!',
    program: 'Computer Science',
    student_number: `IT-RV-${Math.random().toString(36).slice(2, 12)}`.slice(0, 30),
    ...overrides,
  };
}

function fieldError(res, field) {
  return (res.json.details || []).some((d) => d.field === field);
}

test('registration validation — year level 1-4, program required', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('year_level 0 is rejected with a 422 field error', async () => {
    const res = await api('POST', '/auth/register', { body: basePayload({ year_level: 0 }) });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok(fieldError(res, 'year_level'));
  });

  await t.test('year_level 5 is rejected with a 422 field error', async () => {
    const res = await api('POST', '/auth/register', { body: basePayload({ year_level: 5 }) });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok(fieldError(res, 'year_level'));
  });

  await t.test('year_level 1 through 4 are all accepted', async () => {
    for (const year of [1, 2, 3, 4]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api('POST', '/auth/register', { body: basePayload({ year_level: year }) });
      assert.equal(res.status, 201, `year ${year}: ${JSON.stringify(res.json)}`);
    }
  });

  await t.test('omitting year_level entirely is still accepted (stays optional)', async () => {
    const payload = basePayload();
    delete payload.year_level;
    const res = await api('POST', '/auth/register', { body: payload });
    assert.equal(res.status, 201, JSON.stringify(res.json));
  });

  await t.test('an empty program is rejected with "Please enter your program."', async () => {
    const res = await api('POST', '/auth/register', { body: basePayload({ program: '' }) });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok(fieldError(res, 'program'));
    assert.ok((res.json.details || []).some((d) => /please enter your program/i.test(d.message)));
  });

  await t.test('a program that is only spaces is rejected', async () => {
    const res = await api('POST', '/auth/register', { body: basePayload({ program: '   ' }) });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok(fieldError(res, 'program'));
  });

  await t.test('omitting program entirely is rejected (now required)', async () => {
    const payload = basePayload();
    delete payload.program;
    const res = await api('POST', '/auth/register', { body: payload });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok(fieldError(res, 'program'));
  });

  await t.test('a valid program is accepted', async () => {
    const res = await api('POST', '/auth/register', { body: basePayload({ program: 'Bachelor of Science in Nursing' }) });
    assert.equal(res.status, 201, JSON.stringify(res.json));
  });

  await t.test('student_number is required: omitted, empty or blank is a 422 field error', async () => {
    const omitted = basePayload();
    delete omitted.student_number;
    for (const payload of [omitted, basePayload({ student_number: '' }), basePayload({ student_number: '   ' })]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api('POST', '/auth/register', { body: payload });
      assert.equal(res.status, 422, JSON.stringify(res.json));
      assert.ok(fieldError(res, 'student_number'));
      assert.ok((res.json.details || []).some((d) => /please enter your student number/i.test(d.message)));
    }
  });

  await t.test('an optional middle name is accepted and stored on the profile', async () => {
    const payload = basePayload({ middle_name: '  Dela Paz  ' });
    const res = await api('POST', '/auth/register', { body: payload });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const [row] = await db.query('SELECT up.middle_name FROM user_profiles up INNER JOIN users u ON u.id = up.user_id WHERE u.email = ?', [payload.email]);
    assert.equal(row.middle_name, 'Dela Paz');
  });

  await t.test('a middle name over 100 characters is a 422 field error', async () => {
    const res = await api('POST', '/auth/register', { body: basePayload({ middle_name: 'x'.repeat(101) }) });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok(fieldError(res, 'middle_name'));
  });
});
