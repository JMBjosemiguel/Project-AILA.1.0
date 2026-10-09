// Cheap, deterministic helpers used by chatIntentService. These exist to (a)
// avoid an LLM call on the vast majority of chat messages that never mention
// quiz/flashcards at all, and (b) resolve a pending clarification answer
// ("what topic?" -> "Operating Systems") without needing one either. Anything
// that actually requires understanding intent — e.g. telling "quiz me about
// X" apart from "I have a quiz about X tomorrow" — is deliberately NOT done
// here with more regex; that decision belongs to the classifier.

const QUIZ_TYPE_PATTERNS = [
  [/true\s*(or|\/)?\s*false/i, 'true_false'],
  [/identification/i, 'identification'],
  [/multiple[\s-]*choice/i, 'multiple_choice'],
];

const QUIZ_TYPES = new Set(['multiple_choice', 'true_false', 'identification']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

const MAX_ITEMS = 20;
const DEFAULT_ITEMS = 10;

// Words that mean "this is a fresh message, not a bare topic answer" even
// when they show up right after AILA asked "what topic?".
const NON_TOPIC_ANSWER_PATTERN = /[?]|^\s*(no|nope|nevermind|never mind|actually|forget it|cancel|instead|can you|could you|explain|what is|what's|summarize|summarise)\b/i;
const MAX_TOPIC_ANSWER_WORDS = 8;

// "questions" is included alongside "quiz" because "give me 10 questions
// about X" is a real quiz request with no literal "quiz" in it. This is a
// cheap gate for "is it worth asking the classifier", not the intent
// decision itself — the classifier still has to conclude REQUEST_QUIZ, so a
// message like "I have some questions about photosynthesis" still correctly
// resolves to an explanation, not a quiz.
function mentionsQuiz(message) {
  return /\bquiz(zes)?\b|\bquestions?\b/i.test(message);
}

function mentionsFlashcards(message) {
  return /flash\s*cards?/i.test(message);
}

function clampCount(value, fallback = DEFAULT_ITEMS) {
  if (!value && value !== 0) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_ITEMS);
}

function normalizeQuizType(value) {
  return QUIZ_TYPES.has(value) ? value : null;
}

function normalizeDifficulty(value) {
  return DIFFICULTIES.has(value) ? value : null;
}

// Explicit-in-THIS-message extraction only — never invents a value. Used both
// as a cheap first pass and to double-check the classifier's own extraction.
function extractExplicitQuizType(message) {
  for (const [pattern, type] of QUIZ_TYPE_PATTERNS) {
    if (pattern.test(message)) return type;
  }
  return null;
}

function extractExplicitItemCount(message) {
  const match = message.match(/(\d+)[\s-]*(item|question|point|flash\s*cards?|cards?)/i);
  return match ? clampCount(match[1], null) : null;
}

// True when `message`, sent right after AILA asked "what topic?", reads like
// a bare topic ("Operating Systems", "subnetting") rather than a new,
// unrelated request the student typed instead of answering.
function looksLikeTopicAnswer(message) {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (NON_TOPIC_ANSWER_PATTERN.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= MAX_TOPIC_ANSWER_WORDS;
}

function cleanTopic(message) {
  return message.trim().replace(/[.?!]+$/, '').trim();
}

// Exact-template fast path for the chat's own "Generate Quiz" / "Generate
// Flashcards" buttons (see ChatInput.jsx's useTemplate() calls) — a message
// that IS the button's template with a topic typed in is unambiguous, so it
// skips the Gemini classifier entirely rather than depending on it to
// recognize its own UI's wording. Anchored (^...$) to the WHOLE message, so
// something that merely mentions the template's words — "what is a quiz",
// "generate a quiz" with no count/topic — can never match.
const QUIZ_TEMPLATE_PATTERN = /^generate a (\d+)-item multiple choice quiz about\s+(.+)$/i;
const FLASHCARDS_TEMPLATE_PATTERN = /^generate (\d+) flashcards about\s+(.+)$/i;

function matchButtonTemplate(message) {
  const trimmed = message.trim();

  const quiz = trimmed.match(QUIZ_TEMPLATE_PATTERN);
  if (quiz) {
    const count = Number(quiz[1]);
    const topic = cleanTopic(quiz[2]);
    if (topic && Number.isInteger(count) && count >= 1 && count <= MAX_ITEMS) {
      return { type: 'quiz', topic, itemCount: count };
    }
  }

  const flashcards = trimmed.match(FLASHCARDS_TEMPLATE_PATTERN);
  if (flashcards) {
    const count = Number(flashcards[1]);
    const topic = cleanTopic(flashcards[2]);
    if (topic && Number.isInteger(count) && count >= 1 && count <= MAX_ITEMS) {
      return { type: 'flashcards', topic, itemCount: count };
    }
  }

  return null;
}

module.exports = {
  MAX_ITEMS,
  DEFAULT_ITEMS,
  mentionsQuiz,
  mentionsFlashcards,
  clampCount,
  normalizeQuizType,
  normalizeDifficulty,
  extractExplicitQuizType,
  extractExplicitItemCount,
  looksLikeTopicAnswer,
  cleanTopic,
  matchButtonTemplate,
};
