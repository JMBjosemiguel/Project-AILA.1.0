const QUIZ_TYPE_PATTERNS = [
  [/true\s*(or|\/)?\s*false/i, 'true_false'],
  [/identification/i, 'identification'],
  [/multiple[\s-]*choice/i, 'multiple_choice'],
];

const MAX_ITEMS = 30;
const DEFAULT_ITEMS = 10;

function clampCount(value, fallback) {
  if (!value) return fallback;
  return Math.min(Math.max(Number(value), 1), MAX_ITEMS);
}

function extractTopic(message, triggerPattern) {
  const aboutMatch = message.match(/(?:about|on|regarding|for)\s+(.+)$/i);
  if (aboutMatch) {
    return aboutMatch[1].replace(/[.?!]+$/, '').trim();
  }

  const stripped = message.replace(triggerPattern, '').trim().replace(/[.?!]+$/, '').trim();
  return stripped || 'the topic we were just discussing';
}

function detectChatIntent(message) {
  if (/flash\s*cards?/i.test(message)) {
    const countMatch = message.match(/(\d+)[\s-]*(flash\s*cards?|cards?)/i);

    return {
      type: 'flashcards',
      count: clampCount(countMatch?.[1], DEFAULT_ITEMS),
      topic: extractTopic(message, /flash\s*cards?/i),
    };
  }

  if (/\bquiz\b/i.test(message)) {
    let quizType = 'multiple_choice';
    for (const [pattern, type] of QUIZ_TYPE_PATTERNS) {
      if (pattern.test(message)) {
        quizType = type;
        break;
      }
    }

    const countMatch = message.match(/(\d+)[\s-]*(item|question|point)/i);

    return {
      type: 'quiz',
      quizType,
      itemCount: clampCount(countMatch?.[1], DEFAULT_ITEMS),
      topic: extractTopic(message, /\bquiz\b/i),
    };
  }

  return null;
}

module.exports = {
  detectChatIntent,
};
