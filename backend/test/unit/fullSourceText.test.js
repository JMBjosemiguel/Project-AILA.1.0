'use strict';
/*
 * Source material (an uploaded document, lesson content, a course outline) must
 * reach Gemini in full (up to the 120,000-character source limit, paragraphs
 * kept), while short student inputs keep the 500-character default.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SERVICE_PATH = path.join(__dirname, '../../src/services/quizService.js');
const CLIENT_PATH = path.join(__dirname, '../../src/services/geminiClient.js');
const { MAX_CHARS_FOR_AI } = require('../../src/utils/pdfText');
const { delimitStudentText, delimitSourceText } = require('../../src/services/personalizationService');

const MARKER = 'ZEBRA_MARKER_9137';

// ~20,000 characters of paragraphs, with the marker near the very end.
function longDocument() {
  const paragraphs = [];
  for (let i = 1; paragraphs.join('\n\n').length < 19500; i += 1) {
    paragraphs.push(`Paragraph ${i}: the nephron filters blood and regulates fluid balance in the kidney.`);
  }
  paragraphs.push(`Final paragraph ${MARKER} about the loop of Henle.`);
  return paragraphs.join('\n\n');
}

function mcItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    question: `Question ${i + 1} about the nephron?`,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 'A',
    explanation: 'Because A.',
  }));
}

// Loads quizService against a fetch stub that records every Gemini request body.
function loadWithFetchStub(reply) {
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(reply) }] } }] }) };
  };
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  process.env.GEMINI_TIMEOUT_MS = '5000';
  delete require.cache[require.resolve(CLIENT_PATH)];
  delete require.cache[require.resolve(SERVICE_PATH)];
  return { service: require(SERVICE_PATH), requests };
}

const promptOf = (requests) => requests.map((r) => r.contents[0].parts.map((p) => p.text).join('\n')).join('\n---\n');

test('source text reaches the Gemini prompt in full', async (t) => {
  const realFetch = global.fetch;
  t.afterEach(() => { global.fetch = realFetch; });
  const doc = longDocument();
  assert.ok(doc.length > 19000 && doc.length < 22000, `fixture is ~20,000 characters (${doc.length})`);
  assert.ok(doc.indexOf(MARKER) > doc.length - 100, 'the marker sits at the very end');

  await t.test('generateQuiz: a long resource reaches the prompt, marker and paragraphs included', async () => {
    const { service, requests } = loadWithFetchStub({ topic: 'Kidney', items: mcItems(3) });
    await service.generateQuiz({
      topic: 'Kidney', quizType: 'multiple_choice', itemCount: 3, sourceContextText: doc, isDocumentSource: true,
    });
    const prompt = promptOf(requests);
    assert.ok(prompt.includes(MARKER), 'content from the end of the document is in the prompt');
    assert.ok(prompt.includes('Paragraph 1:'), 'and the start');
    assert.ok(prompt.length > 19000);
    assert.ok(prompt.includes('regulates fluid balance in the kidney.\n\nParagraph 2:'), 'paragraph breaks are kept');
    assert.match(prompt, /<student_quiz_source_material>[\s\S]*<\/student_quiz_source_material>/);
  });

  await t.test('generateFlashcards: the long document reaches the prompt', async () => {
    const { service, requests } = loadWithFetchStub({ topic: 'Kidney', cards: [{ question: 'Q?', answer: 'A.' }] });
    await service.generateFlashcards({ topic: 'Kidney', count: 1, sourceContextText: doc });
    assert.ok(promptOf(requests).includes(MARKER));
  });

  await t.test('the batch plan and each batch get a document under the 30,000-character batch limit whole', async () => {
    const plan = loadWithFetchStub({ subtopics: ['One', 'Two', 'Three'] });
    await plan.service.buildSubtopicPlan({
      topic: 'Kidney', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 3, personalizationText: '', sourceContextText: doc,
    });
    assert.ok(promptOf(plan.requests).includes(MARKER), 'subtopic plan');

    const batch = loadWithFetchStub({ items: mcItems(2) });
    await batch.service.generateBatchItems({
      topic: 'Kidney', subtopic: 'Loop of Henle', quizType: 'multiple_choice', difficulty: 'medium', count: 2,
      personalizationText: '', existingKeys: [], sourceContextText: doc,
    });
    assert.ok(promptOf(batch.requests).includes(MARKER), 'batch items');
  });

  await t.test('a source longer than the limit is cut at the source limit, not at 500 characters', () => {
    const huge = `${'word '.repeat(MAX_CHARS_FOR_AI)}${MARKER}`;
    const out = delimitSourceText('document', huge);
    assert.ok(out.length > MAX_CHARS_FOR_AI - 100 && out.length <= MAX_CHARS_FOR_AI + 100);
    assert.ok(!out.includes(MARKER), 'only past the source limit is anything dropped');
  });
});

test('short student inputs keep the 500-character cap', async (t) => {
  const realFetch = global.fetch;
  t.afterEach(() => { global.fetch = realFetch; });

  await t.test('delimitStudentText defaults: 500 characters, one line', () => {
    const out = delimitStudentText('goal', `${'g'.repeat(900)} ${MARKER}`);
    assert.equal(out.match(/g{50,}/)[0].length, 500);
    assert.ok(!out.includes(MARKER));
    assert.equal(delimitStudentText('goal', 'line one\n\nline two'), '<student_goal>\nline one line two\n</student_goal>');
  });

  await t.test('a quiz topic (a student input) is still capped at 500 characters in the prompt', async () => {
    const { service, requests } = loadWithFetchStub({ topic: 'T', items: mcItems(1) });
    await service.generateQuiz({ topic: `${'T'.repeat(900)} ${MARKER}`, quizType: 'multiple_choice', itemCount: 1 });
    const prompt = promptOf(requests);
    assert.equal(prompt.match(/T{50,}/)[0].length, 500);
    assert.ok(!prompt.includes(MARKER));
  });
});
