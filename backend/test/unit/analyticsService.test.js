'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitTopicMastery } = require('../../src/services/analyticsService');

function topic(name, pct) {
  return { topic: name, subject: 'Subject', pct };
}

test('splitTopicMastery never puts the same topic in both lists', () => {
  // Exactly the reported bug: a student with only 3 in-progress topics, all
  // at 100% — the old two-query (DESC top-3 / ASC bottom-3) approach
  // returned the identical 3 rows in both lists.
  const ranked = [topic('Normalization and 3NF', 100), topic('Entity Relationships', 100), topic('SELECT Queries', 100)];
  const { strongTopics, weakTopics } = splitTopicMastery(ranked);
  assert.deepEqual(strongTopics.map((t) => t.topic), ['Normalization and 3NF', 'Entity Relationships', 'SELECT Queries']);
  assert.deepEqual(weakTopics, [], 'nothing left to review once the only topics are all mastered');
});

test('splitTopicMastery takes the lowest-ranked remaining topics for "weak", ascending (weakest first)', () => {
  const ranked = [
    topic('A', 95), topic('B', 90), topic('C', 85),
    topic('D', 70), topic('E', 60), topic('F', 40), topic('G', 20),
  ];
  const { strongTopics, weakTopics } = splitTopicMastery(ranked);
  assert.deepEqual(strongTopics.map((t) => t.topic), ['A', 'B', 'C']);
  assert.deepEqual(weakTopics.map((t) => t.topic), ['G', 'F', 'E']);
});

test('splitTopicMastery excludes a fully-mastered topic from "weak" even when nothing else remains', () => {
  const ranked = [topic('A', 100), topic('B', 100), topic('C', 100), topic('D', 100)];
  const { strongTopics, weakTopics } = splitTopicMastery(ranked);
  assert.deepEqual(strongTopics.map((t) => t.topic), ['A', 'B', 'C']);
  assert.deepEqual(weakTopics, [], 'the 4th topic is also 100% — nothing to review, not a stray duplicate-looking entry');
});

test('splitTopicMastery handles fewer than 3 topics without throwing', () => {
  const ranked = [topic('Only one', 50)];
  const { strongTopics, weakTopics } = splitTopicMastery(ranked);
  assert.deepEqual(strongTopics.map((t) => t.topic), ['Only one']);
  assert.deepEqual(weakTopics, []);
});

test('splitTopicMastery handles an empty list without throwing', () => {
  const { strongTopics, weakTopics } = splitTopicMastery([]);
  assert.deepEqual(strongTopics, []);
  assert.deepEqual(weakTopics, []);
});
