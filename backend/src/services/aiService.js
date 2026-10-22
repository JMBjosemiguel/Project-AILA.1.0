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
const { MAX_CHARS_FOR_AI } = require('../utils/pdfText');
const { getResourceChunks, selectRelevantChunks, NO_READABLE_TEXT_MESSAGE } = require('./resourceTextExtraction');

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
  '- Do not turn every learning question into a quiz, and never write out a quiz, a practice',
  '  test, or a set of practice questions or flashcards inside a normal reply — a single',
  '  example question within an explanation is fine, a full set is not. When practice would',
  '  genuinely help, say so in one short sentence and point the student to the Generate Quiz',
  '  or Flashcards button below the chat, or mention they can just ask (e.g. "make me a quiz',
  '  on <topic>") — never generate the content yourself. Keep feature suggestions like this',
  '  occasional, and never for short factual answers or small talk.',
  '- You CAN make quizzes and flashcards — never say you can\'t, don\'t support that, or can',
  '  only do it "directly in chat" as if that were a limitation. Never describe or point to UI',
  '  that does not exist (e.g. "select the quiz tool from your dashboard") — the only real ways',
  '  are the Generate Quiz / Flashcards button below the chat, or just asking in words.',
  '- Never encourage cheating. Never generate harmful content.',
  '- Earlier turns that generated a quiz or flashcards appear in this history as a bracketed',
  '  note like [Generated a 10-item quiz about "X"] — that note is context for YOU only,',
  '  describing what happened. Never quote, copy, or paraphrase that bracketed note back to',
  '  the student; if they ask what you just made, describe it in your own words instead.',
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
    // The ACTUAL item count, never guessed — this is the exact string
    // Gemini has been seen paraphrasing back into a normal chat reply with a
    // wrong count attached, hence also the reply sanitizing in
    // callGeminiChat below. Getting this right narrows that failure to "the
    // placeholder leaked" rather than "and the count was wrong too".
    if (row.message_type === 'quiz') {
      const count = Array.isArray(parsed.items) ? parsed.items.length : null;
      return count
        ? `[Generated a ${count}-item ${parsed.quizType} quiz about "${parsed.topic}"]`
        : `[Generated a ${parsed.quizType} quiz about "${parsed.topic}"]`;
    }
    if (row.message_type === 'flashcards') {
      const count = Array.isArray(parsed.cards) ? parsed.cards.length : null;
      return count
        ? `[Generated ${count} flashcards about "${parsed.topic}"]`
        : `[Generated flashcards about "${parsed.topic}"]`;
    }
  } catch {
    // fall through to generic summary below
  }

  return '[Generated interactive content]';
}

// Backstop for callGeminiChat: normal chat must never actually print one of
// the bracketed `[Generated ...]` history placeholders above — Gemini has
// been seen paraphrasing one back verbatim (sometimes with a wrong count) as
// though it were answering "what did you just make me". The system prompt
// below already tells it not to; this strips one out if it slips through
// anyway, rather than relying on the instruction alone.
const HISTORY_PLACEHOLDER_PATTERN = /\[Generated[^\]]*\]/g;

function stripHistoryPlaceholders(text) {
  return typeof text === 'string' ? text.replace(HISTORY_PLACEHOLDER_PATTERN, '').trim() : text;
}

// Returns the resource-grounding text for the system instruction, plus a
// `resourceNote` the caller uses to shape the actual chat response:
//   - null: no resource attached, or grounding is unavailable (best-effort).
//   - 'no-text': the resource has literally no extractable text — the caller
//     should tell the student plainly instead of answering ungrounded.
//   - 'truncated': the document didn't fit whole — the caller appends a
//     one-line notice so the student knows only part of it was used.
async function buildResourceGrounding(resourceId, userId, questionText) {
  if (!resourceId) return { text: '', resourceNote: null };

  try {
    const resource = await resourceModel.getResourceById(resourceId, userId);
    if (!resource) return { text: '', resourceNote: null };

    const chunks = await getResourceChunks(resource);
    if (!chunks.length) return { text: '', resourceNote: 'no-text' };

    const { text, truncated } = selectRelevantChunks(chunks, questionText, MAX_CHARS_FOR_AI);
    return {
      text: `\n\nThe student is asking about a specific document they uploaded. Answer using ONLY the following document content — if the answer isn't in the document, say so instead of guessing:\n\n${text}`,
      resourceNote: truncated ? 'truncated' : null,
    };
  } catch {
    // Grounding is best-effort — chat still works without it.
    return { text: '', resourceNote: null };
  }
}

async function buildSystemInstruction(userId, resourceGroundingText) {
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

  return instruction + resourceGroundingText;
}

const RESOURCE_TRUNCATED_NOTE = 'This file is long, so AILA used the most relevant parts.';

async function callGeminiChat(prompt, priorMessages, userId, resourceId) {
  const { text: resourceGroundingText, resourceNote } = await buildResourceGrounding(resourceId, userId, prompt);

  if (resourceNote === 'no-text') {
    return NO_READABLE_TEXT_MESSAGE;
  }

  const contents = [
    ...priorMessages.slice(-MAX_HISTORY_MESSAGES).map((row) => ({
      role: row.sender === 'user' ? 'user' : 'model',
      parts: [{ text: summarizeHistoryMessage(row) }],
    })),
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const systemInstruction = await buildSystemInstruction(userId, resourceGroundingText);

  const payload = await callGemini({
    systemInstruction,
    contents,
    generationConfig: {
      topP: 0.95,
      maxOutputTokens: 1024,
      reasoningLevel: 'low',
    },
  });

  const responseText = stripHistoryPlaceholders(getResponseText(payload));
  return resourceNote === 'truncated' ? `${responseText}\n\n*${RESOURCE_TRUNCATED_NOTE}*` : responseText;
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

// classifyIntent couldn't resolve a real topic — it was either a bare
// pronoun/back-reference ("this", "the document") or genuinely nothing
// stated (clarificationReason: 'no_topic', never 'ambiguous_topic' — several
// distinct topics discussed still has to be asked about regardless of a
// linked resource). When the conversation has a linked resource, that IS
// the topic: generate from it using the exact same resource-grounding
// quizService.generateAndSaveQuiz uses for the Resource Library's "Generate
// Quiz from a file" (buildResourceQuizContext — chunks spread across the
// whole document, via the update-123 whole-file extraction), never a second
// pipeline. Returns null (meaning: ask the clarification question as usual)
// when there's no resource to fall back to.
async function generateFromLinkedResource(type, userId, resourceId, decision) {
  const resource = await resourceModel.getResourceById(resourceId, userId);
  if (!resource) return null;

  const { text: sourceContextText, resourceNote } = await quizService.buildResourceQuizContext(resourceId, userId);
  if (resourceNote === 'no-text') {
    return { messageType: 'text', data: null, responseText: NO_READABLE_TEXT_MESSAGE, nextPendingIntent: null };
  }

  if (type === 'quiz') {
    const personalization = await buildChatQuizPersonalization(userId);
    const quiz = await quizService.generateQuiz({
      topic: resource.title,
      quizType: decision.quizType || 'multiple_choice',
      itemCount: decision.itemCount || DEFAULT_ITEMS,
      difficulty: decision.difficulty || personalization.preferredDifficulty || undefined,
      personalizationText: personalization.text,
      sourceContextText,
      isDocumentSource: true,
    });
    if (resourceNote === 'truncated') quiz.sourceNote = RESOURCE_TRUNCATED_NOTE;
    // Recorded on the stored message so a later "another one" follow-up (see
    // chatIntentService.findLastGeneratedItem) knows to regenerate from this
    // SAME document again, not from "resource.title" as a bare topic string.
    quiz.sourceResourceId = resourceId;
    return { messageType: 'quiz', data: quiz, responseText: JSON.stringify(quiz), nextPendingIntent: null };
  }

  const flashcards = await quizService.generateFlashcards({
    topic: resource.title,
    count: decision.itemCount || DEFAULT_ITEMS,
    sourceContextText,
  });
  if (resourceNote === 'truncated') flashcards.sourceNote = RESOURCE_TRUNCATED_NOTE;
  flashcards.sourceResourceId = resourceId;
  return { messageType: 'flashcards', data: flashcards, responseText: JSON.stringify(flashcards), nextPendingIntent: null };
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
    if (decision.clarificationReason === 'no_topic' && resourceId && (decision.type === 'quiz' || decision.type === 'flashcards')) {
      const fromResource = await generateFromLinkedResource(decision.type, userId, resourceId, decision);
      if (fromResource) return fromResource;
      // Resource lookup failed unexpectedly — fall through to the normal
      // clarification question rather than losing the reply entirely.
    }
    return {
      messageType: 'text',
      data: null,
      responseText: decision.clarificationQuestion,
      nextPendingIntent: decision.nextPendingIntent,
    };
  }

  if (decision.type === 'quiz' || decision.type === 'flashcards') {
    // A "another one" follow-up on a previously document-grounded quiz/
    // flashcards carries the resource it came from (see
    // generateFromLinkedResource above) — regenerate from that SAME
    // document again rather than from its title as a bare topic string.
    if (decision.sourceResourceId) {
      const fromResource = await generateFromLinkedResource(decision.type, userId, decision.sourceResourceId, decision);
      if (fromResource) return fromResource;
      // That resource is gone/inaccessible now — fall through to a plain
      // quiz/flashcards on the remembered topic below rather than failing.
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

    const flashcards = await quizService.generateFlashcards({
      topic: decision.topic,
      count: decision.itemCount || DEFAULT_ITEMS,
    });
    return { messageType: 'flashcards', data: flashcards, responseText: JSON.stringify(flashcards), nextPendingIntent: null };
  }

  const responseText = await callGeminiChat(prompt, priorMessages, userId, resourceId);
  return { messageType: 'text', data: null, responseText, nextPendingIntent: null };
}

async function persistExchange({
  userId, conversationId, isFirstMessage, prompt, responseText, messageType, resourceId, updateConversationResource, nextPendingIntent,
}) {
  const title = isFirstMessage ? await generateConversationTitle(prompt) : null;

  return transaction(async (connection) => {
    const resolvedId = conversationId || (await chatModel.createConversation(userId, connection, resourceId));

    if (updateConversationResource) {
      await chatModel.setConversationResource(resolvedId, resourceId, connection);
    }

    const { botMessageId } = await chatModel.appendMessages(resolvedId, prompt, responseText, messageType, connection);
    await chatModel.setPendingIntent(resolvedId, nextPendingIntent, connection);

    if (isFirstMessage) {
      await chatModel.setConversationTitleIfMissing(resolvedId, title, connection);
    }

    return { conversationId: resolvedId, botMessageId };
  });
}

// `resourceId` carries three distinct states, preserved all the way from the
// JSON body through to here (see chatController — no `|| null` coercion):
//   - undefined: not specified, no change to whatever the conversation already has.
//   - null: an EXPLICIT detach — the student just removed the attachment chip.
//   - a number: attach/switch to that resource (checked for access below).
// Collapsing undefined and null together (as an earlier version of this did)
// is exactly the bug this fixes: it made "no change" indistinguishable from
// "detach", so a removed chip could never actually stop grounding.
async function generateChatResponse({ userId, message, conversationId, resourceId }) {
  const prompt = normalizePrompt(message);

  if (!prompt) {
    throw new ApiError(400, 'Please enter a message for AILA.');
  }

  if (typeof resourceId === 'number') {
    const resource = await resourceModel.getResourceById(resourceId, userId);
    if (!resource) {
      throw new ApiError(404, "That resource could not be found or you don't have access to it.");
    }
  }

  let priorMessages = [];
  let existingConversationId = null;
  let effectiveResourceId = conversationId ? null : (resourceId ?? null);
  let updateConversationResource = false;
  let pendingIntent = null;

  if (conversationId) {
    const conversation = await chatModel.getConversationForUser(Number(conversationId), userId);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found.');
    }
    existingConversationId = conversation.id;
    pendingIntent = conversation.pending_intent;
    priorMessages = await chatModel.getMessagesForConversation(existingConversationId);

    if (resourceId === null) {
      effectiveResourceId = null;
      updateConversationResource = conversation.resource_id !== null;
    } else if (typeof resourceId === 'number') {
      effectiveResourceId = resourceId;
      updateConversationResource = resourceId !== conversation.resource_id;
    } else {
      effectiveResourceId = conversation.resource_id;
    }
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
    updateConversationResource,
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
  // the OUTCOME of the reply being regenerated, not the turn before it).
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

  // Re-checked at read time, not just trusted from the stored id — a resource
  // attached earlier may since have been deleted or had its access revoked.
  let resource = null;
  if (conversation.resource_id) {
    const found = await resourceModel.getResourceById(conversation.resource_id, userId);
    if (found) resource = { id: found.id, title: found.title };
  }

  const messages = await chatModel.getMessagesForConversation(conversation.id);

  return {
    // `resource_id` is overridden (not just spread from the raw row) so it
    // can never disagree with `resource` above — if access was revoked since
    // attaching, both report "not attached," not a stale id next to a null.
    conversation: { ...conversation, resource_id: resource?.id ?? null, resource },
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
