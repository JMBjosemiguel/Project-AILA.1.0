// ~120,000 characters (~30,000 tokens at ~4 chars/token) — generous relative
// to the old 8,000-15,000 char caps (a 10-15x increase) while staying a small
// fraction of a Flash-tier Gemini model's context window, so the added
// latency/cost per request stays modest (see resourceTextExtraction.js for
// how a document bigger than this gets chunked rather than hard-truncated).
const MAX_CHARS_FOR_AI = 120000;

function truncateForAi(text, maxChars = MAX_CHARS_FOR_AI) {
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

module.exports = {
  MAX_CHARS_FOR_AI,
  truncateForAi,
};
