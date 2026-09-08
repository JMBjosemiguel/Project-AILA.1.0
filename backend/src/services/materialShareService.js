const ApiError = require('../utils/ApiError');
const { transaction } = require('../config/database');
const shareModel = require('../models/materialShareModel');
const copyModel = require('../models/materialCopyModel');
const { generateShareToken, hashShareToken, looksLikeShareToken } = require('../utils/shareToken');

// Frontend read-only route. Kept relative so the client builds an absolute URL
// with its own origin — the backend never assumes a public host.
const SHARE_PATH = '/share';

// Controlled allowlist — `material_type` never reaches SQL directly.
const MATERIAL_TYPES = new Set(['subject', 'quiz']);

// One opaque message for every "can't view" case so a probe can't tell
// "revoked" from "never existed" from "deleted".
const UNAVAILABLE = 'This shared material is no longer available.';

function assertType(type) {
  if (!MATERIAL_TYPES.has(type)) throw new ApiError(404, 'Unsupported material type.');
}

function ownerDisplayName(first, last) {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (!f && !l) return 'An AILA learner';
  return l ? `${f} ${l[0]}.` : f;
}

function groupByTopic(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.topic_id)) map.set(row.topic_id, []);
    map.get(row.topic_id).push(row);
  }
  return map;
}

// --- share serializers (READ-ONLY, no owner internals, no answer key) ---

function serializeSharedSubject({ subject, rows, definitions, examples, hasAssessments }) {
  const defs = groupByTopic(definitions);
  const exs = groupByTopic(examples);
  const modules = new Map();

  for (const row of rows) {
    if (!modules.has(row.module_id)) modules.set(row.module_id, { title: row.module_title, topics: new Map() });
    if (!row.topic_id) continue;
    const topics = modules.get(row.module_id).topics;
    if (!topics.has(row.topic_id)) {
      topics.set(row.topic_id, {
        title: row.topic_title,
        lessons: [],
        keyTerms: (defs.get(row.topic_id) || []).map((d) => ({ term: d.term, definition: d.definition_text })),
        examples: (exs.get(row.topic_id) || []).map((e) => ({ title: e.title, content: e.content })),
      });
    }
    if (row.lesson_id) {
      topics.get(row.topic_id).lessons.push({
        title: row.lesson_title,
        content: row.lesson_content,
        difficulty: row.lesson_difficulty,
        estimatedMinutes: row.lesson_minutes,
      });
    }
  }

  const moduleList = [...modules.values()].map((m) => ({ title: m.title, topics: [...m.topics.values()] }));
  return {
    shareType: 'subject',
    title: subject.name,
    difficulty: subject.difficulty,
    goal: subject.goal,
    sharedBy: ownerDisplayName(subject.owner_first_name, subject.owner_last_name),
    moduleCount: moduleList.length,
    lessonCount: moduleList.reduce((n, m) => n + m.topics.reduce((k, t) => k + t.lessons.length, 0), 0),
    hasAssessments,
    modules: moduleList,
  };
}

function serializeSharedQuiz(quiz) {
  return {
    shareType: 'quiz',
    topic: quiz.topic,
    quizType: quiz.quiz_type,
    difficulty: quiz.difficulty,
    sharedBy: ownerDisplayName(quiz.owner_first_name, quiz.owner_last_name),
    questionCount: quiz.questions.length,
    items: quiz.questions.map((q) => ({ question: q.question, options: q.options })),
  };
}

// --- owner: status / create / revoke ----------------------------------

async function requireOwnedMaterial(userId, type, id) {
  assertType(type);
  const material = type === 'subject'
    ? await shareModel.subjectOwnedBy(Number(id), userId)
    : await shareModel.quizOwnedBy(Number(id), userId);
  if (!material) throw new ApiError(404, type === 'subject' ? 'Course not found.' : 'Quiz not found.');
  return material;
}

async function getShareStatus(userId, type, id) {
  const material = await requireOwnedMaterial(userId, type, id);
  const active = await shareModel.findActiveShareByMaterial(type, Number(id), userId);
  return {
    materialType: type,
    materialId: Number(id),
    visibility: material.visibility,
    shared: Boolean(active),
    createdAt: active?.created_at ?? null,
    tokenHint: active?.token_hint ?? null,
  };
}

/**
 * Create (or replace) the unlisted share link. Re-sharing revokes the previous
 * link and mints a fresh one — at most one active token per material — because
 * only the token HASH is stored and an old link can't be re-shown.
 */
async function createShare(userId, type, id, visibility = 'unlisted') {
  const material = await requireOwnedMaterial(userId, type, id);

  if (visibility !== 'unlisted') {
    throw new ApiError(400, 'Only "unlisted" sharing is supported. Use revoke to make a material private again.');
  }
  if (type === 'quiz' && material.assessment_kind && material.assessment_kind !== 'practice') {
    throw new ApiError(400, "A course assessment can't be shared on its own — share the course instead.");
  }

  const { raw, hash, hint } = generateShareToken();

  const createdAt = await transaction(async (connection) => {
    await shareModel.revokeActiveShares(type, Number(id), userId, connection);
    await shareModel.createShareRow({ materialType: type, materialId: Number(id), createdBy: userId, tokenHash: hash, tokenHint: hint }, connection);
    if (type === 'subject') await shareModel.setSubjectVisibility(Number(id), 'unlisted', connection);
    else await shareModel.setQuizVisibility(Number(id), 'unlisted', connection);
    return new Date();
  });

  return { materialType: type, materialId: Number(id), visibility: 'unlisted', token: raw, sharePath: `${SHARE_PATH}/${raw}`, createdAt };
}

async function revokeShare(userId, type, id) {
  await requireOwnedMaterial(userId, type, id);
  await transaction(async (connection) => {
    await shareModel.revokeActiveShares(type, Number(id), userId, connection);
    if (type === 'subject') await shareModel.setSubjectVisibility(Number(id), 'private', connection);
    else await shareModel.setQuizVisibility(Number(id), 'private', connection);
  });
  return { materialType: type, materialId: Number(id), visibility: 'private', shared: false };
}

// --- public: view / copy --------------------------------------------------

async function resolveToken(rawToken) {
  if (!looksLikeShareToken(rawToken)) throw new ApiError(404, UNAVAILABLE);
  const share = await shareModel.findActiveShareByHash(hashShareToken(rawToken));
  if (!share) throw new ApiError(404, UNAVAILABLE);
  return share;
}

async function viewSharedMaterial(rawToken) {
  const share = await resolveToken(rawToken);

  if (share.material_type === 'subject') {
    const data = await shareModel.getSubjectTreeForShare(share.material_id);
    if (!data || data.subject.visibility !== 'unlisted') throw new ApiError(404, UNAVAILABLE);
    return serializeSharedSubject(data);
  }

  const quiz = await shareModel.getQuizForShare(share.material_id);
  if (!quiz || quiz.visibility !== 'unlisted') throw new ApiError(404, UNAVAILABLE);
  return serializeSharedQuiz(quiz);
}

/**
 * Copy the shared material into the authenticated recipient's own materials.
 * COURSE -> deep-copy content only (no progress/attempts/assessments/snapshot).
 * QUIZ  -> new private practice quiz (no attempts, snapshot cleared).
 */
async function copySharedMaterial(recipientId, rawToken) {
  const share = await resolveToken(rawToken);

  if (share.material_type === 'subject') {
    const exists = await shareModel.getSubjectTreeForShare(share.material_id);
    if (!exists || exists.subject.visibility !== 'unlisted') throw new ApiError(404, UNAVAILABLE);
    const newId = await transaction((connection) => copyModel.copySubjectTree(share.material_id, recipientId, connection));
    if (!newId) throw new ApiError(404, UNAVAILABLE);
    return { materialType: 'subject', materialId: newId, name: exists.subject.name };
  }

  const quiz = await shareModel.getQuizForShare(share.material_id);
  if (!quiz || quiz.visibility !== 'unlisted') throw new ApiError(404, UNAVAILABLE);
  const newId = await transaction((connection) => copyModel.copyQuiz(share.material_id, recipientId, connection));
  if (!newId) throw new ApiError(404, UNAVAILABLE);
  return { materialType: 'quiz', materialId: newId, name: quiz.topic };
}

module.exports = {
  MATERIAL_TYPES,
  getShareStatus,
  createShare,
  revokeShare,
  viewSharedMaterial,
  copySharedMaterial,
  serializeSharedSubject,
  serializeSharedQuiz,
};
