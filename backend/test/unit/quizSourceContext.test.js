'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { extractLessonCoreSections, buildQuizSourceContextBlock } = require('../../src/services/quizService');

const LESSON_CONTENT = [
  '## Objectives',
  'Understand structuralism and functionalism.',
  '',
  '## Summary',
  'Structuralism studies the structure of the mind; functionalism studies its function.',
  '',
  '## Main Explanation',
  'Wundt and Titchener founded structuralism; James founded functionalism.',
  '',
  '## Examples',
  'This example section must never appear in the extracted output.',
  '',
  '## Quick Recap',
  'This recap section must never appear in the extracted output either.',
].join('\n');

test('extractLessonCoreSections', async (t) => {
  await t.test('pulls only Objectives, Summary, and Main Explanation', () => {
    const result = extractLessonCoreSections(LESSON_CONTENT);
    assert.match(result, /## Objectives/);
    assert.match(result, /## Summary/);
    assert.match(result, /## Main Explanation/);
    assert.doesNotMatch(result, /## Examples/);
    assert.doesNotMatch(result, /## Quick Recap/);
    assert.doesNotMatch(result, /must never appear/);
  });

  await t.test('returns empty string for null/empty content', () => {
    assert.equal(extractLessonCoreSections(null), '');
    assert.equal(extractLessonCoreSections(''), '');
  });

  await t.test('truncates very long content to a safe length', () => {
    const huge = '## Objectives\n' + 'x'.repeat(10000);
    const result = extractLessonCoreSections(huge);
    assert.ok(result.length < 10000);
  });
});

test('buildQuizSourceContextBlock', async (t) => {
  await t.test('includes course, module, topic, lesson titles and lesson content for a lesson source', () => {
    const block = buildQuizSourceContextBlock({
      courseTitle: 'Introduction to Psychology',
      moduleTitle: 'Foundations and Biological Bases of Behavior',
      topicTitle: 'Historical Perspectives',
      lessonTitle: 'Structuralism vs. Functionalism',
      lessonContent: LESSON_CONTENT,
    });
    assert.match(block, /Course: Introduction to Psychology/);
    assert.match(block, /Module: Foundations and Biological Bases of Behavior/);
    assert.match(block, /Topic: Historical Perspectives/);
    assert.match(block, /Lesson: Structuralism vs\. Functionalism/);
    assert.match(block, /## Main Explanation/);
  });

  await t.test('includes course/module/topic titles only, no lesson content, for a topic source with no lesson', () => {
    const block = buildQuizSourceContextBlock({
      courseTitle: 'Introduction to Psychology',
      moduleTitle: 'Foundations and Biological Bases of Behavior',
      topicTitle: 'Historical Perspectives',
      lessonTitle: null,
      lessonContent: null,
    });
    assert.match(block, /Course: Introduction to Psychology/);
    assert.match(block, /Topic: Historical Perspectives/);
    assert.doesNotMatch(block, /Lesson:/);
    assert.doesNotMatch(block, /Lesson content:/);
  });

  await t.test('returns empty string when there is no source context (chat/resource/manual quizzes)', () => {
    assert.equal(buildQuizSourceContextBlock(null), '');
  });
});
