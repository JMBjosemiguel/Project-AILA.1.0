const ApiError = require('../utils/ApiError');
const aiService = require('./aiService');
const { callGemini, getResponseText } = require('./geminiClient');

const TEXT_TOOLS = {
  study_guide: 'a comprehensive study guide',
  reviewer: 'a concise exam reviewer',
  summary: 'a short summary',
  key_concepts: 'a list of key concepts with brief explanations',
  learning_objectives: 'a list of 3-6 clear learning objectives',
  coding_exercise: 'a set of coding exercises with sample solutions',
};

const DIFFICULTY_LABELS = {
  easy: 'beginner-friendly',
  medium: 'intermediate-level',
  hard: 'advanced, challenging',
};

function buildPrompt(tool, topic, difficulty) {
  const toolLabel = TEXT_TOOLS[tool];
  if (!toolLabel) {
    throw new ApiError(400, `Unknown study tool "${tool}".`);
  }

  const difficultyLabel = DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.medium;

  return `Generate ${toolLabel} about "${topic}" for a college student. Make it ${difficultyLabel}. Format the response in clear Markdown.`;
}

async function generateTextTool({ userId, tool, topic, difficulty = 'medium' }) {
  const prompt = buildPrompt(tool, topic, difficulty);

  return aiService.generateChatResponse({
    userId,
    message: prompt,
    conversationId: null,
  });
}

async function generateObjectivesPreview(topic, difficulty = 'medium') {
  const prompt = `${buildPrompt('learning_objectives', topic, difficulty)} Return only a Markdown bullet list, nothing else.`;

  const payload = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
  });

  return getResponseText(payload);
}

module.exports = {
  TEXT_TOOLS,
  generateTextTool,
  generateObjectivesPreview,
};
