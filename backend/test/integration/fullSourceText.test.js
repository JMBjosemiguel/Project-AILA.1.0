'use strict';
/*
 * A ~20,000-character uploaded resource reaches the Gemini prompt for quiz
 * generation end to end (resource row -> text chunks -> prompt), not just the
 * first 500 characters. Gemini is stubbed only around the service call.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.fullsource.${Date.now()}`;
const MARKER = 'ZEBRA_MARKER_9137';

function longDocument() {
  const paragraphs = [];
  for (let i = 1; paragraphs.join('\n\n').length < 19500; i += 1) {
    paragraphs.push(`Paragraph ${i}: the nephron filters blood and regulates fluid balance in the kidney.`);
  }
  paragraphs.push(`Final paragraph ${MARKER} about the loop of Henle.`);
  return paragraphs.join('\n\n');
}

test('full source text for quiz generation', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health');
    return;
  }

  const A = await createStudent(TAG, 'a');
  const realFetch = global.fetch;

  t.after(async () => {
    global.fetch = realFetch;
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('a long resource reaches the quiz prompt, marker near the end included', async () => {
    const doc = longDocument();
    assert.ok(doc.length > 19000);
    const resource = await db.query(
      "INSERT INTO resources (uploaded_by, title, type, file_path, file_size_bytes, extracted_text) VALUES (?, ?, 'pdf', NULL, ?, ?)",
      [A.id, `${TAG} kidney notes`, doc.length, doc]
    );

    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key-not-real';
    const bodies = [];
    global.fetch = async (url, init) => {
      bodies.push(JSON.parse(init.body));
      const items = Array.from({ length: 5 }, (_, i) => ({
        question: `Nephron question ${i + 1}?`, options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'Because A.',
      }));
      return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ topic: `${TAG} kidney quiz`, items }) }] } }] }) };
    };

    const quizService = require('../../src/services/quizService');
    const saved = await quizService.generateAndSaveQuiz({
      userId: A.id, topic: `${TAG} kidney quiz`, quizType: 'multiple_choice', itemCount: 5, sourceType: 'resource', sourceId: resource.insertId,
    });
    global.fetch = realFetch;

    assert.ok(saved.id, 'the quiz was saved');
    const prompt = bodies.map((b) => b.contents[0].parts.map((p) => p.text).join('\n')).join('\n---\n');
    assert.ok(prompt.includes(MARKER), 'text from the end of the resource is in the Gemini prompt');
    assert.ok(prompt.includes('Paragraph 1:'));
    assert.ok(prompt.length > 19000, `prompt carries the document (${prompt.length} characters)`);
    assert.match(prompt, /<student_quiz_source_material>/);
  });
});
