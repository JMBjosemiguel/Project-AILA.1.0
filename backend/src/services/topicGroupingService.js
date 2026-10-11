const crypto = require('crypto');
const adminAnalyticsModel = require('../models/adminAnalyticsModel');
const { callGemini, getResponseText, GEMINI_TIMEOUT_MS } = require('./geminiClient');

// AILA's primary audience is nursing students, so most real topic lists skew
// that way, but the same grouping has to work for any program (the local dev
// data has database-design and binary-tree topics too) — see GROUPING_RULES.
const GROUPING_SYSTEM_INSTRUCTION = [
  'You group academic topics that cover the same underlying concept or skill, even when worded differently, so an instructor sees one entry instead of several near-duplicates.',
  'AILA is primarily used by nursing students, so expect many topic lists to be nursing-related — for example "Infant Growth" and "Infant Measurements Guide" both cover infant growth and measurement and belong in one group, and "Binary Numbers", "Learning Binary Numbers" and "Calculating Binary Numbers" all belong in one "Binary Numbers" group.',
  'The same grouping rule applies to any subject, not only nursing — never assume a topic is nursing-related just because others are.',
  'Group topics ONLY when they clearly cover the same underlying concept or skill. Do not merge topics that merely share a broad subject but cover different concepts (e.g. "Infant Growth" and "Newborn Medication Dosage" are both pediatric but are NOT the same concept).',
  'Every topic given to you must appear in exactly one group. A topic with no close match is still valid as its own group of one.',
  'Group names must be short (2 to 5 words), immediately clear to an instructor skimming a list, and written in the same language as the topic titles.',
  'Respond with JSON only, matching the given schema. Use the exact numeric "id" given for each topic when listing it in "topicIds" — never invent an id or alter it.',
].join(' ');

// No empty-string enum values anywhere (Gemini's API rejects an enum member
// that is an empty string with a 400 "cannot be empty", which silently took
// down a different classifier call in this codebase before — see
// chatIntentService.js's INTENT_SCHEMA comment) — there are no enums here at all.
const GROUPING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    groups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          topicIds: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['name', 'topicIds'],
      },
    },
  },
  required: ['groups'],
};

// Output here is tiny per topic (an integer in an array, plus an amortized
// share of its group's name) compared to quiz generation, but scaled the same
// way: a flat thinking allowance plus a per-topic share, capped at a sanity
// ceiling well above anything a real topic list reaches.
const THINKING_ALLOWANCE_TOKENS = 600;
const PER_TOPIC_TOKENS = 30;
const MAX_OUTPUT_TOKENS_CAP = 3072;
function topicGroupOutputBudget(topicCount) {
  return Math.min(MAX_OUTPUT_TOKENS_CAP, THINKING_ALLOWANCE_TOKENS + Math.max(1, topicCount) * PER_TOPIC_TOKENS);
}

// Mirrors quizService's MIN_RETRY_BUDGET_MS: a retry shares the first
// attempt's overall deadline rather than getting a fresh GEMINI_TIMEOUT_MS, so
// two attempts together can never take longer than ~1x the timeout plus a
// little slack, and a retry is skipped entirely if too little budget remains.
const MIN_RETRY_BUDGET_MS = 3000;

function buildGroupingPrompt(topics) {
  const lines = topics.map((t) => `ID ${t.id}: "${t.title}" (course: ${t.courseName})`);
  return [
    `Group the following ${topics.length} topics as instructed.`,
    'Topics:',
    ...lines,
  ].join('\n');
}

// Parses a raw Gemini payload into `{ groups, finishReason, usage }`.
// `groups` is null for anything that isn't a clean, parseable array — a
// MAX_TOKENS cutoff or malformed JSON is treated as "no result", never a
// throw, so the caller's retry-then-fallback logic can handle it uniformly.
function readGroupingAttempt(payload) {
  const candidate = payload?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const usage = payload?.usageMetadata;
  let text = '';
  try {
    text = getResponseText(payload);
  } catch {
    // No usable text at all (e.g. only thinking tokens came back).
  }
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Truncated / malformed JSON — parsed stays null.
    }
  }
  const groups = Array.isArray(parsed?.groups) ? parsed.groups : null;
  return { groups, finishReason, usage };
}

// Server-side only: finishReason + token counts, never the prompt/response
// content (which includes topic titles and course names).
function logTruncatedGrouping(finishReason, usage) {
  console.error(`[topicGroupingService] grouping call returned no usable JSON (finishReason=${finishReason || 'unknown'}, usage=${JSON.stringify(usage || {})})`);
}

function titleCase(title) {
  return String(title || 'Untitled topic').trim().slice(0, 80) || 'Untitled topic';
}

// Validates and repairs raw Gemini output against the authoritative topic
// list: unknown ids are dropped, a topic already claimed by an earlier group
// is stripped from any later group that also claims it (first group wins —
// every topic ends up in AT MOST one group), and any topic left unclaimed
// after that becomes its own single-topic group named after its title.
// Never throws — `rawGroups` may be null (failed/fallback call) or anything
// malformed Gemini could have produced.
function validateGroups(rawGroups, topics) {
  const validIds = new Set(topics.map((t) => t.id));
  const claimed = new Set();
  const cleaned = [];

  if (Array.isArray(rawGroups)) {
    for (const group of rawGroups) {
      if (!group || typeof group !== 'object') continue;
      const name = typeof group.name === 'string' ? group.name.trim() : '';
      if (!name) continue; // check before claiming any ids, so a nameless group never orphans topics
      const ids = Array.isArray(group.topicIds) ? group.topicIds : [];
      const topicIds = [];
      for (const rawId of ids) {
        const id = Number(rawId);
        if (!validIds.has(id) || claimed.has(id)) continue;
        claimed.add(id);
        topicIds.push(id);
      }
      if (!topicIds.length) continue;
      cleaned.push({ name, topicIds });
    }
  }

  const leftover = topics.filter((t) => !claimed.has(t.id));
  for (const topic of leftover) {
    cleaned.push({ name: titleCase(topic.title), topicIds: [topic.id] });
  }

  return cleaned;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

// A stable id for a group — the same set of topic ids always hashes to the
// same group id, so it stays stable across a cache hit (no DB row backs a
// group; it only ever exists as a Gemini-defined grouping of real topic ids).
function groupId(topicIds) {
  return crypto.createHash('sha1').update([...topicIds].sort((a, b) => a - b).join(',')).digest('hex').slice(0, 10);
}

// Builds the final per-group shape from validated groups + raw (user, topic,
// progress) rows: average progress is pooled across every individual
// student-topic data point in the group (a weighted average by how many
// students progressed each topic), not a plain average of each topic's own
// average — matching "average progress across all students' progress in that
// group's topics".
function aggregateGroups(validatedGroups, rawRows, topicsById) {
  return validatedGroups.map(({ name, topicIds }) => {
    const groupRows = rawRows.filter((r) => topicIds.includes(r.id));
    const studentIds = new Set(groupRows.map((r) => r.user_id));

    const topicsDetail = topicIds.map((id) => {
      const topicRows = rawRows.filter((r) => r.id === id);
      const topicStudents = new Set(topicRows.map((r) => r.user_id));
      const meta = topicsById.get(id);
      return {
        id,
        title: meta?.title ?? `Topic ${id}`,
        courseName: meta?.courseName ?? '',
        avgPct: average(topicRows.map((r) => Number(r.progress_percent))),
        studentCount: topicStudents.size,
      };
    }).sort((a, b) => a.avgPct - b.avgPct); // weakest topic first within the group

    return {
      id: groupId(topicIds),
      name,
      avgPct: average(groupRows.map((r) => Number(r.progress_percent))),
      topicCount: topicIds.length,
      studentCount: studentIds.size,
      topics: topicsDetail,
    };
  });
}

// Strongest = top 5 by average. Weakest = the lowest 5 below 100%, excluding
// anything already picked as strongest — a fully-mastered group (avgPct 100)
// never appears in Weakest, and a group can never be in both lists.
function splitStrongestWeakest(groups) {
  const ranked = [...groups].sort((a, b) => b.avgPct - a.avgPct);
  const strongest = ranked.slice(0, 5);
  const strongIds = new Set(strongest.map((g) => g.id));
  const weakest = [...groups]
    .filter((g) => g.avgPct < 100 && !strongIds.has(g.id))
    .sort((a, b) => a.avgPct - b.avgPct)
    .slice(0, 5);
  return {
    strongestIds: strongest.map((g) => g.id),
    weakestIds: weakest.map((g) => g.id),
  };
}

// A deterministic hash of the current topic list (id + title + course), so
// the cache key changes exactly when the underlying topics would actually
// change what Gemini should see — independent of student progress values,
// which change far more often and don't affect grouping.
function hashTopicList(topics) {
  const sorted = [...topics].sort((a, b) => a.id - b.id);
  const key = sorted.map((t) => `${t.id}:${t.title}:${t.courseName}`).join('|');
  return crypto.createHash('sha256').update(key).digest('hex');
}

// In-memory only — see module comment below for restart behavior.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function getCached(hash) {
  const entry = cache.get(hash);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(hash);
    return null;
  }
  return entry.value;
}

function setCached(hash, value) {
  cache.set(hash, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function requestGroupsFromGemini(topics) {
  const generationConfig = {
    maxOutputTokens: topicGroupOutputBudget(topics.length),
    reasoningLevel: 'low',
    responseMimeType: 'application/json',
    responseSchema: GROUPING_SCHEMA,
  };
  const prompt = buildGroupingPrompt(topics);
  const deadline = Date.now() + GEMINI_TIMEOUT_MS;

  async function attempt() {
    const payload = await callGemini({
      systemInstruction: GROUPING_SYSTEM_INSTRUCTION,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
      timeoutMs: Math.max(1000, deadline - Date.now()),
    });
    const { groups, finishReason, usage } = readGroupingAttempt(payload);
    if (!groups) {
      logTruncatedGrouping(finishReason, usage);
      return null;
    }
    return groups;
  }

  let groups = await attempt();
  if (!groups && deadline - Date.now() > MIN_RETRY_BUDGET_MS) {
    groups = await attempt();
  }
  return groups; // null if both attempts failed/were truncated
}

// Builds the full { aiGrouped, generatedAt, groups, strongestIds, weakestIds }
// response for the current topic-progress data. `forceRegroup` (the
// "Regroup" button / POST endpoint) bypasses the cache and always calls
// Gemini fresh, still subject to the fallback below on failure.
//
// Cache behavior: a plain in-memory Map, keyed by hashTopicList() and alive
// for 24h. It lives only in this Node process's memory — nothing is written
// to the database — so a server restart (including a nodemon reload while
// developing) empties it entirely; the next GET after a restart always
// re-runs Gemini once and recaches.
async function getTopicGroups({ forceRegroup = false } = {}) {
  const rawRows = await adminAnalyticsModel.getTopicProgressRaw();

  const topicsById = new Map();
  for (const row of rawRows) {
    if (!topicsById.has(row.id)) {
      topicsById.set(row.id, { id: row.id, title: row.title, courseName: row.course_name });
    }
  }
  const topics = [...topicsById.values()];

  if (!topics.length) {
    return { aiGrouped: false, generatedAt: new Date().toISOString(), groups: [], strongestIds: [], weakestIds: [] };
  }

  const hash = hashTopicList(topics);
  if (!forceRegroup) {
    const cached = getCached(hash);
    if (cached) return cached;
  }

  let rawGroups = null;
  let aiGrouped = false;
  try {
    rawGroups = await requestGroupsFromGemini(topics);
    aiGrouped = rawGroups !== null;
  } catch (error) {
    // Gemini not configured / unreachable / rate-limited / timed out — the
    // page must still work, just without AI grouping.
    console.error(`[topicGroupingService] Gemini call failed, falling back to one-topic-per-group: ${error.message}`);
  }

  const validatedGroups = validateGroups(rawGroups, topics);
  const groups = aggregateGroups(validatedGroups, rawRows, topicsById);
  const { strongestIds, weakestIds } = splitStrongestWeakest(groups);

  const result = {
    aiGrouped,
    generatedAt: new Date().toISOString(),
    groups,
    strongestIds,
    weakestIds,
  };
  setCached(hash, result);
  return result;
}

module.exports = {
  getTopicGroups,
  // exported for unit tests and the one-off live-check script only — not
  // part of the intended public surface
  topicGroupOutputBudget,
  buildGroupingPrompt,
  readGroupingAttempt,
  validateGroups,
  aggregateGroups,
  splitStrongestWeakest,
  hashTopicList,
  requestGroupsFromGemini,
};
