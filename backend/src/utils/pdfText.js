const pdfParse = require('pdf-parse');

const MAX_CHARS_FOR_AI = 15000;

async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  return (data.text || '').trim();
}

function truncateForAi(text, maxChars = MAX_CHARS_FOR_AI) {
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

module.exports = {
  extractPdfText,
  truncateForAi,
};
