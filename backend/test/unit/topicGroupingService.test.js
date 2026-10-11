'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  topicGroupOutputBudget,
  readGroupingAttempt,
  validateGroups,
  aggregateGroups,
  splitStrongestWeakest,
  hashTopicList,
} = require('../../src/services/topicGroupingService');

function geminiPayload({ finishReason = 'STOP', text = '', usage = {} } = {}) {
  return {
    candidates: [{ finishReason, content: { parts: [{ text }] } }],
    usageMetadata: usage,
  };
}

const TOPICS = [
  { id: 1, title: 'Infant Growth Milestones', courseName: 'OB Nursing' },
  { id: 2, title: 'Infant Measurements Guide', courseName: 'OB Nursing' },
  { id: 3, title: 'Binary Numbers', courseName: 'Computer Science' },
  { id: 4, title: 'Learning Binary Numbers', courseName: 'Computer Science' },
  { id: 5, title: 'Wound Care Basics', courseName: 'Fundamentals of Nursing' },
];

test('topicGroupOutputBudget', async (t) => {
  await t.test('scales with topic count and is capped at a sanity ceiling', () => {
    const small = topicGroupOutputBudget(2);
    const large = topicGroupOutputBudget(500);
    assert.ok(small > 0);
    assert.ok(large > small);
    assert.ok(large <= 3072);
  });

  await t.test('never returns a non-positive budget for zero/negative input', () => {
    assert.ok(topicGroupOutputBudget(0) > 0);
    assert.ok(topicGroupOutputBudget(-5) > 0);
  });
});

test('readGroupingAttempt', async (t) => {
  await t.test('a clean STOP response with a groups array is accepted', () => {
    const payload = geminiPayload({ text: JSON.stringify({ groups: [{ name: 'Binary Numbers', topicIds: [3, 4] }] }) });
    const { groups } = readGroupingAttempt(payload);
    assert.deepEqual(groups, [{ name: 'Binary Numbers', topicIds: [3, 4] }]);
  });

  await t.test('MAX_TOKENS with incomplete JSON is treated as no result, not a throw', () => {
    const payload = geminiPayload({ finishReason: 'MAX_TOKENS', text: '{"groups":[{"name":"Bin' });
    const { groups, finishReason } = readGroupingAttempt(payload);
    assert.equal(groups, null);
    assert.equal(finishReason, 'MAX_TOKENS');
  });

  await t.test('a response with no "groups" array at all is rejected', () => {
    const payload = geminiPayload({ text: JSON.stringify({ somethingElse: [] }) });
    assert.equal(readGroupingAttempt(payload).groups, null);
  });

  await t.test('no candidates never throws', () => {
    assert.equal(readGroupingAttempt({ candidates: [] }).groups, null);
    assert.equal(readGroupingAttempt({}).groups, null);
  });
});

test('validateGroups', async (t) => {
  await t.test('accepts a clean grouping that covers every topic exactly once', () => {
    const raw = [
      { name: 'Infant Growth', topicIds: [1, 2] },
      { name: 'Binary Numbers', topicIds: [3, 4] },
      { name: 'Wound Care Basics', topicIds: [5] },
    ];
    const result = validateGroups(raw, TOPICS);
    assert.equal(result.length, 3);
    assert.deepEqual(result.map((g) => g.topicIds).flat().sort(), [1, 2, 3, 4, 5]);
  });

  await t.test('drops unknown topic ids Gemini invented', () => {
    const raw = [{ name: 'Infant Growth', topicIds: [1, 2, 999] }];
    const result = validateGroups(raw, TOPICS);
    const group = result.find((g) => g.name === 'Infant Growth');
    assert.deepEqual(group.topicIds, [1, 2]);
  });

  await t.test('a topic claimed by an earlier group is stripped from any later group (no overlap)', () => {
    const raw = [
      { name: 'Infant Growth', topicIds: [1, 2] },
      { name: 'Infant Stuff Again', topicIds: [2, 5] }, // 2 already claimed above
    ];
    const result = validateGroups(raw, TOPICS);
    const claimsOfTopic2 = result.filter((g) => g.topicIds.includes(2));
    assert.equal(claimsOfTopic2.length, 1, 'topic 2 must appear in at most one group');
    assert.equal(claimsOfTopic2[0].name, 'Infant Growth');
  });

  await t.test('a topic left out of every group becomes its own single-topic group named after it', () => {
    const raw = [{ name: 'Infant Growth', topicIds: [1, 2] }]; // 3, 4, 5 never mentioned
    const result = validateGroups(raw, TOPICS);
    const singletons = result.filter((g) => g.topicIds.length === 1);
    assert.equal(singletons.length, 3);
    assert.ok(singletons.some((g) => g.name === 'Binary Numbers' && g.topicIds[0] === 3));
    assert.ok(singletons.some((g) => g.name === 'Learning Binary Numbers' && g.topicIds[0] === 4));
    assert.ok(singletons.some((g) => g.name === 'Wound Care Basics' && g.topicIds[0] === 5));
  });

  await t.test('fallback: null/failed Gemini output makes every topic its own group', () => {
    const result = validateGroups(null, TOPICS);
    assert.equal(result.length, TOPICS.length);
    for (const topic of TOPICS) {
      const group = result.find((g) => g.topicIds[0] === topic.id);
      assert.ok(group, `topic ${topic.id} must have its own group`);
      assert.equal(group.topicIds.length, 1);
      assert.equal(group.name, topic.title);
    }
  });

  await t.test('malformed group entries (not an object, missing fields) are skipped without throwing', () => {
    const raw = [null, 'garbage', { name: 'No ids' }, { topicIds: [1] }, 42];
    const result = validateGroups(raw, TOPICS);
    // Every real topic still ends up grouped despite the garbage input.
    assert.deepEqual(result.map((g) => g.topicIds).flat().sort(), [1, 2, 3, 4, 5]);
  });

  await t.test('an empty topic list returns an empty result without throwing', () => {
    assert.deepEqual(validateGroups([{ name: 'X', topicIds: [1] }], []), []);
  });
});

test('aggregateGroups', async (t) => {
  const topicsById = new Map(TOPICS.map((t) => [t.id, { title: t.title, courseName: t.courseName }]));
  const rawRows = [
    { user_id: 100, id: 1, progress_percent: 80 },
    { user_id: 101, id: 1, progress_percent: 100 },
    { user_id: 100, id: 2, progress_percent: 60 },
    { user_id: 102, id: 5, progress_percent: 40 },
  ];
  const validated = [
    { name: 'Infant Growth', topicIds: [1, 2] },
    { name: 'Wound Care Basics', topicIds: [5] },
  ];

  await t.test('averages are pooled across every student-topic row in the group, not averaged per-topic', () => {
    const [infantGroup] = aggregateGroups(validated, rawRows, topicsById);
    // Pooled: (80 + 100 + 60) / 3 = 80 — NOT mean(90, 60) = 75, which would
    // silently under-weight topic 1's two students against topic 2's one.
    assert.equal(infantGroup.avgPct, 80);
  });

  await t.test('studentCount is the number of DISTINCT students across the group, not summed per-topic', () => {
    const [infantGroup] = aggregateGroups(validated, rawRows, topicsById);
    // user 100 appears under both topic 1 and topic 2 — counted once.
    assert.equal(infantGroup.studentCount, 2);
  });

  await t.test('topicCount and per-topic breakdown are included, weakest topic first', () => {
    const [infantGroup] = aggregateGroups(validated, rawRows, topicsById);
    assert.equal(infantGroup.topicCount, 2);
    assert.equal(infantGroup.topics[0].id, 2); // 60 < 90
    assert.equal(infantGroup.topics[0].avgPct, 60);
    assert.equal(infantGroup.topics[1].id, 1);
    assert.equal(infantGroup.topics[1].avgPct, 90);
  });

  await t.test('a single-topic group reduces to that topic\'s own average and student count', () => {
    const [, woundCare] = aggregateGroups(validated, rawRows, topicsById);
    assert.equal(woundCare.avgPct, 40);
    assert.equal(woundCare.studentCount, 1);
    assert.equal(woundCare.topicCount, 1);
  });

  await t.test('group ids are stable for the same topicIds set regardless of order', () => {
    const a = aggregateGroups([{ name: 'X', topicIds: [1, 2] }], rawRows, topicsById)[0];
    const b = aggregateGroups([{ name: 'X', topicIds: [2, 1] }], rawRows, topicsById)[0];
    assert.equal(a.id, b.id);
  });
});

test('splitStrongestWeakest', async (t) => {
  function group(id, avgPct) {
    return { id, name: id, avgPct, topicCount: 1, studentCount: 1, topics: [] };
  }

  await t.test('strongest is the top 5 by average', () => {
    const groups = [group('a', 90), group('b', 70), group('c', 100), group('d', 50), group('e', 60), group('f', 40)];
    const { strongestIds } = splitStrongestWeakest(groups);
    assert.deepEqual(strongestIds, ['c', 'a', 'b', 'e', 'd']);
  });

  await t.test('weakest excludes anything already in strongest, even with fewer than 11 groups total', () => {
    const groups = [group('a', 90), group('b', 70), group('c', 100), group('d', 50), group('e', 60)];
    const { strongestIds, weakestIds } = splitStrongestWeakest(groups);
    const overlap = weakestIds.filter((id) => strongestIds.includes(id));
    assert.deepEqual(overlap, [], 'no group may appear in both lists');
  });

  await t.test('a fully-mastered group (100%) never appears in weakest', () => {
    const groups = [group('a', 100), group('b', 100), group('c', 100)];
    const { weakestIds } = splitStrongestWeakest(groups);
    assert.deepEqual(weakestIds, []);
  });

  await t.test('weakest is ascending (lowest first) and capped at 5', () => {
    const groups = Array.from({ length: 12 }, (_, i) => group(`g${i}`, i * 5)); // all < 100, all distinct
    const { weakestIds } = splitStrongestWeakest(groups);
    assert.equal(weakestIds.length, 5);
    assert.deepEqual(weakestIds, ['g0', 'g1', 'g2', 'g3', 'g4']);
  });
});

test('hashTopicList', async (t) => {
  await t.test('is stable regardless of input order', () => {
    const a = hashTopicList(TOPICS);
    const b = hashTopicList([...TOPICS].reverse());
    assert.equal(a, b);
  });

  await t.test('changes when a topic is added, removed, or renamed', () => {
    const base = hashTopicList(TOPICS);
    assert.notEqual(hashTopicList(TOPICS.slice(0, -1)), base);
    assert.notEqual(
      hashTopicList(TOPICS.map((t) => (t.id === 1 ? { ...t, title: 'Renamed' } : t))),
      base
    );
  });

  await t.test('is independent of anything other than id/title/courseName (e.g. no progress data accepted)', () => {
    assert.equal(hashTopicList(TOPICS), hashTopicList(TOPICS.map((t) => ({ ...t }))));
  });
});
