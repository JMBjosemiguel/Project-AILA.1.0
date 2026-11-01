'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const { csvEscape } = require('../../src/utils/csv');
const { buildSubjectTree } = require('../../src/models/learningModel');
const { updateProfileValidator } = require('../../src/validators/profileValidator');
const { sendMessageValidator, MAX_CHAT_MESSAGE_LENGTH } = require('../../src/validators/chatValidator');

async function errorsFor(validators, body) {
  const req = { body };
  for (const chain of validators) await chain.run(req);
  return validationResult(req).array();
}

test('csvEscape: formula injection and quoting', async (t) => {
  await t.test('a cell starting with = + - @ tab or CR gets a leading single quote', () => {
    assert.equal(csvEscape('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvEscape('+1+1'), "'+1+1");
    assert.equal(csvEscape('-2+3'), "'-2+3");
    assert.equal(csvEscape('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvEscape('\tcmd'), "'\tcmd");
    assert.equal(csvEscape('\rcmd'), `"'\rcmd"`);
  });

  await t.test('values with a comma, double quote, newline or carriage return are quoted, quotes doubled', () => {
    assert.equal(csvEscape('Cruz, Ana'), '"Cruz, Ana"');
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
    assert.equal(csvEscape('line one\nline two'), '"line one\nline two"');
    assert.equal(csvEscape('line one\rline two'), '"line one\rline two"');
    assert.equal(csvEscape('a\r\nb'), '"a\r\nb"');
  });

  await t.test('ordinary values are untouched, and null or undefined are empty', () => {
    assert.equal(csvEscape('Ana Cruz'), 'Ana Cruz');
    assert.equal(csvEscape('user.delete'), 'user.delete');
    assert.equal(csvEscape('ana@example.com'), 'ana@example.com');
    assert.equal(csvEscape('a-b=c+d@e'), 'a-b=c+d@e', 'only a LEADING character matters');
    assert.equal(csvEscape(null), '');
    assert.equal(csvEscape(undefined), '');
    assert.equal(csvEscape(0), '0');
  });
});

test('course progress: topic, module and course percentages', async (t) => {
  let id = 0;
  // One row per lesson: moduleId/topicId/topicPercent describe where it sits.
  const row = ({ moduleId, topicId, topicPercent = 0, lessonId = null }) => ({
    subject_id: 1, subject_name: 'Course',
    module_id: moduleId, module_title: `M${moduleId}`,
    topic_id: topicId, topic_title: topicId ? `T${topicId}` : null, topic_progress_percent: topicPercent, topic_status: 'in_progress',
    lesson_id: lessonId, lesson_title: lessonId ? `L${lessonId}` : null,
  });
  const lesson = (moduleId, topicId, topicPercent) => row({ moduleId, topicId, topicPercent, lessonId: (id += 1) });
  const build = (rows) => buildSubjectTree(rows)[0];

  await t.test('module % averages only its topics that have lessons; course % averages its modules', () => {
    const course = build([
      lesson(1, 11, 100), lesson(1, 11, 100), // topic 11: 100%
      lesson(1, 12, 50), lesson(1, 12, 50), // topic 12: 50%
      row({ moduleId: 1, topicId: 13 }), // topic 13 has no lessons: skipped
      lesson(2, 21, 0),
    ]);
    assert.deepEqual(course.modules.map((m) => m.progress_percent), [75, 0]);
    assert.equal(course.progress_percent, 38); // (75 + 0) / 2 = 37.5
  });

  await t.test('a module with no lessons is skipped in the course average (the bug)', () => {
    const course = build([
      lesson(1, 11, 100),
      row({ moduleId: 2 }), // empty module: no topics at all
      row({ moduleId: 3, topicId: 31 }), // a module whose only topic has no lessons
    ]);
    assert.deepEqual(course.modules.map((m) => m.progress_percent), [100, 0, 0]);
    assert.equal(course.progress_percent, 100, 'was 33 before: empty modules dragged it down');
  });

  await t.test('a course with no lessons at all shows 0%', () => {
    assert.equal(build([row({ moduleId: 1 }), row({ moduleId: 2, topicId: 21 })]).progress_percent, 0);
    assert.equal(build([row({ moduleId: null })]).progress_percent, 0);
  });

  await t.test('a fully completed course is 100% and a barely started one rounds sensibly', () => {
    assert.equal(build([lesson(1, 11, 100), lesson(2, 21, 100)]).progress_percent, 100);
    assert.equal(build([lesson(1, 11, 33), lesson(2, 21, 0)]).progress_percent, 17);
  });
});

test('avatar_url: empty or an https URL up to 255 characters', async (t) => {
  const avatarErrors = async (value) => (await errorsFor(updateProfileValidator, { avatar_url: value })).filter((e) => e.path === 'avatar_url');

  await t.test('accepted: empty (clears it), null, and a valid https link', async () => {
    for (const value of ['', null, 'https://example.com/me.png', 'https://cdn.example.com/a/b.jpg?v=2']) {
      // eslint-disable-next-line no-await-in-loop
      assert.deepEqual(await avatarErrors(value), [], JSON.stringify(value));
    }
  });

  await t.test('rejected: http, other schemes, plain text, a link with no host, and a non-string', async () => {
    for (const value of ['http://example.com/me.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://example.com/a.png', 'not a url', 'https://', 42]) {
      // eslint-disable-next-line no-await-in-loop
      const errors = await avatarErrors(value);
      assert.ok(errors.length > 0, JSON.stringify(value));
    }
  });

  await t.test('rejected: longer than 255 characters (exactly 255 is fine)', async () => {
    const make = (length) => `https://example.com/${'a'.repeat(length - 'https://example.com/'.length)}`;
    assert.deepEqual(await avatarErrors(make(255)), []);
    assert.ok((await avatarErrors(make(256))).length > 0);
  });

  await t.test('other profile fields are not affected', async () => {
    assert.deepEqual(await errorsFor(updateProfileValidator, { program: 'BSN', year_level: 2 }), []);
  });
});

test('chat messages: at most 4,000 characters, with a clear error', async (t) => {
  await t.test('the limit is 4,000', () => assert.equal(MAX_CHAT_MESSAGE_LENGTH, 4000));

  await t.test('exactly 4,000 characters is accepted', async () => {
    assert.deepEqual(await errorsFor(sendMessageValidator, { message: 'a'.repeat(4000) }), []);
  });

  await t.test('4,001 is rejected with a message that names the limit', async () => {
    const errors = await errorsFor(sendMessageValidator, { message: 'a'.repeat(4001) });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].msg, 'Messages can be up to 4,000 characters. Please shorten yours.');
  });

  await t.test('surrounding spaces do not count, and an empty message still says so', async () => {
    assert.deepEqual(await errorsFor(sendMessageValidator, { message: `  ${'a'.repeat(4000)}  ` }), []);
    const errors = await errorsFor(sendMessageValidator, { message: '   ' });
    assert.equal(errors[0].msg, 'Please enter a message for AILA.');
  });
});
