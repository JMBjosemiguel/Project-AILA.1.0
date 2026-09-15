const ApiError = require('../utils/ApiError');
const { transaction } = require('../config/database');
const chatModel = require('../models/chatModel');
const resourceModel = require('../models/resourceModel');
const quizService = require('./quizService');
const personalizationService = require('./personalizationService');
const chatIntentService = require('./chatIntentService');
const { callGemini, getResponseText } = require('./geminiClient');
const { DEFAULT_ITEMS } = require('../utils/chatIntent');
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
  'You are an educational AI assistant — an academic tutor — for ALL college students.',
  '',
  'How to respond:',
  '',
  '- Understand the actual question, including references back to earlier messages in this',
  '  conversation ("it", "that", "this topic"). If a reference is genuinely unclear — for',
  '  example several unrelated topics were just discussed — say so and ask which one is',
  '  meant, rather than guessing.',
  '- Explain concepts clearly, adapting depth and language to what the student seems to need:',
  '  a short factual question gets a direct, concise answer; a request to understand a',
  '  concept gets a fuller explanation with at least one concrete example, broken into',
  '  sections when the material is genuinely complex. Do not pad simple answers with',
  '  unnecessary detail, and do not compress a genuinely complex topic into one line.',
  '- If the student asks for more detail or a simpler explanation of something already',
  '  discussed, use that prior context — do not restart from scratch or repeat what you',
  '  already said.',
  '- Always format your responses in Markdown: headings, bold/italic, lists, tables, and',
  '  fenced code blocks whenever they make an explanation clearer.',
  '- If you are not sure about something, say so plainly instead of inventing an answer.',
  '- Distinguish what the student is actually asking for — an explanation, a review or',
  '  summary, learning material, a generated quiz, or a follow-up on something already',
  '  said — and answer that, not a generic response.',
  '- Do not turn every learning question into a quiz, and do not repeatedly suggest quizzes,',
  '  flashcards, or other AILA features when the student has not asked for them — you may',
  '  mention a quiz/flashcards as an optional next step after a substantive explanation, but',
  '  only occasionally, and never for short factual answers or small talk.',
  '- Never encourage cheating. Never generate harmful content.',
  '',
  'Respond in a friendly, professional, academic tone — helpful tutor, not an automatic',
  'feature-trigger bot.',
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
        maxOutputTokens: 20,
        reasoningLevel: 'low',
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
      topP: 0.95,
      maxOutputTokens: 1024,
      reasoningLevel: 'low',
    },
  });

  return getResponseText(payload);
}

// Personalization for an in-chat quiz request — the same structured context
// the formal quiz-generation path already uses (personalizationService),
// rather than the plain-English summary buildSystemInstruction injects for
// ordinary chat. Best-effort: a context failure must never block a quiz the
// student explicitly asked for.
async function buildChatQuizPersonalization(userId) {
  let context = null;
  try {
    context = await personalizationService.buildPersonalizationContext(userId, { generationType: 'quiz' });
  } catch {
    context = null;
  }

  return {
    text: personalizationService.formatPersonalizationPrompt(context),
    preferredDifficulty: context?.preferences?.preferredDifficulty || null,
  };
}

/**
 * Decide what the student wants and produce the reply. Returns
 * `nextPendingIntent` alongside the reply so the caller can persist (or
 * clear) chat_conversations.pending_intent — the clarification state that
 * lets the student's NEXT message be understood as answering "what topic?"
 * instead of being misread as a fresh, unrelated request.
 */
async function generateReply(prompt, priorMessages, userId, resourceId, pendingIntent) {
  const decision = await chatIntentService.classifyIntent({ prompt, priorMessages, pendingIntent });

  if (decision.needsClarification) {
    return {
      messageType: 'text',
      data: null,
      responseText: decision.clarificationQuestion,
      nextPendingIntent: decision.nextPendingIntent,
    };
  }

  if (decision.type === 'quiz') {
    const personalization = await buildChatQuizPersonalization(userId);
    const quiz = await quizService.generateQuiz({
      topic: decision.topic,
      quizType: decision.quizType || 'multiple_choice',
      itemCount: decision.itemCount || DEFAULT_ITEMS,
      difficulty: decision.difficulty || personalization.preferredDifficulty || undefined,
      personalizationText: personalization.text,
    });
    return { messageType: 'quiz', data: quiz, responseText: JSON.stringify(quiz), nextPendingIntent: null };
  }

  if (decision.type === 'flashcards') {
    const flashcards = await quizService.generateFlashcards({
      topic: decision.topic,
      count: decision.itemCount || DEFAULT_ITEMS,
    });
    return { messageType: 'flashcards', data: flashcards, responseText: JSON.stringify(flashcards), nextPendingIntent: null };
  }

  const responseText = await callGeminiChat(prompt, priorMessages, userId, resourceId);
  return { messageType: 'text', data: null, responseText, nextPendingIntent: null };
}

async function persistExchange({ userId, conversationId, isFirstMessage, prompt, responseText, messageType, resourceId, nextPendingIntent }) {
  const title = isFirstMessage ? await generateConversationTitle(prompt) : null;

  return transaction(async (connection) => {
    const resolvedId = conversationId || (await chatModel.createConversation(userId, connection, resourceId));

    const { botMessageId } = await chatModel.appendMessages(resolvedId, prompt, responseText, messageType, connection);
    await chatModel.setPendingIntent(resolvedId, nextPendingIntent, connection);

    if (isFirstMessage) {
      await chatModel.setConversationTitleIfMissing(resolvedId, title, connection);
    }

    return { conversationId: resolvedId, botMessageId };
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
  let pendingIntent = null;

  if (conversationId) {
    const conversation = await chatModel.getConversationForUser(Number(conversationId), userId);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found.');
    }
    existingConversationId = conversation.id;
    effectiveResourceId = conversation.resource_id;
    pendingIntent = conversation.pending_intent;
    priorMessages = await chatModel.getMessagesForConversation(existingConversationId);
  }

  const { messageType, data, responseText, nextPendingIntent } = await generateReply(
    prompt, priorMessages, userId, effectiveResourceId, pendingIntent
  );

  const { conversationId: resolvedConversationId, botMessageId } = await persistExchange({
    userId,
    conversationId: existingConversationId,
    isFirstMessage: priorMessages.length === 0,
    prompt,
    responseText,
    messageType,
    resourceId: effectiveResourceId,
    nextPendingIntent,
  });

  return {
    conversationId: resolvedConversationId,
    messageId: botMessageId,
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

  // Regenerate always classifies fresh, without carrying forward whatever
  // clarification state existed before this exchange (that state reflects
  // the OUTCOME of the reply being regenerated, not the turn before it) — see
  // the "known limitations" note in the update 33 report.
  const { messageType, data, responseText, nextPendingIntent } = await generateReply(
    prompt, priorMessages, userId, conversation.resource_id, null
  );

  await chatModel.updateMessage(lastMessage.id, responseText, messageType);
  await chatModel.setPendingIntent(conversation.id, nextPendingIntent);

  return {
    conversationId: conversation.id,
    messageId: lastMessage.id,
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
