'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

// Drives aiService.generateChatResponse in-process against the real local DB
// with a stubbed Gemini — same convention as chatIntent.test.js (re-require
// after installing the stub so the modules that destructured
// callGemini/getResponseText at load time pick it up).
const notify = require('../../src/utils/notify');
notify.notifyUser = async () => {};

function textPayload(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// Every message used in this file deliberately avoids "quiz"/"question(s)"/
// "flashcards" so chatIntentService's deterministic fast path handles intent
// with NO Gemini call — isolating these tests to exactly the one call
// `callGeminiChat` itself makes, per generateChatResponse call.
function installGeminiStub(chatReply = 'A plain reply.') {
  const gemini = require('../../src/services/geminiClient');
  const calls = [];
  gemini.callGemini = async (body) => {
    calls.push(body);
    return textPayload(chatReply);
  };
  for (const p of ['../../src/services/chatIntentService', '../../src/services/quizService', '../../src/services/aiService']) {
    delete require.cache[require.resolve(p)];
  }
  return { aiService: require('../../src/services/aiService'), calls };
}

const TAG = `qa.itest.chatattach.${Date.now()}`;

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix) {
  const email = `${TAG}.${suffix}@example.com`;
  const res = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', 'ITest', ?, 1)",
    [`CA-${suffix}-${Date.now() % 100000}`, email, suffix]
  );
  return { id: res.insertId, email };
}

async function makeResource(ownerId, title, extractedText) {
  const res = await db.query(
    "INSERT INTO resources (uploaded_by, title, type, extracted_text) VALUES (?, ?, 'pdf', ?)",
    [ownerId, title, extractedText]
  );
  return res.insertId;
}

async function conversationResourceId(conversationId) {
  const [row] = await db.query('SELECT resource_id FROM chat_conversations WHERE id = ?', [conversationId]);
  return row?.resource_id ?? null;
}

// The chat-reply call always carries a systemInstruction; a first-message
// conversation also makes a separate, unrelated title-generation call (no
// systemInstruction) — find the one that actually matters here.
function systemInstructionOf(calls) {
  return calls.find((c) => c.systemInstruction)?.systemInstruction || '';
}

test('chat attachments (resource grounding)', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  const A = await makeStudent('a');
  const B = await makeStudent('b');
  const resourceA = await makeResource(A.id, 'A\'s Networking Notes', 'Subnets divide a network into smaller segments.');
  const resourceA2 = await makeResource(A.id, 'A\'s OS Notes', 'A process is a running instance of a program.');
  const resourceB = await makeResource(B.id, 'B\'s Private Notes', 'This belongs only to B.');

  t.after(async () => {
    await db.query('DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id IN (?, ?))', [A.id, B.id]).catch(() => {});
    await db.query('DELETE FROM chat_conversations WHERE user_id IN (?, ?)', [A.id, B.id]).catch(() => {});
    await db.query('DELETE FROM resources WHERE id IN (?, ?, ?)', [resourceA, resourceA2, resourceB]).catch(() => {});
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('attaching a resource on a brand-new conversation grounds the reply and persists it', async () => {
    const { aiService, calls } = installGeminiStub('Here is what your notes say.');
    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Summarize the attached file for me.', conversationId: null, resourceId: resourceA,
    });

    assert.equal(result.messageType, 'text');
    assert.match(systemInstructionOf(calls), /Subnets divide a network/);
    assert.equal(await conversationResourceId(result.conversationId), resourceA);
  });

  let conversationId;
  await t.test('attaching a DIFFERENT resource mid-conversation updates it and grounds this reply on the new one', async () => {
    const first = await installGeminiStub('ok').aiService.generateChatResponse({
      userId: A.id, message: 'Hello there.', conversationId: null,
    });
    conversationId = first.conversationId;
    assert.equal(await conversationResourceId(conversationId), null, 'no resource attached yet');

    const { aiService, calls } = installGeminiStub('Here is what your OS notes say.');
    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Summarize the attached file for me.', conversationId, resourceId: resourceA2,
    });

    assert.match(systemInstructionOf(calls), /A process is a running instance/);
    assert.equal(await conversationResourceId(conversationId), resourceA2);
  });

  await t.test('a follow-up message without resending resourceId keeps grounding on the stored one', async () => {
    const { aiService, calls } = installGeminiStub('Still about your OS notes.');
    await aiService.generateChatResponse({
      userId: A.id, message: 'Tell me more about that.', conversationId,
    });

    assert.match(systemInstructionOf(calls), /A process is a running instance/);
    assert.equal(await conversationResourceId(conversationId), resourceA2, 'unchanged — no new resourceId was sent');
  });

  await t.test('another student\'s resourceId never grounds a reply, and never throws', async () => {
    const { aiService, calls } = installGeminiStub('A plain, ungrounded reply.');
    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Summarize the attached file for me.', conversationId: null, resourceId: resourceB,
    });

    assert.equal(result.messageType, 'text');
    assert.doesNotMatch(systemInstructionOf(calls), /This belongs only to B/);
  });
});
