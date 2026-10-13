'use strict';

// A quiz saved from the AI chat ("Save as Quiz") is practice for the chat
// only. quizService.saveQuizFromChatMessage always sets BOTH source_type =
// 'chat' AND source_chat_message_id together (confirmed by reading that
// function — nothing else in the codebase creates a 'chat'-sourced quiz),
// so checking source_type alone is sufficient and simplest. It must never
// count toward the student's learning analytics: Dashboard quiz-average /
// recent-quizzes / Resume Test / AI insight, the Analytics quiz-performance
// trend, or personalization's getRecentQuizAverage. `quizAlias` is the
// quizzes table's alias in the caller's query. source_type is nullable
// (formal assessments, and any quiz with no "source"), so this is written
// to stay true for NULL, not just for every non-'chat' value.
function notChatQuizCondition(quizAlias) {
  return `(${quizAlias}.source_type IS NULL OR ${quizAlias}.source_type != 'chat')`;
}

module.exports = { notChatQuizCondition };
