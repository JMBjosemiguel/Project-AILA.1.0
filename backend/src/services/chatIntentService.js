/**
 * Replaces the old "does the message contain the word quiz" trigger with a
 * real intent decision. Two layers, cheapest first:
 *
 *   1. Deterministic (utils/chatIntent.js) — resolves a pending clarification
 *      answer, and skips straight to NORMAL_CHAT for the majority of
 *      messages that don't mention quiz/flashcards at all. No Gemini call.
 *   2. Structured Gemini classification — only reached when the message
 *      actually mentions quiz/flashcards, so it has to decide whether that's
 *      an ACTION request ("quiz me about X") or just conversation about one
 *      ("I have a quiz tomorrow"). Low reasoning level; small, schema-bound
 *      JSON response.
 *
 * The hard rule this whole module exists to enforce: a quiz is never
 * generated unless intent is explicit enough AND a topic is known with
 * reasonable confidence. If either is missing, the caller gets back a
 * clarification question instead — never a guess.
 */
const { callGemini, getResponseText } = require('./geminiClient');
const {
  mentionsQuiz,
  mentionsFlashcards,
  clampCount,
  normalizeQuizType,
  normalizeDifficulty,
  looksLikeTopicAnswer,
  cleanTopic,
} = require('../utils/chatIntent');

const MAX_HISTORY_FOR_CLASSIFIER = 8;

const CLASSIFIER_SYSTEM_INSTRUCTION = [
  'You are an intent classifier for AILA, an academic assistant chatbot. Read the',
  'student\'s latest message, plus recent conversation context, and decide what they want.',
  '',
  'intent categories:',
  '- REQUEST_QUIZ: the student is EXPLICITLY asking to be quizzed / tested / given quiz',
  '  questions right NOW (e.g. "quiz me", "make a quiz", "give me 10 questions on X").',
  '  Merely containing the word "quiz" is NOT enough on its own.',
  '- REQUEST_FLASHCARDS: same, but for flashcards.',
  '- REQUEST_EXPLANATION: asking to understand, explain, or clarify a concept or result',
  '  (including "what is a quiz", "why did I get this quiz question wrong",',
  '  "explain my quiz score" — these ask ABOUT a quiz, they do not request one).',
  '- REQUEST_COURSE_OR_LEARNING_CONTENT: asking for structured lesson/course material.',
  '- REQUEST_REVIEWER_OR_SUMMARY: asking for a review sheet, summary, or study guide.',
  '- AMBIGUOUS_REQUEST: unclear what kind of help is wanted.',
  '- NORMAL_CHAT: anything else — including talking ABOUT an exam/quiz (an upcoming one,',
  '  a past score, needing general help studying for one) WITHOUT actually asking AILA to',
  '  generate one right now.',
  '',
  'Examples (message -> intent):',
  '"quiz" -> REQUEST_QUIZ (no topic given)',
  '"make a quiz" -> REQUEST_QUIZ (no topic given)',
  '"quiz me about subnetting" -> REQUEST_QUIZ (topic: subnetting)',
  '"give me 10 questions about REST APIs" -> REQUEST_QUIZ (topic: REST APIs, count: 10)',
  '"I have some questions about photosynthesis" -> REQUEST_EXPLANATION (asking to understand it, not to be tested)',
  '"I have a quiz tomorrow" -> NORMAL_CHAT',
  '"my quiz was difficult" -> NORMAL_CHAT',
  '"I need help with my quiz" -> NORMAL_CHAT',
  '"there is a quiz in our networking class" -> NORMAL_CHAT',
  '"what is a quiz?" -> REQUEST_EXPLANATION',
  '"can you explain my quiz score?" -> REQUEST_EXPLANATION',
  '"why did I get this quiz answer wrong?" -> REQUEST_EXPLANATION',
  '',
  'If intent is REQUEST_QUIZ or REQUEST_FLASHCARDS, also decide the topic:',
  '- topicConfidence "clear": the topic is stated in the CURRENT message, OR the',
  '  immediately preceding conversation was unambiguously about exactly one topic and the',
  '  student is clearly referring back to it (e.g. "quiz me on this" right after a single-',
  '  topic explanation). Put that topic in `topic`.',
  '- topicConfidence "ambiguous": several different topics were discussed recently and it is',
  '  not clear which one the student means. List 2-4 of them in `candidateTopics`.',
  '- topicConfidence "none": no topic is stated or reasonably inferable. Leave `topic` empty',
  '  — never invent or guess a subject.',
  '',
  'Only fill quizType / itemCount / difficulty if the student stated them explicitly in the',
  'CURRENT message (e.g. "10 questions", "difficult", "true or false"). Leave them empty/0',
  'otherwise — never invent a value.',
].join('\n');

const INTENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: [
        'REQUEST_QUIZ',
        'REQUEST_FLASHCARDS',
        'REQUEST_EXPLANATION',
        'REQUEST_COURSE_OR_LEARNING_CONTENT',
        'REQUEST_REVIEWER_OR_SUMMARY',
        'AMBIGUOUS_REQUEST',
        'NORMAL_CHAT',
      ],
    },
    topicConfidence: { type: 'STRING', enum: ['clear', 'ambiguous', 'none'] },
    topic: { type: 'STRING' },
    candidateTopics: { type: 'ARRAY', items: { type: 'STRING' } },
    quizType: { type: 'STRING', enum: ['multiple_choice', 'true_false', 'identification', ''] },
    itemCount: { type: 'INTEGER' },
    difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard', ''] },
  },
  required: ['intent', 'topicConfidence'],
};

function summarizeForClassifier(row) {
  if (row.message_type === 'text') return row.message_text;
  try {
    const parsed = JSON.parse(row.message_text);
    if (row.message_type === 'quiz') return `[Generated a quiz about "${parsed.topic}"]`;
    if (row.message_type === 'flashcards') return `[Generated flashcards about "${parsed.topic}"]`;
  } catch {
    // fall through
  }
  return '[Generated interactive content]';
}

async function runClassifier(prompt, priorMessages) {
  const contents = [
    ...priorMessages.slice(-MAX_HISTORY_FOR_CLASSIFIER).map((row) => ({
      role: row.sender === 'user' ? 'user' : 'model',
      parts: [{ text: summarizeForClassifier(row) }],
    })),
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const payload = await callGemini({
    systemInstruction: CLASSIFIER_SYSTEM_INSTRUCTION,
    contents,
    generationConfig: {
      maxOutputTokens: 300,
      reasoningLevel: 'low',
      responseMimeType: 'application/json',
      responseSchema: INTENT_SCHEMA,
    },
  });

  return JSON.parse(getResponseText(payload));
}

function emptyChatDecision() {
  return {
    type: 'chat',
    needsClarification: false,
    clarificationQuestion: null,
    candidateTopics: [],
    topic: null,
    quizType: null,
    itemCount: null,
    difficulty: null,
    nextPendingIntent: null,
  };
}

function resolvedDecision(type, { topic, quizType, itemCount, difficulty }) {
  return {
    type,
    needsClarification: false,
    clarificationQuestion: null,
    candidateTopics: [],
    topic,
    quizType: normalizeQuizType(quizType),
    itemCount: itemCount ? clampCount(itemCount) : null,
    difficulty: normalizeDifficulty(difficulty),
    nextPendingIntent: null,
  };
}

function clarificationDecision(type, { reason, candidateTopics = [], quizType, itemCount, difficulty }) {
  const noun = type === 'flashcards' ? 'flashcards' : 'quiz';
  const question = reason === 'ambiguous_topic'
    ? `We've discussed ${candidateTopics.slice(0, 4).join(', ')}. Which one would you like the ${noun} to cover?`
    : `Sure. What topic would you like the ${noun} to cover?`;

  return {
    type,
    needsClarification: true,
    clarificationQuestion: question,
    candidateTopics,
    topic: null,
    quizType: normalizeQuizType(quizType),
    itemCount: itemCount ? clampCount(itemCount) : null,
    difficulty: normalizeDifficulty(difficulty),
    nextPendingIntent: {
      type,
      quizType: normalizeQuizType(quizType),
      itemCount: itemCount ? clampCount(itemCount) : null,
      difficulty: normalizeDifficulty(difficulty),
      candidateTopics,
    },
  };
}

/**
 * Decide what a chat message wants. `pendingIntent` is whatever is currently
 * stored on chat_conversations.pending_intent for this conversation (null if
 * there is none) — it is how a clarification answer on the student's NEXT
 * message gets understood as answering AILA's question rather than a new,
 * unrelated request.
 */
async function classifyIntent({ prompt, priorMessages = [], pendingIntent = null }) {
  if (pendingIntent && (pendingIntent.type === 'quiz' || pendingIntent.type === 'flashcards')) {
    if (looksLikeTopicAnswer(prompt)) {
      return resolvedDecision(pendingIntent.type, {
        topic: cleanTopic(prompt),
        quizType: pendingIntent.quizType,
        itemCount: pendingIntent.itemCount,
        difficulty: pendingIntent.difficulty,
      });
    }
    // Doesn't read like an answer to "what topic?" — treat as a fresh
    // message below; the caller is responsible for clearing the now-stale
    // pending_intent unless this classification asks for clarification again.
  }

  if (!mentionsQuiz(prompt) && !mentionsFlashcards(prompt)) {
    return emptyChatDecision();
  }

  let classification;
  try {
    classification = await runClassifier(prompt, priorMessages);
  } catch (error) {
    // Fail-safe, not fail-open: if we can't classify confidently, never guess
    // into generating a quiz. Normal chat can still respond helpfully.
    console.error(`[chatIntentService] classification failed, falling back to normal chat: ${error.message}`);
    return emptyChatDecision();
  }

  const intent = classification?.intent;
  const type = intent === 'REQUEST_QUIZ' ? 'quiz' : intent === 'REQUEST_FLASHCARDS' ? 'flashcards' : null;

  if (!type) {
    return emptyChatDecision();
  }

  const topicConfidence = classification.topicConfidence;
  const params = {
    quizType: classification.quizType,
    itemCount: classification.itemCount,
    difficulty: classification.difficulty,
  };

  if (topicConfidence === 'clear' && typeof classification.topic === 'string' && classification.topic.trim()) {
    return resolvedDecision(type, { topic: cleanTopic(classification.topic), ...params });
  }

  if (topicConfidence === 'ambiguous' && Array.isArray(classification.candidateTopics) && classification.candidateTopics.length >= 2) {
    return clarificationDecision(type, { reason: 'ambiguous_topic', candidateTopics: classification.candidateTopics, ...params });
  }

  return clarificationDecision(type, { reason: 'no_topic', ...params });
}

module.exports = {
  classifyIntent,
};
