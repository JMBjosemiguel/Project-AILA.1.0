'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');

// Course generation calls Gemini — stub it in-process (same technique as
// chatIntent.test.js) BEFORE requiring the services that destructure
// callGemini at load time. notifyUser is silenced the same way.
const notify = require('../../src/utils/notify');
notify.notifyUser = async () => {};
const gemini = require('../../src/services/geminiClient');
const geminiCalls = [];
gemini.callGemini = async (body) => {
  geminiCalls.push(body);
  const roadmap = { modules: [{ title: 'Module A', topics: [{ title: 'Topic A', lessons: [{ title: 'Lesson A', estimatedMinutes: 10 }] }] }] };
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(roadmap) }] } }] };
};
for (const p of ['../../src/services/courseGenerationService', '../../src/services/learningService']) {
  delete require.cache[require.resolve(p)];
}
const learningService = require('../../src/services/learningService');
const learningModel = require('../../src/models/learningModel');
const shareService = require('../../src/services/materialShareService');

const TAG = `qa.itest.subjprof.${Date.now()}`;
const subjectIds = [];

// modules -> subjects has no ON DELETE CASCADE, so a user's generated courses
// must be removed before purgeByTag can delete the user (as materialSharing.test.js does).
async function wipeCourse(subjectId) {
  const j = 'JOIN topics t ON t.id=x.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE x FROM definitions x ${j}`, [subjectId]).catch(() => {});
  await db.query(`DELETE x FROM examples x ${j}`, [subjectId]).catch(() => {});
  await db.query(`DELETE x FROM lessons x ${j}`, [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

test('course curriculum subjects + profile middle name / contact info', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const adminToken = await loginAdmin();
  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    await purgeByTag(TAG);
    await db.pool.end();
  });

  async function generate(curriculumSubject) {
    geminiCalls.length = 0;
    const { subjectId } = await learningService.generateCourse(A.id, { courseName: `${TAG} Course`, curriculumSubject });
    subjectIds.push(subjectId);
    const [row] = await db.query('SELECT curriculum_subject FROM subjects WHERE id = ?', [subjectId]);
    return { subjectId, stored: row.curriculum_subject, prompt: JSON.stringify(geminiCalls[0]) };
  }

  await t.test('a listed subject is saved on the course and given to Gemini as context', async () => {
    const { subjectId, stored, prompt } = await generate('NCM 106');
    assert.equal(stored, 'NCM 106');
    assert.match(prompt, /NCM 106 Pharmacology/);

    const subjects = await learningModel.listSubjectsForUser(A.id);
    assert.equal(subjects.find((s) => s.id === subjectId).curriculum_subject, 'NCM 106');
  });

  await t.test('"Others", empty and omitted all store NULL, and no subject line goes to Gemini', async () => {
    for (const value of ['Others', '', undefined, null]) {
      // eslint-disable-next-line no-await-in-loop
      const { stored, prompt } = await generate(value);
      assert.equal(stored, null, JSON.stringify(value));
      assert.doesNotMatch(prompt, /curriculum subject/i, JSON.stringify(value));
    }
  });

  await t.test('a subject that is not on the list is rejected with a 422 field error before any generation', async () => {
    const res = await api('POST', '/subjects/generate', {
      token: A.token, body: { courseName: `${TAG} Bad`, curriculumSubject: 'NCM 999' },
    });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.ok((res.json.details || []).some((d) => d.field === 'curriculumSubject'));
  });

  await t.test('a copied shared course keeps its curriculum subject', async () => {
    const { subjectId } = await generate('NCM 110');
    const share = await shareService.createShare(A.id, 'subject', subjectId, 'unlisted');
    const copied = await shareService.copySharedMaterial(B.id, share.token);
    subjectIds.push(copied.materialId);
    const [row] = await db.query('SELECT created_by, curriculum_subject FROM subjects WHERE id = ?', [copied.materialId]);
    assert.equal(Number(row.created_by), B.id);
    assert.equal(row.curriculum_subject, 'NCM 110');
  });

  await t.test('the admin course list includes the curriculum subject', async () => {
    const res = await api('GET', `/admin/learning?search=${encodeURIComponent(TAG)}&page=1&pageSize=50`, { token: adminToken });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const rows = res.json.data.courses;
    assert.ok(rows.length > 0);
    assert.ok(rows.every((c) => 'curriculum_subject' in c));
    assert.ok(rows.some((c) => c.curriculum_subject === 'NCM 106'));
  });

  await t.test('profile: middle name, Facebook and contact number save, read back, and clear with ""', async () => {
    const save = await api('PATCH', '/users/me/profile', {
      token: A.token,
      body: { middle_name: ' Dela Paz ', facebook: 'https://www.facebook.com/juan.delacruz', contact_number: '+63 917 123 4567' },
    });
    assert.equal(save.status, 200, JSON.stringify(save.json));

    let profile = (await api('GET', '/users/me/profile', { token: A.token })).json.data.profile;
    assert.equal(profile.middle_name, 'Dela Paz');
    assert.equal(profile.facebook, 'https://www.facebook.com/juan.delacruz');
    assert.equal(profile.contact_number, '+63 917 123 4567');

    const asName = await api('PATCH', '/users/me/profile', { token: A.token, body: { facebook: 'Juan Dela Cruz' } });
    assert.equal(asName.status, 200, 'a plain Facebook name is accepted too');

    await api('PATCH', '/users/me/profile', { token: A.token, body: { middle_name: '', facebook: '', contact_number: '' } });
    profile = (await api('GET', '/users/me/profile', { token: A.token })).json.data.profile;
    assert.equal(profile.middle_name, null);
    assert.equal(profile.facebook, null);
    assert.equal(profile.contact_number, null);
  });

  await t.test('profile: a non-Facebook link or a bad contact number is a 422 field error', async () => {
    const badLink = await api('PATCH', '/users/me/profile', { token: A.token, body: { facebook: 'https://evil.example.com/me' } });
    assert.equal(badLink.status, 422);
    assert.ok(badLink.json.details.some((d) => d.field === 'facebook'));

    for (const contact of ['call me', '123', '1'.repeat(16)]) {
      // eslint-disable-next-line no-await-in-loop
      const bad = await api('PATCH', '/users/me/profile', { token: A.token, body: { contact_number: contact } });
      assert.equal(bad.status, 422, contact);
      assert.ok(bad.json.details.some((d) => d.field === 'contact_number'), contact);
    }
  });

  await t.test('contact info is shown to the admin, never to other students or in the auth user object', async () => {
    await api('PATCH', '/users/me/profile', {
      token: A.token,
      body: { facebook: 'fb.com/subjprof.marker', contact_number: '0917 555 0199', leaderboard_opt_in: true },
    });

    const adminView = await api('GET', `/admin/users/${A.id}`, { token: adminToken });
    assert.equal(adminView.status, 200);
    assert.equal(adminView.json.data.facebook, 'fb.com/subjprof.marker');
    assert.equal(adminView.json.data.contact_number, '0917 555 0199');

    const me = await api('GET', '/auth/me', { token: A.token });
    assert.doesNotMatch(JSON.stringify(me.json), /subjprof\.marker|0917 555 0199/);

    const leaderboard = await api('GET', '/gamification/leaderboard', { token: B.token });
    assert.equal(leaderboard.status, 200);
    assert.doesNotMatch(JSON.stringify(leaderboard.json), /subjprof\.marker|0917 555 0199/);
  });
});
