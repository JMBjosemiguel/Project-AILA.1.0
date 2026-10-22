'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

// Drive aiService in-process against the real local DB with a stubbed Gemini,
// same trick as personalization.test.js: re-require after the stub is
// installed so the modules that destructure callGemini/getResponseText at
// load time (chatIntentService, quizService, aiService) pick it up.
const notify = require('../../src/utils/notify');
notify.notifyUser = async () => {};

function jsonPayload(obj) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] };
}
function textPayload(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// Routes each Gemini call to the right canned response by inspecting its
// systemInstruction — the three callers in this flow (classifier, quiz
// generation, normal chat reply) each have a distinctive one. Flashcards
// generation sends no systemInstruction at all, so it's identified instead
// by its responseSchema shape (the only caller whose schema has `cards`).
function installGeminiStub({ classify, quiz, flashcards, chat } = {}) {
  const gemini = require('../../src/services/geminiClient');
  const calls = [];
  gemini.callGemini = async (body) => {
    calls.push(body);
    const instr = body.systemInstruction || '';
    if (instr.includes('intent classifier for AILA')) {
      if (!classify) throw new Error('unexpected classifier call — no `classify` stub provided');
      const next = Array.isArray(classify) ? classify.shift() : classify;
      return jsonPayload(next);
    }
    if (instr.includes('You generate college quizzes')) {
      if (!quiz) throw new Error('unexpected quiz-generation call — no `quiz` stub provided');
      return jsonPayload(quiz);
    }
    if (body.generationConfig?.responseSchema?.properties?.cards) {
      if (!flashcards) throw new Error('unexpected flashcards-generation call — no `flashcards` stub provided');
      return jsonPayload(flashcards);
    }
    if (!chat) throw new Error('unexpected normal-chat call — no `chat` stub provided');
    return textPayload(chat);
  };
  for (const p of [
    '../../src/services/chatIntentService',
    '../../src/services/quizService',
    '../../src/services/aiService',
  ]) {
    delete require.cache[require.resolve(p)];
  }
  return { aiService: require('../../src/services/aiService'), calls };
}

const TAG = `qa.itest.chatintent.${Date.now()}`;

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix) {
  const email = `${TAG}.${suffix}@example.com`;
  const res = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', 'ITest', ?, 1)",
    [`CI-${suffix}-${Date.now() % 100000}`, email, suffix]
  );
  return { id: res.insertId, email };
}

async function pendingIntentFor(conversationId) {
  const rows = await db.query('SELECT pending_intent FROM chat_conversations WHERE id = ?', [conversationId]);
  const raw = rows[0]?.pending_intent;
  return raw ? JSON.parse(raw) : null;
}

// No file_path — resourceTextExtraction.getResourceChunks falls back to this
// stored snapshot (same fixture shape as chatAttachment.test.js), which is
// all generateFromLinkedResource needs: a resource row + its extracted text.
async function makeResourceWithText(ownerId, title, extractedText) {
  const res = await db.query(
    "INSERT INTO resources (uploaded_by, title, type, extracted_text) VALUES (?, ?, 'pdf', ?)",
    [ownerId, title, extractedText]
  );
  return res.insertId;
}

test('chatbot quiz intent', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  const A = await makeStudent('a');
  const B = await makeStudent('b');

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('"quiz me about subnetting" generates a quiz about subnetting, no clarification', async () => {
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'subnetting', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: 'Subnetting', quizType: 'multiple_choice', items: [
        { question: 'What is a subnet mask?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'because A' },
      ] },
    });

    const result = await aiService.generateChatResponse({ userId: A.id, message: 'quiz me about subnetting', conversationId: null });

    assert.equal(result.messageType, 'quiz');
    assert.equal(result.data.topic, 'Subnetting');
    assert.equal(result.data.items.length, 1);
    assert.equal(await pendingIntentFor(result.conversationId), null, 'resolved — nothing left pending');
  });

  await t.test('bare "quiz" asks for a topic instead of generating one', async () => {
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
    });

    const result = await aiService.generateChatResponse({ userId: A.id, message: 'quiz', conversationId: null });

    assert.equal(result.messageType, 'text');
    assert.match(result.response, /what topic/i);
    const pending = await pendingIntentFor(result.conversationId);
    assert.equal(pending.type, 'quiz');
  });

  await t.test('"make me a quiz" (Case B) clarifies, then a bare topic answer (same conversation) generates it', async () => {
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
    });
    const first = await aiService.generateChatResponse({ userId: A.id, message: 'Make me a quiz.', conversationId: null });
    assert.equal(first.messageType, 'text');
    assert.match(first.response, /what topic/i);

    // The topic-answer resolution is fully deterministic (utils/chatIntent.js
    // looksLikeTopicAnswer) — no classifier call needed for this step, so no
    // `classify` stub is provided; installGeminiStub would throw if one were
    // attempted, which itself proves no Gemini call happened here.
    const { aiService: aiService2 } = installGeminiStub({
      quiz: { topic: 'Operating Systems', quizType: 'multiple_choice', items: [
        { question: 'What is a process?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'B', explanation: 'because B' },
      ] },
    });
    const second = await aiService2.generateChatResponse({ userId: A.id, message: 'Operating Systems', conversationId: first.conversationId });

    assert.equal(second.messageType, 'quiz');
    assert.equal(second.data.topic, 'Operating Systems');
    assert.equal(await pendingIntentFor(first.conversationId), null);
  });

  await t.test('conversational mentions of "quiz" never generate one (normal chat instead)', async () => {
    const cases = [
      'I have a quiz tomorrow',
      'My quiz was difficult',
      'I need help with my quiz',
      'There is a quiz in our networking class',
    ];
    for (const message of cases) {
      const { aiService } = installGeminiStub({
        classify: { intent: 'NORMAL_CHAT', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
        chat: "Good luck! Let me know if you'd like help reviewing.",
      });
      // eslint-disable-next-line no-await-in-loop
      const result = await aiService.generateChatResponse({ userId: A.id, message, conversationId: null });
      assert.equal(result.messageType, 'text', `"${message}" must not generate a quiz`);
      assert.equal(await pendingIntentFor(result.conversationId), null);
    }
  });

  await t.test('"what is a quiz?" and "explain my quiz score" answer, they do not generate one', async () => {
    for (const message of ['What is a quiz?', 'Can you explain my quiz score?']) {
      const { aiService } = installGeminiStub({
        classify: { intent: 'REQUEST_EXPLANATION', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
        chat: 'A quiz is a short set of questions used to check understanding.',
      });
      // eslint-disable-next-line no-await-in-loop
      const result = await aiService.generateChatResponse({ userId: A.id, message, conversationId: null });
      assert.equal(result.messageType, 'text', `"${message}" must not generate a quiz`);
    }
  });

  await t.test('a message with no quiz/flashcard mention never calls the classifier at all', async () => {
    // A first message in a new conversation makes two Gemini calls regardless
    // (the chat reply + a conversation-title call, both routed through the
    // generic `chat` stub here since neither sets a distinctive
    // systemInstruction) — what matters is that NEITHER of them is the
    // classifier call, which installGeminiStub would reject since no
    // `classify` stub was provided.
    const { aiService, calls } = installGeminiStub({ chat: 'REST stands for Representational State Transfer.' });
    const result = await aiService.generateChatResponse({ userId: A.id, message: 'What is REST?', conversationId: null });
    assert.equal(result.messageType, 'text');
    assert.equal(calls.length, 2, 'chat reply + title generation — no classifier call for a message that never mentions quiz/flashcards');
  });

  await t.test('context TCP/UDP then "quiz me on this" uses that topic without asking again (Case C)', async () => {
    const { aiService } = installGeminiStub({ chat: 'TCP is connection-oriented; UDP is connectionless.' });
    const first = await aiService.generateChatResponse({ userId: A.id, message: 'Explain TCP and UDP to me.', conversationId: null });

    const { aiService: aiService2 } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'TCP and UDP', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: 'TCP and UDP', quizType: 'multiple_choice', items: [
        { question: 'Which is connectionless?', options: ['TCP', 'UDP', 'HTTP', 'FTP'], correctAnswer: 'UDP', explanation: 'UDP has no handshake' },
      ] },
    });
    const second = await aiService2.generateChatResponse({ userId: A.id, message: 'Quiz me on this.', conversationId: first.conversationId });

    assert.equal(second.messageType, 'quiz');
    assert.equal(second.data.topic, 'TCP and UDP');
  });

  await t.test('ambiguous prior context (Case D) asks which topic instead of guessing', async () => {
    const { aiService } = installGeminiStub({
      classify: {
        intent: 'REQUEST_QUIZ', topicConfidence: 'ambiguous',
        topic: '', candidateTopics: ['subnetting', 'REST APIs'],
        quizType: '', itemCount: 0, difficulty: '',
      },
    });
    const result = await aiService.generateChatResponse({ userId: A.id, message: 'Quiz me on that.', conversationId: null });

    assert.equal(result.messageType, 'text');
    assert.match(result.response, /subnetting/i);
    assert.match(result.response, /rest apis/i);
    const pending = await pendingIntentFor(result.conversationId);
    assert.deepEqual(pending.candidateTopics, ['subnetting', 'REST APIs']);
  });

  await t.test('"give me 10 questions about REST APIs" carries the explicit count through', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      question: `Q${i}?`, options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'x',
    }));
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'REST APIs', quizType: '', itemCount: 10, difficulty: '' },
      quiz: { topic: 'REST APIs', quizType: 'multiple_choice', items },
      chat: 'REST APIs Quiz', // first message in a new conversation also triggers a title-generation call
    });
    const result = await aiService.generateChatResponse({ userId: A.id, message: 'Give me 10 questions about REST APIs.', conversationId: null });
    assert.equal(result.data.items.length, 10);
  });

  await t.test('a Gemini classification failure never guesses into a quiz — falls back to chat', async () => {
    const gemini = require('../../src/services/geminiClient');
    for (const p of ['../../src/services/chatIntentService', '../../src/services/quizService', '../../src/services/aiService']) {
      delete require.cache[require.resolve(p)];
    }
    gemini.callGemini = async (body) => {
      if ((body.systemInstruction || '').includes('intent classifier')) {
        throw new Error('simulated Gemini outage');
      }
      return textPayload('Sure, tell me more about what you need for your quiz.');
    };
    const aiService = require('../../src/services/aiService');

    const result = await aiService.generateChatResponse({ userId: A.id, message: 'quiz me about DNS', conversationId: null });
    assert.equal(result.messageType, 'text', 'must not fabricate a quiz when classification fails');
  });

  await t.test('a malformed/empty quiz generation surfaces a friendly error, not a broken empty quiz', async () => {
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'gibberish topic', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: 'gibberish topic', quizType: 'multiple_choice', items: [{ question: '', correctAnswer: '', explanation: '' }] },
    });
    await assert.rejects(
      () => aiService.generateChatResponse({ userId: A.id, message: 'quiz me about gibberish topic', conversationId: null }),
      (err) => err.statusCode === 502
    );
  });

  await t.test('clarification state never leaks across conversations (same user)', async () => {
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
    });
    const chatOne = await aiService.generateChatResponse({ userId: A.id, message: 'quiz me', conversationId: null });
    assert.ok(await pendingIntentFor(chatOne.conversationId));

    const { aiService: aiService2, calls } = installGeminiStub({ chat: 'Sure — REST is an architectural style.' });
    const chatTwo = await aiService2.generateChatResponse({ userId: A.id, message: 'What is REST?', conversationId: null });

    assert.notEqual(chatTwo.conversationId, chatOne.conversationId);
    assert.equal(chatTwo.messageType, 'text');
    // "What is REST?" never mentions quiz/flashcards, so no classifier call;
    // the 2 calls are the chat reply + this new conversation's title — never
    // a topic-answer path carried over from chat one's still-pending state.
    assert.equal(calls.length, 2, 'no leaked clarification handling from chat one');
    assert.ok(await pendingIntentFor(chatOne.conversationId), "chat one's pending clarification is untouched by chat two");
  });

  await t.test('clarification state never leaks across users', async () => {
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
    });
    const aChat = await aiService.generateChatResponse({ userId: A.id, message: 'quiz me', conversationId: null });
    assert.ok(await pendingIntentFor(aChat.conversationId));

    // B has never seen this conversation — attempting to continue it 404s,
    // exactly like every other cross-user chat isolation check in this app.
    const { aiService: aiService2 } = installGeminiStub({});
    await assert.rejects(
      () => aiService2.generateChatResponse({ userId: B.id, message: 'Operating Systems', conversationId: aChat.conversationId }),
      (err) => err.statusCode === 404
    );
  });

  // --- Part B: "this"/"that"/"it" and a linked resource must never become
  // the topic itself, and a linked resource stands in for a missing one. ---

  await t.test('"about this" after a REST explanation resolves to REST, not the literal word "this" (the chat UI\'s own quiz-button template)', async () => {
    const { aiService } = installGeminiStub({ chat: 'REST stands for Representational State Transfer.' });
    const first = await aiService.generateChatResponse({ userId: A.id, message: 'What is REST?', conversationId: null });

    // Before the fix, this exact button-generated message ("generate a
    // N-item multiple choice quiz about <topic>") skipped the classifier
    // entirely via matchButtonTemplate and used "this" as the topic
    // verbatim. Now a vague topic there falls through to the classifier —
    // which actually sees the prior REST explanation and can resolve it.
    const { aiService: aiService2, calls } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'REST APIs', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: 'REST APIs', quizType: 'multiple_choice', items: [
        { question: 'What does REST stand for?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'x' },
      ] },
    });
    const second = await aiService2.generateChatResponse({
      userId: A.id, message: 'Generate a 10-item multiple choice quiz about this', conversationId: first.conversationId,
    });

    assert.equal(second.messageType, 'quiz');
    assert.equal(second.data.topic, 'REST APIs');
    assert.ok(calls.some((c) => (c.systemInstruction || '').includes('intent classifier for AILA')), 'the vague button-template topic must reach the classifier, not bypass it');
  });

  await t.test('a resource-linked chat with no topic generates the quiz from that resource, not a clarification question', async () => {
    const resourceId = await makeResourceWithText(A.id, `${TAG} Networking Notes`, 'Subnets divide a network into smaller segments.');
    const { aiService, calls } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: `${TAG} Networking Notes`, quizType: 'multiple_choice', items: [
        { question: 'What do subnets do?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'x' },
      ] },
    });

    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Generate a quiz about', conversationId: null, resourceId,
    });

    assert.equal(result.messageType, 'quiz');
    assert.equal(result.data.topic, `${TAG} Networking Notes`);
    const quizCall = calls.find((c) => (c.systemInstruction || '').includes('You generate college quizzes'));
    assert.match(JSON.stringify(quizCall), /Subnets divide a network/, 'the resource text must reach the quiz-generation prompt');
    assert.equal(await pendingIntentFor(result.conversationId), null, 'resolved via the resource — nothing left pending');
  });

  await t.test('a resource-linked chat asking "quiz about this document" also generates from the resource (vague reference, not a real topic)', async () => {
    const resourceId = await makeResourceWithText(A.id, `${TAG} OS Notes`, 'A process is a running instance of a program.');
    const { aiService, calls } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'this document', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: `${TAG} OS Notes`, quizType: 'multiple_choice', items: [
        { question: 'What is a process?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'x' },
      ] },
    });

    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Quiz me about this document.', conversationId: null, resourceId,
    });

    assert.equal(result.messageType, 'quiz');
    const quizCall = calls.find((c) => (c.systemInstruction || '').includes('You generate college quizzes'));
    assert.match(JSON.stringify(quizCall), /A process is a running instance/);
  });

  await t.test('a resource-linked chat asking for flashcards with no topic generates from the resource too', async () => {
    const resourceId = await makeResourceWithText(A.id, `${TAG} OS Flash Notes`, 'A thread is the smallest unit of CPU scheduling.');
    const { aiService, calls } = installGeminiStub({
      classify: { intent: 'REQUEST_FLASHCARDS', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
      flashcards: { topic: `${TAG} OS Flash Notes`, cards: [{ question: 'What is a thread?', answer: 'The smallest unit of CPU scheduling.' }] },
    });

    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Make flashcards about', conversationId: null, resourceId,
    });

    assert.equal(result.messageType, 'flashcards');
    const flashcardsCall = calls.find((c) => c.generationConfig?.responseSchema?.properties?.cards);
    assert.match(JSON.stringify(flashcardsCall), /smallest unit of CPU scheduling/);
  });

  await t.test('an explicit topic overrides a linked resource entirely', async () => {
    const resourceId = await makeResourceWithText(A.id, `${TAG} Networking Notes 2`, 'Subnets divide a network into smaller segments.');
    const { aiService, calls } = installGeminiStub({
      classify: { intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'photosynthesis', quizType: '', itemCount: 0, difficulty: '' },
      quiz: { topic: 'Photosynthesis', quizType: 'multiple_choice', items: [
        { question: 'What pigment captures light?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'x' },
      ] },
    });

    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'Quiz me about photosynthesis.', conversationId: null, resourceId,
    });

    assert.equal(result.data.topic, 'Photosynthesis');
    const quizCall = calls.find((c) => (c.systemInstruction || '').includes('You generate college quizzes'));
    assert.doesNotMatch(JSON.stringify(quizCall), /Subnets divide a network/, 'an explicit topic must not pull in the linked resource');
  });

  // Already covered by the existing "'what is a quiz?' ... answer, they do
  // not generate one" test above — re-asserted here with a resource linked,
  // since B4 requires this to hold even when a resource is attached.
  await t.test('"what is a quiz" with a resource linked still does not generate a quiz', async () => {
    const resourceId = await makeResourceWithText(A.id, `${TAG} Irrelevant Notes`, 'Irrelevant content.');
    const { aiService } = installGeminiStub({
      classify: { intent: 'REQUEST_EXPLANATION', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' },
      chat: 'A quiz is a short set of questions used to check understanding.',
    });

    const result = await aiService.generateChatResponse({
      userId: A.id, message: 'What is a quiz?', conversationId: null, resourceId,
    });

    assert.equal(result.messageType, 'text');
  });
});
