'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, loginAdmin, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.topicgroups.${Date.now()}`;

async function wipeCourse(subjectId) {
  await db.query('DELETE lp FROM learning_progress lp JOIN topics t ON t.id=lp.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

test('admin topic groups API', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const admin = await loginAdmin();
  const student = await createStudent(TAG, 'learner');

  const subjectResult = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [student.id, `${TAG} OB Nursing`]
  );
  const subjectId = subjectResult.insertId;
  const moduleResult = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [subjectId, 'Module 1']);
  const moduleId = moduleResult.insertId;

  // Two near-duplicate nursing topics (same underlying concept, worded
  // differently) plus one unrelated topic — loosely mirrors the task's real
  // example set, without asserting on the exact AI grouping decision (that's
  // covered by the live checks in the final report, not this test).
  const topicTitles = [`${TAG} Infant Growth Milestones`, `${TAG} Infant Measurements Guide`, `${TAG} Hand Hygiene Steps`];
  const topicIds = [];
  for (const title of topicTitles) {
    const r = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [moduleId, title]);
    topicIds.push(r.insertId);
  }
  for (const topicId of topicIds) {
    await db.query(
      "INSERT INTO learning_progress (user_id, topic_id, progress_percent, status) VALUES (?, ?, 75, 'in_progress')",
      [student.id, topicId]
    );
  }

  t.after(async () => {
    await wipeCourse(subjectId);
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('admin gets 200 with groups covering every topic created, exactly once', async () => {
    const res = await api('GET', '/admin/analytics/topic-groups', { token: admin });
    assert.equal(res.status, 200);
    const data = res.json.data;
    assert.equal(typeof data.aiGrouped, 'boolean');
    assert.ok(typeof data.generatedAt === 'string' && !Number.isNaN(Date.parse(data.generatedAt)));
    assert.ok(Array.isArray(data.groups));
    assert.ok(Array.isArray(data.strongestIds));
    assert.ok(Array.isArray(data.weakestIds));

    // Restrict to groups touching our own tagged topics (the live platform
    // may have other real topics with progress too).
    const ourGroups = data.groups.filter((g) => g.topics.some((t) => topicIds.includes(t.id)));
    const coveredIds = ourGroups.flatMap((g) => g.topics.map((t) => t.id)).filter((id) => topicIds.includes(id));
    assert.deepEqual([...coveredIds].sort((a, b) => a - b), [...topicIds].sort((a, b) => a - b), 'every created topic must appear exactly once across our groups');

    for (const group of ourGroups) {
      assert.equal(typeof group.id, 'string');
      assert.equal(typeof group.name, 'string');
      assert.equal(typeof group.avgPct, 'number');
      assert.equal(group.topicCount, group.topics.length);
      assert.ok(group.studentCount >= 1);
      for (const topic of group.topics) {
        assert.equal(typeof topic.title, 'string');
        assert.equal(typeof topic.courseName, 'string');
        assert.equal(typeof topic.avgPct, 'number');
        assert.equal(typeof topic.studentCount, 'number');
      }
    }

    // No PII: student id/email must never leak into the payload.
    const serialized = JSON.stringify(data);
    assert.doesNotMatch(serialized, new RegExp(`"${student.id}"|${student.email}`));
  });

  await t.test('a student gets 403, and an unauthenticated request gets 401', async () => {
    assert.equal((await api('GET', '/admin/analytics/topic-groups')).status, 401);
    assert.equal((await api('GET', '/admin/analytics/topic-groups', { token: student.token })).status, 403);
    assert.equal((await api('POST', '/admin/analytics/topic-groups/regroup')).status, 401);
    assert.equal((await api('POST', '/admin/analytics/topic-groups/regroup', { token: student.token })).status, 403);
  });
});
