'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_ITEMS,
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
} = require('../../src/utils/chatIntent');

test('chatIntent (deterministic helpers)', async (t) => {
  await t.test('mentionsQuiz matches "quiz" and "questions" (the pre-filter gate, not the decision)', () => {
    for (const msg of ['quiz', 'Quiz me', 'a QUIZZES thing', 'give me 10 questions about X', 'Question?']) {
      assert.equal(mentionsQuiz(msg), true, msg);
    }
    for (const msg of ['what is REST?', 'explain encapsulation', '']) {
      assert.equal(mentionsQuiz(msg), false, msg);
    }
  });

  await t.test('mentionsFlashcards matches with/without a space', () => {
    assert.equal(mentionsFlashcards('make flashcards'), true);
    assert.equal(mentionsFlashcards('flash cards please'), true);
    assert.equal(mentionsFlashcards('quiz me'), false);
  });

  await t.test('clampCount enforces the safe maximum and falls back on junk', () => {
    assert.equal(clampCount(5), 5);
    assert.equal(clampCount(999), MAX_ITEMS);
    assert.equal(clampCount(0), 10);
    assert.equal(clampCount(-5), 10);
    assert.equal(clampCount('not a number'), 10);
    assert.equal(clampCount(null, 3), 3);
    assert.equal(clampCount(3.9), 3);
  });

  await t.test('normalizeQuizType only accepts the known set, else null', () => {
    assert.equal(normalizeQuizType('multiple_choice'), 'multiple_choice');
    assert.equal(normalizeQuizType('true_false'), 'true_false');
    assert.equal(normalizeQuizType('identification'), 'identification');
    assert.equal(normalizeQuizType('essay'), null);
    assert.equal(normalizeQuizType(''), null);
    assert.equal(normalizeQuizType(undefined), null);
  });

  await t.test('normalizeDifficulty only accepts easy/medium/hard, else null', () => {
    assert.equal(normalizeDifficulty('hard'), 'hard');
    assert.equal(normalizeDifficulty('impossible'), null);
  });

  await t.test('extractExplicitQuizType reads the type only when actually stated', () => {
    assert.equal(extractExplicitQuizType('a true or false quiz'), 'true_false');
    assert.equal(extractExplicitQuizType('an identification quiz'), 'identification');
    assert.equal(extractExplicitQuizType('a multiple-choice quiz'), 'multiple_choice');
    assert.equal(extractExplicitQuizType('quiz me about SOLID'), null);
  });

  await t.test('extractExplicitItemCount reads a count only when actually stated', () => {
    assert.equal(extractExplicitItemCount('give me 10 questions about REST APIs'), 10);
    assert.equal(extractExplicitItemCount('5 item quiz'), 5);
    assert.equal(extractExplicitItemCount('quiz me about SOLID'), null);
  });

  await t.test('looksLikeTopicAnswer accepts short bare phrases, rejects full sentences/escapes', () => {
    for (const msg of ['Operating Systems', 'subnetting', 'System integration.', 'REST APIs']) {
      assert.equal(looksLikeTopicAnswer(msg), true, msg);
    }
    for (const msg of [
      'What topic do you mean?',
      'Can you explain that instead?',
      'Actually, never mind.',
      'This is a much longer sentence than a bare topic phrase would ever be',
      '',
      '   ',
    ]) {
      assert.equal(looksLikeTopicAnswer(msg), false, msg);
    }
  });

  await t.test('cleanTopic trims and strips trailing punctuation', () => {
    assert.equal(cleanTopic('  Operating Systems.  '), 'Operating Systems');
    assert.equal(cleanTopic('subnetting!'), 'subnetting');
  });

  await t.test('matchButtonTemplate recognizes the chat UI\'s own quiz/flashcards templates', () => {
    assert.deepEqual(
      matchButtonTemplate('Generate a 10-item multiple choice quiz about Scientists'),
      { type: 'quiz', topic: 'Scientists', itemCount: 10 }
    );
    assert.deepEqual(
      matchButtonTemplate('Generate 10 flashcards about Scientists'),
      { type: 'flashcards', topic: 'Scientists', itemCount: 10 }
    );
    // Case-insensitive, and a trailing period on the typed topic is stripped
    // the same way cleanTopic() does for everything else.
    assert.deepEqual(
      matchButtonTemplate('generate a 5-item multiple choice quiz about subnetting.'),
      { type: 'quiz', topic: 'subnetting', itemCount: 5 }
    );
  });

  await t.test('matchButtonTemplate rejects a count above MAX_ITEMS', () => {
    assert.equal(matchButtonTemplate(`Generate a ${MAX_ITEMS + 10}-item multiple choice quiz about Scientists`), null);
    assert.equal(matchButtonTemplate(`Generate ${MAX_ITEMS + 10} flashcards about Scientists`), null);
  });

  await t.test('matchButtonTemplate rejects a missing topic', () => {
    assert.equal(matchButtonTemplate('Generate a 10-item multiple choice quiz about'), null);
    assert.equal(matchButtonTemplate('Generate a 10-item multiple choice quiz about    '), null);
    assert.equal(matchButtonTemplate('Generate 10 flashcards about'), null);
  });

  await t.test('matchButtonTemplate is anchored to the WHOLE message — text before the command, or breaking its exact wording, never matches', () => {
    // Text before the recognized command.
    assert.equal(matchButtonTemplate('Please Generate a 10-item multiple choice quiz about Scientists'), null);
    // Everything after "about" is, by design, the topic (a real topic can
    // contain any words) — but the command part itself must match exactly:
    // inserting a word into it breaks the match rather than loosely resembling it.
    assert.equal(matchButtonTemplate('Generate a 10-item easy multiple choice quiz about Scientists'), null);
    assert.equal(matchButtonTemplate('Please generate 10 flashcards about Scientists'), null);
  });

  await t.test('matchButtonTemplate never matches a message merely ABOUT a quiz', () => {
    for (const msg of ['what is a quiz', 'generate a quiz', 'I need a 10 item quiz', 'can you make flashcards about Scientists']) {
      assert.equal(matchButtonTemplate(msg), null, msg);
    }
  });

  await t.test('isVagueReference flags bare pronouns and document back-references, never a real topic', () => {
    for (const topic of ['this', 'that', 'it', 'these', 'those', 'the above', 'This', 'THAT', '  it  ', 'this document', 'that file', 'the pdf', 'the slides', 'these modules', 'the material', 'the resource', 'the attachment', '', '   ', null, undefined]) {
      assert.equal(isVagueReference(topic), true, JSON.stringify(topic));
    }
    for (const topic of ['subnetting', 'REST APIs', "the 'this' keyword in JavaScript", 'photosynthesis', 'TCP and UDP', 'the above-ground biomass of a forest', 'document management systems']) {
      assert.equal(isVagueReference(topic), false, topic);
    }
  });

  // This is the exact case from the reported bug: the chat UI's own
  // "Generate a quiz about <topic>" button template filled in with a bare
  // pronoun must NOT be accepted as the topic — it has to fall through to
  // the classifier instead (see chatIntentService), which can actually try
  // to resolve it from conversation context or a linked resource.
  await t.test('matchButtonTemplate does not match when the typed-in topic is a vague reference — falls through instead of accepting it verbatim', () => {
    for (const msg of [
      'Generate a 10-item multiple choice quiz about this',
      'Generate a 10-item multiple choice quiz about that',
      'Generate a 10-item multiple choice quiz about this document',
      'Generate 10 flashcards about it',
      'Generate 10 flashcards about the attached file',
    ]) {
      assert.equal(matchButtonTemplate(msg), null, msg);
    }
  });

  await t.test('isQuizFollowupPhrase matches short "do that again" phrasings, never a real sentence', () => {
    for (const msg of ['another one', 'Another one!', 'one more', 'again', 'another quiz', 'another quiz.', 'more questions', 'more flashcards', 'do it again', 'do that again', 'another one please']) {
      assert.equal(isQuizFollowupPhrase(msg), true, msg);
    }
    for (const msg of ['', 'another one about photosynthesis', 'I have a quiz again tomorrow', 'quiz me about this again', 'what is a quiz']) {
      assert.equal(isQuizFollowupPhrase(msg), false, msg);
    }
  });
});
