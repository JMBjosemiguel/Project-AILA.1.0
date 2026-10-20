'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const quizService = require('../../src/services/quizService');
const quizModel = require('../../src/models/quizModel');
const resourceModel = require('../../src/models/resourceModel');
const resourceTextCache = require('../../src/services/resourceTextCache');
const { NO_READABLE_TEXT_MESSAGE } = require('../../src/services/resourceTextExtraction');

test('quiz generation from a resource with no readable text', async (t) => {
  const realGetQuizSourceContext = quizModel.getQuizSourceContext;
  const realGetResourceById = resourceModel.getResourceById;

  t.beforeEach(() => {
    resourceTextCache.clear();
    quizModel.getQuizSourceContext = async () => null; // 'resource' sourceType is never handled here
  });
  t.afterEach(() => {
    quizModel.getQuizSourceContext = realGetQuizSourceContext;
    resourceModel.getResourceById = realGetResourceById;
    resourceTextCache.clear();
  });

  await t.test('generateAndSaveQuiz (one-shot) rejects with the friendly message, never reaching Gemini or the DB write', async () => {
    resourceModel.getResourceById = async () => ({ id: 42, type: 'pdf', file_path: null, extracted_text: null });

    await assert.rejects(
      () => quizService.generateAndSaveQuiz({
        userId: 1, topic: 'Anything', quizType: 'multiple_choice', itemCount: 5, sourceType: 'resource', sourceId: 42,
      }),
      (error) => error.statusCode === 400 && error.message === NO_READABLE_TEXT_MESSAGE
    );
  });

  await t.test('startBatchedQuizGeneration rejects with the same friendly message', async () => {
    resourceModel.getResourceById = async () => ({ id: 43, type: 'docx', file_path: null, extracted_text: '' });

    await assert.rejects(
      () => quizService.startBatchedQuizGeneration({
        userId: 1, topic: 'Anything', quizType: 'multiple_choice', itemCount: 40, sourceType: 'resource', sourceId: 43,
      }),
      (error) => error.statusCode === 400 && error.message === NO_READABLE_TEXT_MESSAGE
    );
  });
});
