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
  matchButtonTemplate,
  isVagueReference,
  isQuizFollowupPhrase,
  extractExplicitQuizType,
  extractExplicitItemCount,
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
    // Neither field is in `required` below, so Gemini can simply omit it when
    // it has no explicit value — an empty string in an enum list is rejected
    // by the API outright (400: "cannot be empty"), which was silently taking
    // down EVERY classifier call (caught by the fail-safe in classifyIntent()
    // and misread as "normal chat").
    quizType: { type: 'STRING', enum: ['multiple_choice', 'true_false', 'identification'] },
    itemCount: { type: 'INTEGER' },
    difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
  },
  required: ['intent', 'topicConfidence'],
};

// Parses a stored quiz/flashcards chat message back into the settings it was
// generated with — null for anything else (plain text, or unparseable JSON).
// `sourceResourceId` is set by aiService.generateFromLinkedResource on the
// object before it's stringified, so a document-grounded quiz/flashcards
// message can be told apart from a plain-topic one later (see
// findLastGeneratedItem below — the "another one" follow-up fix).
function parseGeneratedRow(row) {
  if (row.message_type !== 'quiz' && row.message_type !== 'flashcards') return null;
  try {
    const parsed = JSON.parse(row.message_text);
    const itemCount = row.message_type === 'quiz'
      ? (Array.isArray(parsed.items) ? parsed.items.length : null)
      : (Array.isArray(parsed.cards) ? parsed.cards.length : null);
    return {
      type: row.message_type,
      topic: parsed.topic || null,
      quizType: row.message_type === 'quiz' ? (parsed.quizType || null) : null,
      itemCount,
      sourceResourceId: parsed.sourceResourceId || null,
    };
  } catch {
    return null;
  }
}

// The real item count (not guessed) keeps this placeholder from being the
// thing Gemini quotes back with the WRONG count if it ever paraphrases this
// line in a later reply (see aiService.callGeminiChat's own sanitizing for
// the other half of that fix).
function summarizeForClassifier(row) {
  if (row.message_type === 'text') return row.message_text;
  const generated = parseGeneratedRow(row);
  if (generated) {
    const countPrefix = generated.itemCount ? `${generated.itemCount}-item ` : '';
    return row.message_type === 'quiz'
      ? `[Generated a ${countPrefix}quiz about "${generated.topic}"]`
      : `[Generated ${countPrefix}flashcards about "${generated.topic}"]`;
  }
  return '[Generated interactive content]';
}

// "Another one" / "one more" right after AILA generated a quiz or flashcards
// means "do that again" — only when the MOST RECENT bot message (whatever it
// is) was actually a quiz/flashcards. A plain chat reply in between means the
// quiz is no longer "the previous AILA message", so this intentionally does
// not search further back.
function findLastGeneratedItem(priorMessages) {
  for (let i = priorMessages.length - 1; i >= 0; i -= 1) {
    const row = priorMessages[i];
    if (row.sender === 'user') continue;
    return parseGeneratedRow(row);
  }
  return null;
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
    clarificationReason: null,
    clarificationQuestion: null,
    candidateTopics: [],
    topic: null,
    quizType: null,
    itemCount: null,
    difficulty: null,
    sourceResourceId: null,
    nextPendingIntent: null,
  };
}

// `sourceResourceId` is only ever set by the "another one" follow-up path
// below (recovered from the previous quiz/flashcards message) — every other
// caller of resolvedDecision leaves it null, meaning "generate from the
// topic string", same as before this field existed.
function resolvedDecision(type, { topic, quizType, itemCount, difficulty, sourceResourceId = null }) {
  return {
    type,
    needsClarification: false,
    clarificationReason: null,
    clarificationQuestion: null,
    candidateTopics: [],
    topic,
    quizType: normalizeQuizType(quizType),
    itemCount: itemCount ? clampCount(itemCount) : null,
    difficulty: normalizeDifficulty(difficulty),
    sourceResourceId,
    nextPendingIntent: null,
  };
}

// `reason` ('no_topic' | 'ambiguous_topic') is exposed on the returned
// decision so the caller (aiService.generateReply) can tell "nothing to go
// on" apart from "several distinct things to choose between" — only the
// former defers to a linked resource instead of actually asking the student.
function clarificationDecision(type, { reason, candidateTopics = [], quizType, itemCount, difficulty }) {
  const noun = type === 'flashcards' ? 'flashcards' : 'quiz';
  const question = reason === 'ambiguous_topic'
    ? `We've discussed ${candidateTopics.slice(0, 4).join(', ')}. Which one would you like the ${noun} to cover?`
    : `Sure. What topic would you like the ${noun} to cover?`;

  return {
    type,
    needsClarification: true,
    clarificationReason: reason,
    clarificationQuestion: question,
    candidateTopics,
    topic: null,
    quizType: normalizeQuizType(quizType),
    itemCount: itemCount ? clampCount(itemCount) : null,
    difficulty: normalizeDifficulty(difficulty),
    sourceResourceId: null,
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
  // The chat's own "Generate Quiz" / "Generate Flashcards" buttons fill in a
  // complete, unambiguous request — resolve it directly, before even
  // checking for a pending clarification, rather than leaving it to the
  // classifier (or a stale pendingIntent) to recognize the UI's own wording.
  const templateMatch = matchButtonTemplate(prompt);
  if (templateMatch) {
    return resolvedDecision(templateMatch.type, {
      topic: templateMatch.topic,
      quizType: templateMatch.type === 'quiz' ? 'multiple_choice' : null,
      itemCount: templateMatch.itemCount,
      difficulty: null,
    });
  }

  if (pendingIntent && (pendingIntent.type === 'quiz' || pendingIntent.type === 'flashcards')) {
    if (looksLikeTopicAnswer(prompt) && !isVagueReference(cleanTopic(prompt))) {
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

  // "Another one" / "one more" never says "quiz" or "flashcards" itself, so
  // without this it would never even reach the mentionsQuiz gate below and
  // would silently fall to normal chat. Resolved deterministically from the
  // previous quiz/flashcards message's own stored settings — not re-asked of
  // the classifier — so "same topic/resource, same settings" is exact rather
  // than an LLM's guess from a one-line history summary. extractExplicit*
  // still takes priority over the remembered value on the rare phrasing that
  // both matches the follow-up pattern AND states its own count/type.
  if (isQuizFollowupPhrase(prompt)) {
    const last = findLastGeneratedItem(priorMessages);
    if (last) {
      return resolvedDecision(last.type, {
        topic: last.topic,
        quizType: extractExplicitQuizType(prompt) || last.quizType,
        itemCount: extractExplicitItemCount(prompt) || last.itemCount,
        difficulty: null,
        sourceResourceId: last.sourceResourceId,
      });
    }
    // Nothing to follow up on — "another one" alone doesn't mention
    // quiz/flashcards either, so the gate below correctly sends it to chat.
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
  // The classifier (low reasoning, asked to just echo back a number/word
  // already present in the message) isn't reliable enough to trust alone —
  // a deterministic regex read of the CURRENT message wins whenever it finds
  // one explicitly stated, exactly like matchButtonTemplate's own itemCount
  // already does. This is what was silently losing an explicit "20 items"
  // down to the default count whenever the classifier's own extraction
  // missed it (e.g. a vague-reference quiz resolved against a linked
  // resource — see aiService.generateFromLinkedResource).
  const params = {
    quizType: extractExplicitQuizType(prompt) || classification.quizType,
    itemCount: extractExplicitItemCount(prompt) || classification.itemCount,
    difficulty: classification.difficulty,
  };

  if (
    topicConfidence === 'clear'
    && typeof classification.topic === 'string'
    && classification.topic.trim()
    && !isVagueReference(cleanTopic(classification.topic))
  ) {
    return resolvedDecision(type, { topic: cleanTopic(classification.topic), ...params });
  }

  if (topicConfidence === 'ambiguous' && Array.isArray(classification.candidateTopics) && classification.candidateTopics.length >= 2) {
    return clarificationDecision(type, { reason: 'ambiguous_topic', candidateTopics: classification.candidateTopics, ...params });
  }

  return clarificationDecision(type, { reason: 'no_topic', ...params });
}

module.exports = {
  classifyIntent,
  // exposed for unit tests only — not part of the intended public surface
  INTENT_SCHEMA,
};
