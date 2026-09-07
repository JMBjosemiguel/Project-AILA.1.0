const ApiError = require('../utils/ApiError');
const { callGemini, getResponseText } = require('./geminiClient');
const { transaction } = require('../config/database');
const { query } = require('../config/database');
const { notifyUser } = require('../utils/notify');

const DIFFICULTY_TO_LESSON_DIFFICULTY = {
  beginner: 'easy',
  intermediate: 'medium',
  advanced: 'hard',
};

const ROADMAP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    modules: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          topics: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                lessons: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      title: { type: 'STRING' },
                      estimatedMinutes: { type: 'NUMBER' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title', 'lessons'],
            },
          },
        },
        required: ['title', 'topics'],
      },
    },
  },
  required: ['modules'],
};

function parseJson(payload, errorMessage) {
  try {
    return JSON.parse(getResponseText(payload));
  } catch {
    throw new ApiError(502, errorMessage);
  }
}

async function generateRoadmap({ userId, courseName, difficulty, goal }) {
  const prompt = [
    `Generate a college-level course roadmap for "${courseName}" at ${difficulty} level.`,
    `The student's learning goal is: "${goal}".`,
    'Produce 2-4 modules, each with 2-3 topics, each topic with 1-2 lessons.',
    'Lesson titles must be specific and build progressively toward the goal — not generic placeholders.',
    'Each lesson should include a reasonable estimatedMinutes (10-30) for how long it would take to read/study.',
    'This course can be for ANY college program (e.g. nursing, psychology, engineering, business, arts) — tailor the structure to the actual subject matter, do not assume it is a computer science course unless it explicitly is one.',
    'Do not include any text outside the JSON object.',
  ].join(' ');

  const payload = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 3072,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: ROADMAP_SCHEMA,
    },
  });

  const result = parseJson(payload, 'AILA could not generate that course roadmap. Please try again.');
  const modules = Array.isArray(result.modules) ? result.modules : [];

  if (!modules.length) {
    throw new ApiError(502, 'AILA could not generate that course roadmap. Please try again.');
  }

  const lessonDifficulty = DIFFICULTY_TO_LESSON_DIFFICULTY[difficulty] || 'medium';

  const subjectId = await transaction(async (connection) => {
    const [subjectResult] = await connection.execute(
      'INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, ?, ?, 1)',
      [userId, courseName, difficulty, goal]
    );
    const newSubjectId = subjectResult.insertId;

    for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
      const module_ = modules[moduleIndex];
      const [moduleResult] = await connection.execute(
        'INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, ?)',
        [newSubjectId, module_.title, moduleIndex]
      );
      const moduleId = moduleResult.insertId;

      const topics = Array.isArray(module_.topics) ? module_.topics : [];
      for (let topicIndex = 0; topicIndex < topics.length; topicIndex += 1) {
        const topic = topics[topicIndex];
        const [topicResult] = await connection.execute(
          'INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, ?)',
          [moduleId, topic.title, topicIndex]
        );
        const topicId = topicResult.insertId;

        const lessons = Array.isArray(topic.lessons) ? topic.lessons : [];
        for (const lesson of lessons) {
          const estimatedMinutes = Number(lesson.estimatedMinutes) || 15;
          await connection.execute(
            'INSERT INTO lessons (topic_id, title, content, difficulty, estimated_minutes) VALUES (?, ?, NULL, ?, ?)',
            [topicId, lesson.title, lessonDifficulty, estimatedMinutes]
          );
        }
      }
    }

    return newSubjectId;
  });

  await notifyUser(userId, {
    type: 'system',
    title: 'Course ready',
    body: `AILA built your "${courseName}" course roadmap. Open Learning Hub to start.`,
  });

  return subjectId;
}

const LESSON_CONTENT_PROMPT_SECTIONS = [
  'Objectives (3-5 bullet points of what the student will be able to do after this lesson)',
  'Summary (2-3 sentences)',
  'Main Explanation (the core teaching content, thorough but clear)',
  'Examples (at least one concrete, worked example)',
  'Real-World Applications',
  'Common Mistakes',
  'Reflection (one open-ended question to think about)',
  'Quick Recap (bullet list)',
  'Review Questions (3-5 questions, no answers needed — these are for self-study)',
];

// Per-lesson in-process guard: concurrent opens of the same not-yet-generated
// lesson (double click, two tabs) share one Gemini call instead of racing.
// Process-local — on a multi-instance deployment two instances could still each
// generate once, but the conditional UPDATE below keeps the first result and
// nothing partial is ever stored.
const lessonGenerationInFlight = new Map();

async function runLessonGeneration(lesson) {
  const existing = await query('SELECT content FROM lessons WHERE id = ? LIMIT 1', [lesson.id]);
  if (existing[0]?.content) {
    return existing[0].content;
  }

  const prompt = [
    `Write a complete lesson titled "${lesson.title}" for the topic "${lesson.topic_title}" in the module "${lesson.module_title}" of the course "${lesson.subject_name}".`,
    lesson.goal ? `The student's overall goal for this course is: "${lesson.goal}".` : '',
    `Target difficulty: ${lesson.difficulty || 'medium'}.`,
    'Structure the response in Markdown with these sections, in this order, each as a level-2 heading (##):',
    LESSON_CONTENT_PROMPT_SECTIONS.map((section, index) => `${index + 1}. ${section}`).join(' '),
    'Keep it focused and readable — this is one lesson, not an entire textbook chapter.',
  ].filter(Boolean).join(' ');

  const payload = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const content = getResponseText(payload); // throws on an empty response — nothing partial is stored

  // Only fill if still empty, so a racing generation's result is never clobbered.
  await query('UPDATE lessons SET content = ? WHERE id = ? AND content IS NULL', [content, lesson.id]);

  const stored = await query('SELECT content FROM lessons WHERE id = ? LIMIT 1', [lesson.id]);
  return stored[0]?.content || content;
}

async function generateLessonContent(lesson) {
  const key = String(lesson.id);
  if (lessonGenerationInFlight.has(key)) {
    return lessonGenerationInFlight.get(key);
  }

  const task = runLessonGeneration(lesson);
  lessonGenerationInFlight.set(key, task);
  try {
    return await task;
  } finally {
    lessonGenerationInFlight.delete(key);
  }
}

module.exports = {
  generateRoadmap,
  generateLessonContent,
};
