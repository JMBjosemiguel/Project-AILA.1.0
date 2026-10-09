'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SERVICE_PATH = path.join(__dirname, '../../src/services/chatIntentService.js');
const CLIENT_PATH = path.join(__dirname, '../../src/services/geminiClient.js');

function loadService() {
  delete require.cache[require.resolve(CLIENT_PATH)];
  delete require.cache[require.resolve(SERVICE_PATH)];
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  process.env.GEMINI_TIMEOUT_MS = '5000';
  return require(SERVICE_PATH);
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubClassifierResponse(obj) {
  global.fetch = async () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
}

test('chatIntentService.classifyIntent', async (t) => {
  const realFetch = global.fetch;
  t.afterEach(() => { global.fetch = realFetch; });

  await t.test('a message that never mentions quiz/flashcards short-circuits to chat with no Gemini call', async () => {
    let called = false;
    global.fetch = async () => { called = true; return jsonResponse(200, {}); };
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'What is REST?', priorMessages: [] });

    assert.equal(decision.type, 'chat');
    assert.equal(decision.needsClarification, false);
    assert.equal(called, false, 'the classifier must not be called at all');
  });

  await t.test('REQUEST_QUIZ with a clear topic resolves immediately, no clarification', async () => {
    stubClassifierResponse({ intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'subnetting', quizType: '', itemCount: 0, difficulty: '' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'Quiz me about subnetting.', priorMessages: [] });

    assert.equal(decision.type, 'quiz');
    assert.equal(decision.needsClarification, false);
    assert.equal(decision.topic, 'subnetting');
    assert.equal(decision.nextPendingIntent, null);
  });

  await t.test('REQUEST_QUIZ with no topic asks for clarification and stores a resumable pending intent', async () => {
    stubClassifierResponse({ intent: 'REQUEST_QUIZ', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'Quiz me.', priorMessages: [] });

    assert.equal(decision.needsClarification, true);
    assert.match(decision.clarificationQuestion, /topic/i);
    assert.equal(decision.nextPendingIntent.type, 'quiz');
  });

  await t.test('REQUEST_QUIZ with an ambiguous topic lists the candidates in the clarification question', async () => {
    stubClassifierResponse({
      intent: 'REQUEST_QUIZ', topicConfidence: 'ambiguous', topic: '',
      candidateTopics: ['subnetting', 'REST APIs'], quizType: '', itemCount: 0, difficulty: '',
    });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'Quiz me on that.', priorMessages: [] });

    assert.equal(decision.needsClarification, true);
    assert.match(decision.clarificationQuestion, /subnetting/i);
    assert.match(decision.clarificationQuestion, /rest apis/i);
    assert.deepEqual(decision.nextPendingIntent.candidateTopics, ['subnetting', 'REST APIs']);
  });

  await t.test('NORMAL_CHAT (talking about a quiz, not requesting one) never generates a quiz', async () => {
    stubClassifierResponse({ intent: 'NORMAL_CHAT', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'I have a quiz tomorrow about networking.', priorMessages: [] });

    assert.equal(decision.type, 'chat');
    assert.equal(decision.needsClarification, false);
  });

  await t.test('REQUEST_EXPLANATION about a quiz never generates one', async () => {
    stubClassifierResponse({ intent: 'REQUEST_EXPLANATION', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'What is a quiz?', priorMessages: [] });

    assert.equal(decision.type, 'chat');
  });

  await t.test('explicit quizType/itemCount/difficulty pass through, clamped to the safe maximum', async () => {
    stubClassifierResponse({ intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'Java inheritance', quizType: 'multiple_choice', itemCount: 999, difficulty: 'hard' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'Make a difficult quiz with 999 questions about Java inheritance.', priorMessages: [] });

    assert.equal(decision.itemCount, 20, 'clamped to MAX_ITEMS regardless of what the classifier said');
    assert.equal(decision.difficulty, 'hard');
    assert.equal(decision.quizType, 'multiple_choice');
  });

  await t.test('an invalid quizType/difficulty from the classifier is dropped, not trusted verbatim', async () => {
    stubClassifierResponse({ intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'X', quizType: 'essay', itemCount: 0, difficulty: 'impossible' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'quiz me about X', priorMessages: [] });

    assert.equal(decision.quizType, null);
    assert.equal(decision.difficulty, null);
  });

  await t.test('a pending clarification resolves a short next reply as the topic — no Gemini call needed', async () => {
    let called = false;
    global.fetch = async () => { called = true; return jsonResponse(200, {}); };
    const service = loadService();

    const decision = await service.classifyIntent({
      prompt: 'Operating Systems',
      priorMessages: [],
      pendingIntent: { type: 'quiz', quizType: null, itemCount: null, difficulty: null },
    });

    assert.equal(decision.type, 'quiz');
    assert.equal(decision.needsClarification, false);
    assert.equal(decision.topic, 'Operating Systems');
    assert.equal(called, false, 'resolving a bare topic answer is fully deterministic');
  });

  await t.test('a reply to a pending clarification that reads like a new request is classified fresh instead', async () => {
    stubClassifierResponse({ intent: 'REQUEST_EXPLANATION', topicConfidence: 'none', topic: '', quizType: '', itemCount: 0, difficulty: '' });
    const service = loadService();

    const decision = await service.classifyIntent({
      prompt: 'Actually, can you explain HTTP instead?',
      priorMessages: [],
      pendingIntent: { type: 'quiz', quizType: null, itemCount: null, difficulty: null },
    });

    assert.equal(decision.type, 'chat', 'the escape phrase is honored — not force-fit as a topic answer');
  });

  await t.test('a classifier failure (network error) falls back to chat, never fabricates a quiz', async () => {
    global.fetch = async () => { throw new Error('simulated network failure'); };
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'quiz me about DNS', priorMessages: [] });

    assert.equal(decision.type, 'chat');
    assert.equal(decision.needsClarification, false);
  });

  await t.test('a classifier response with malformed JSON falls back to chat', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not valid json' }] } }] }) });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'quiz me about DNS', priorMessages: [] });

    assert.equal(decision.type, 'chat');
  });

  // quizType/difficulty are NOT in INTENT_SCHEMA's `required` list, so a real
  // Gemini response can simply omit them (as opposed to the old '' enum
  // value, which the API now rejects outright — see the schema test below).
  // This must resolve exactly the same as the old '' did: null, so
  // aiService.js's `decision.quizType || 'multiple_choice'` /
  // `decision.difficulty || personalization... || undefined` fallbacks are
  // unchanged.
  await t.test('quizType/difficulty absent from the classifier response fall back to null, same as before', async () => {
    stubClassifierResponse({ intent: 'REQUEST_QUIZ', topicConfidence: 'clear', topic: 'DNS' });
    const service = loadService();

    const decision = await service.classifyIntent({ prompt: 'quiz me about DNS', priorMessages: [] });

    assert.equal(decision.type, 'quiz');
    assert.equal(decision.topic, 'DNS');
    assert.equal(decision.quizType, null);
    assert.equal(decision.difficulty, null);
  });
});

test('chatIntentService INTENT_SCHEMA', async (t) => {
  await t.test('no enum anywhere in the schema contains an empty string', () => {
    // Gemini's structured-output validation rejects an empty string as an
    // enum value outright (400, before generating anything) — this silently
    // took down EVERY classifier call via the fail-safe catch in
    // classifyIntent() until it was caught. This walks the whole schema so a
    // future field can't reintroduce the same mistake unnoticed.
    const service = loadService();

    function collectEmptyEnums(schema, path, found) {
      if (!schema || typeof schema !== 'object') return;
      if (Array.isArray(schema.enum)) {
        if (schema.enum.some((v) => v === '')) found.push(path);
      }
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          collectEmptyEnums(value, `${path}.${key}`, found);
        }
      }
      if (schema.items) collectEmptyEnums(schema.items, `${path}[]`, found);
    }

    const found = [];
    collectEmptyEnums(service.INTENT_SCHEMA, 'INTENT_SCHEMA', found);
    assert.deepEqual(found, []);
  });
});
