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

  await t.test('a valid program is accepted, and student_number stays optional', async () => {
    const payload = basePayload({ program: 'Bachelor of Science in Nursing' });
    delete payload.student_number;
    const res = await api('POST', '/auth/register', { body: payload });
    assert.equal(res.status, 201, JSON.stringify(res.json));
  });
});
