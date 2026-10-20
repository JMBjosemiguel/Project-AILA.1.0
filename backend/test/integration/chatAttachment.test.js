'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag, api, serverReachable, createStudent } = require('./helpers');
const { NO_READABLE_TEXT_MESSAGE } = require('../../src/services/resourceTextExtraction');

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
  const resourceEmpty = await makeResource(A.id, 'A\'s Scanned Handout', null);

  t.after(async () => {
    await db.query('DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id IN (?, ?))', [A.id, B.id]).catch(() => {});
    await db.query('DELETE FROM chat_conversations WHERE user_id IN (?, ?)', [A.id, B.id]).catch(() => {});
    await db.query('DELETE FROM resources WHERE id IN (?, ?, ?, ?)', [resourceA, resourceA2, resourceB, resourceEmpty]).catch(() => {});
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

  await t.test('attaching another student\'s resourceId is rejected with a clear message, nothing is sent', async () => {
    const { aiService, calls } = installGeminiStub('should never be used');
    await assert.rejects(
      () => aiService.generateChatResponse({
        userId: A.id, message: 'Summarize the attached file for me.', conversationId: null, resourceId: resourceB,
      }),
      (err) => err.statusCode === 404 && /could not be found|access/i.test(err.message)
    );
    assert.equal(calls.length, 0, 'rejected before any Gemini call — no wasted work, no accidental grounding');
  });

  await t.test('attaching a resource with no readable text at all returns the friendly message without ever calling Gemini for the reply', async () => {
    const { aiService, calls } = installGeminiStub('should never be used for the reply');
    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Summarize the attached file for me.', conversationId: null, resourceId: resourceEmpty,
    });

    assert.equal(result.response, NO_READABLE_TEXT_MESSAGE);
    // A first message also triggers an unrelated title-generation Gemini call
    // (see systemInstructionOf's doc comment) — what matters here is that no
    // call carries a systemInstruction, i.e. the actual chat-reply call
    // (the one that would have been grounded) never happened at all.
    assert.equal(systemInstructionOf(calls), '', 'the friendly message is deterministic — it never needs a Gemini call for the reply itself');
  });

  await t.test('removing the attachment (explicit null) detaches it and stops grounding, owner only', async () => {
    const started = await installGeminiStub('ok').aiService.generateChatResponse({
      userId: A.id, message: 'Start a notes conversation.', conversationId: null, resourceId: resourceA,
    });
    assert.equal(await conversationResourceId(started.conversationId), resourceA);

    // Another student can't clear A's conversation (ownership-scoped lookup).
    await assert.rejects(
      () => installGeminiStub('n/a').aiService.generateChatResponse({
        userId: B.id, message: 'hi', conversationId: started.conversationId, resourceId: null,
      }),
      (err) => err.statusCode === 404
    );
    assert.equal(await conversationResourceId(started.conversationId), resourceA, 'untouched by the rejected attempt');

    const { aiService, calls } = installGeminiStub('A plain, ungrounded reply.');
    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Never mind, forget the file.', conversationId: started.conversationId, resourceId: null,
    });

    assert.equal(result.messageType, 'text');
    assert.doesNotMatch(systemInstructionOf(calls), /Subnets divide a network/);
    assert.equal(await conversationResourceId(started.conversationId), null, 'detached — explicit null, not just "not sent"');

    // A further follow-up with no resourceId field at all stays detached —
    // "undefined" (not sent) must never be confused with "null" (detach).
    const { aiService: aiService2, calls: calls2 } = installGeminiStub('Still ungrounded.');
    await aiService2.generateChatResponse({ userId: A.id, message: 'One more thing.', conversationId: started.conversationId });
    assert.doesNotMatch(systemInstructionOf(calls2), /Subnets divide a network/);
    assert.equal(await conversationResourceId(started.conversationId), null);
  });

  await t.test('reopening a conversation (getConversation) shows its attached file, only while still accessible', async () => {
    const started = await installGeminiStub('ok').aiService.generateChatResponse({
      userId: A.id, message: 'Start another notes conversation.', conversationId: null, resourceId: resourceA2,
    });

    const { aiService } = installGeminiStub();
    const reopened = await aiService.getConversation(A.id, started.conversationId);
    assert.deepEqual(reopened.conversation.resource, { id: resourceA2, title: 'A\'s OS Notes' });
    assert.equal(reopened.conversation.resource_id, resourceA2);

    // Another student can't read A's conversation at all (opaque 404).
    await assert.rejects(() => aiService.getConversation(B.id, started.conversationId), (err) => err.statusCode === 404);

    // Access revoked since attaching (soft-deleted here) — resource_id must
    // NOT stay stale next to a null resource; both report "not attached."
    await db.query('UPDATE resources SET deleted_at = NOW() WHERE id = ?', [resourceA2]);
    try {
      const reopenedAfterRevoke = await aiService.getConversation(A.id, started.conversationId);
      assert.equal(reopenedAfterRevoke.conversation.resource, null);
      assert.equal(reopenedAfterRevoke.conversation.resource_id, null);
    } finally {
      await db.query('UPDATE resources SET deleted_at = NULL WHERE id = ?', [resourceA2]);
    }
  });

  await t.test('a conversation created via a resourceId on the first message (the "Ask AILA" path) shows its file too', async () => {
    const started = await installGeminiStub('ok').aiService.generateChatResponse({
      userId: A.id, message: 'Can you help me understand this?', conversationId: null, resourceId: resourceA,
    });

    const { aiService } = installGeminiStub();
    const reopened = await aiService.getConversation(A.id, started.conversationId);
    assert.deepEqual(reopened.conversation.resource, { id: resourceA, title: 'A\'s Networking Notes' });
  });

  await t.test('a conversation with no attachment reports resource: null', async () => {
    const started = await installGeminiStub('ok').aiService.generateChatResponse({
      userId: A.id, message: 'Just a plain question, nothing attached.', conversationId: null,
    });

    const { aiService } = installGeminiStub();
    const reopened = await aiService.getConversation(A.id, started.conversationId);
    assert.equal(reopened.conversation.resource, null);
  });

  // The one HTTP-level test in this file (every test above drives
  // aiService.generateChatResponse in-process, bypassing Express entirely) —
  // this specifically exercises sendMessageValidator's `resource_id` coercion.
  // generateChatResponse's ownership check only runs when `typeof resourceId
  // === 'number'`; without the validator's .toInt(), a numeric STRING skips
  // that check entirely and (per the real bug this closes) would go on to
  // call Gemini grounded on a resource the student never got checked against
  // — this asserts the request is rejected before any Gemini call happens,
  // using another student's PRIVATE resource so a regression here would be a
  // real cross-student data leak, not just a validation nicety.
  await t.test('resource_id sent as a numeric STRING over real HTTP is still ownership-checked (validator coercion)', async () => {
    if (!(await serverReachable())) return; // covered by the in-process tests above either way
    const student = await createStudent(TAG, 'httpstring');
    try {
      const res = await api('POST', '/chat', {
        token: student.token,
        body: { message: 'Summarize the attached file for me.', resource_id: String(resourceB) },
      });
      assert.equal(res.status, 404);
    } finally {
      await db.query('DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)', [student.id]).catch(() => {});
      await db.query('DELETE FROM chat_conversations WHERE user_id = ?', [student.id]).catch(() => {});
    }
  });
});
