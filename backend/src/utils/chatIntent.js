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

// A bare pronoun or back-reference ("this", "that", "the document") is never
// a real topic on its own — it refers to something else the caller has to
// resolve (the conversation's linked resource, or the subject of AILA's last
// explanation). Anchored to the WHOLE (already-cleaned) string so a genuine
// topic that merely contains one of these words — "the above-ground biomass
// of a forest" — is never falsely flagged.
const VAGUE_REFERENCE_PATTERN = /^(it|this|that|these|those|the above|(this|that|these|those|the)\s+(attached|uploaded|linked)?\s*(document|file|pdf|slides?|module|material|resource|attachment)s?)$/i;

function isVagueReference(topic) {
  if (!topic || !topic.trim()) return true;
  return VAGUE_REFERENCE_PATTERN.test(topic.trim());
}

// A short "do that again" right after AILA generated a quiz/flashcards never
// says "quiz" or "flashcards" itself, so it would otherwise never reach the
// classifier at all (see mentionsQuiz below) and fall straight to normal
// chat. Anchored to the WHOLE message — a real sentence that happens to
// contain "again" elsewhere never matches.
const QUIZ_FOLLOWUP_PATTERN = /^(another one|one more|again|another (quiz|one|set|round)|more (questions|items|flashcards|cards)|do (it|that) again)\s*(please)?[.!]?$/i;

function isQuizFollowupPhrase(message) {
  return QUIZ_FOLLOWUP_PATTERN.test(String(message || '').trim());
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

  // A vague topic here ("...quiz about this") is NOT treated as unmatched —
  // it falls through to the mentionsQuiz/classifier path below instead,
  // because resolving it (from the linked resource or recent conversation)
  // is exactly what that path already does; duplicating that resolution
  // here would be a second pipeline.
  const quiz = trimmed.match(QUIZ_TEMPLATE_PATTERN);
  if (quiz) {
    const count = Number(quiz[1]);
    const topic = cleanTopic(quiz[2]);
    if (topic && !isVagueReference(topic) && Number.isInteger(count) && count >= 1 && count <= MAX_ITEMS) {
      return { type: 'quiz', topic, itemCount: count };
    }
  }

  const flashcards = trimmed.match(FLASHCARDS_TEMPLATE_PATTERN);
  if (flashcards) {
    const count = Number(flashcards[1]);
    const topic = cleanTopic(flashcards[2]);
    if (topic && !isVagueReference(topic) && Number.isInteger(count) && count >= 1 && count <= MAX_ITEMS) {
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
  isVagueReference,
  isQuizFollowupPhrase,
};
