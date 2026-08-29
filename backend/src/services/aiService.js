const ApiError = require('../utils/ApiError');
const { transaction } = require('../config/database');
const chatModel = require('../models/chatModel');
const resourceModel = require('../models/resourceModel');
const quizService = require('./quizService');
const { callGemini, getResponseText } = require('./geminiClient');
const { detectChatIntent } = require('../utils/chatIntent');
const { getStudentContext, buildContextSummaryText } = require('./studentContextService');
const { truncateForAi } = require('../utils/pdfText');

const MAX_HISTORY_MESSAGES = 20;
const TITLE_MAX_LENGTH = 60;
const TITLE_COLUMN_LENGTH = 120;

const SYSTEM_PROMPT = [
  'You are AILA.',
  '',
  'Adaptive Intelligent Learning Assistant.',
  '',
  'You are an educational AI assistant for ALL college students.',
  '',
  'Your responsibilities:',
  '',
  '- Explain concepts clearly, adapting to beginners when appropriate.',
  '- Use simple language.',
  '- Always format your responses in Markdown: use headings, bold/italic, lists, tables, and fenced code blocks whenever they make an explanation clearer.',
  '- Always include at least one concrete example when explaining a concept.',
  '- Encourage learning and curiosity.',
  '- When you finish a substantive explanation, invite the student to test their understanding, e.g. "Want a quick quiz or flashcards on this?" — but do not do this for short factual answers or small talk.',
  '- Never encourage cheating.',
  '- Never generate harmful content.',
  '',
  'Respond in a friendly, professional, academic tone.',
].join('\n');

function normalizePrompt(message) {
  return typeof message === 'string' ? message.trim() : '';
}

function buildTitle(prompt) {
  const trimmed = prompt.trim();
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 3)}...` : trimmed;
}

async function generateConversationTitle(prompt) {
  try {
    const payload = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{
            text: [
              'Write a short conversation title (3-6 words) summarizing the topic of this message,',
              'the way a chat app sidebar would label it (e.g. "Binary Tree Explanation", "SQL Lesson", "Networking Quiz", "Karen Horney").',
              'No quotation marks, no trailing punctuation, no preamble — respond with only the title.',
              '',
              `Message: "${prompt}"`,
            ].join(' '),
          }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 20,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const title = getResponseText(payload).replace(/^["']+|["']+$/g, '').replace(/[.!]+$/, '').trim();
    return title ? title.slice(0, TITLE_COLUMN_LENGTH) : buildTitle(prompt);
  } catch {
    return buildTitle(prompt);
  }
}

function summarizeHistoryMessage(row) {
  if (row.message_type === 'text') {
    return row.message_text;
  }

  try {
    const parsed = JSON.parse(row.message_text);
    if (row.message_type === 'quiz') {
      return `[Generated a ${parsed.quizType} quiz about "${parsed.topic}"]`;
    }
    if (row.message_type === 'flashcards') {
      return `[Generated flashcards about "${parsed.topic}"]`;
    }
  } catch {
    // fall through to generic summary below
  }

  return '[Generated interactive content]';
}

async function buildSystemInstruction(userId, resourceId) {
  let instruction = SYSTEM_PROMPT;

  if (userId) {
    try {
      const context = await getStudentContext(userId);
      const summary = buildContextSummaryText(context);
      if (summary) {
        instruction += `\n\nStudent context (from their real progress and quiz data — use it to personalize explanations and proactively suggest what to review, but phrase it as your own observation, e.g. "I noticed..." — never claim the student told you this directly):\n${summary}`;
      }
    } catch {
      // student context is best-effort, chat still works without it
    }
  }

  if (resourceId) {
    try {
      const extractedText = await resourceModel.getExtractedText(resourceId, userId);
      if (extractedText) {
        instruction += `\n\nThe student is asking about a specific document they uploaded. Answer using ONLY the following document content — if the answer isn't in the document, say so instead of guessing:\n\n${truncateForAi(extractedText, 8000)}`;
      }
    } catch {
      // grounding is best-effort, chat still works without it
    }
  }

  return instruction;
}

async function callGeminiChat(prompt, priorMessages, userId, resourceId) {
  const contents = [
    ...priorMessages.slice(-MAX_HISTORY_MESSAGES).map((row) => ({
      role: row.sender === 'user' ? 'user' : 'model',
      parts: [{ text: summarizeHistoryMessage(row) }],
    })),
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const systemInstruction = await buildSystemInstruction(userId, resourceId);

  const payload = await callGemini({
    systemInstruction,
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return getResponseText(payload);
}

async function generateReply(prompt, priorMessages, userId, resourceId) {
  const intent = detectChatIntent(prompt);

  if (intent?.type === 'quiz') {
    const quiz = await quizService.generateQuiz(intent);
    return { messageType: 'quiz', data: quiz, responseText: JSON.stringify(quiz) };
  }

  if (intent?.type === 'flashcards') {
    const flashcards = await quizService.generateFlashcards(intent);
    return { messageType: 'flashcards', data: flashcards, responseText: JSON.stringify(flashcards) };
  }

  const responseText = await callGeminiChat(prompt, priorMessages, userId, resourceId);
  return { messageType: 'text', data: null, responseText };
}

async function persistExchange({ userId, conversationId, isFirstMessage, prompt, responseText, messageType, resourceId }) {
  const title = isFirstMessage ? await generateConversationTitle(prompt) : null;

  return transaction(async (connection) => {
    const resolvedId = conversationId || (await chatModel.createConversation(userId, connection, resourceId));

    await chatModel.appendMessages(resolvedId, prompt, responseText, messageType, connection);

    if (isFirstMessage) {
      await chatModel.setConversationTitleIfMissing(resolvedId, title, connection);
    }

    return resolvedId;
  });
}

async function generateChatResponse({ userId, message, conversationId, resourceId }) {
  const prompt = normalizePrompt(message);

  if (!prompt) {
    throw new ApiError(400, 'Please enter a message for AILA.');
  }

  let priorMessages = [];
  let existingConversationId = null;
  let effectiveResourceId = conversationId ? null : resourceId || null;

  if (conversationId) {
    const conversation = await chatModel.getConversationForUser(Number(conversationId), userId);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found.');
    }
    existingConversationId = conversation.id;
    effectiveResourceId = conversation.resource_id;
    priorMessages = await chatModel.getMessagesForConversation(existingConversationId);
  }

  const { messageType, data, responseText } = await generateReply(prompt, priorMessages, userId, effectiveResourceId);

  const resolvedConversationId = await persistExchange({
    userId,
    conversationId: existingConversationId,
    isFirstMessage: priorMessages.length === 0,
    prompt,
    responseText,
    messageType,
    resourceId: effectiveResourceId,
  });

  return {
    conversationId: resolvedConversationId,
    messageType,
    response: messageType === 'text' ? responseText : null,
    data,
  };
}

async function regenerateLastResponse(userId, conversationId) {
  const conversation = await chatModel.getConversationForUser(Number(conversationId), userId);
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found.');
  }

  const messages = await chatModel.getMessagesForConversation(conversation.id);
  const lastMessage = messages[messages.length - 1];
  const secondLastMessage = messages[messages.length - 2];

  if (!lastMessage || lastMessage.sender !== 'bot' || !secondLastMessage || secondLastMessage.sender !== 'user') {
    throw new ApiError(400, 'There is no response to regenerate yet.');
  }

  const prompt = secondLastMessage.message_text;
  const priorMessages = messages.slice(0, -2);

  const { messageType, data, responseText } = await generateReply(prompt, priorMessages, userId, conversation.resource_id);

  await chatModel.updateMessage(lastMessage.id, responseText, messageType);

  return {
    conversationId: conversation.id,
    messageType,
    response: messageType === 'text' ? responseText : null,
    data,
  };
}

async function listConversations(userId) {
  return chatModel.listConversationsForUser(userId);
}

async function listSuggestedQuestions() {
  return chatModel.listSuggestedQuestions();
}

async function renameConversation(userId, conversationId, title) {
  const affectedRows = await chatModel.renameConversation(Number(conversationId), userId, title);

  if (!affectedRows) {
    throw new ApiError(404, 'Conversation not found.');
  }
}

async function deleteConversation(userId, conversationId) {
  const affectedRows = await chatModel.deleteConversationForUser(Number(conversationId), userId);

  if (!affectedRows) {
    throw new ApiError(404, 'Conversation not found.');
  }
}

async function getConversation(userId, conversationId) {
  const conversation = await chatModel.getConversationForUser(Number(conversationId), userId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found.');
  }

  const messages = await chatModel.getMessagesForConversation(conversation.id);

  return {
    conversation,
    messages: messages.map((row) => ({
      id: row.id,
      sender: row.sender,
      type: row.message_type,
      text: row.message_type === 'text' ? row.message_text : null,
      data: row.message_type === 'text' ? null : JSON.parse(row.message_text),
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  generateChatResponse,
  regenerateLastResponse,
  listConversations,
  listSuggestedQuestions,
  renameConversation,
  deleteConversation,
  getConversation,
};
