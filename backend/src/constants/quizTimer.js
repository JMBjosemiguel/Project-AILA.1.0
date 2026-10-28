'use strict';

// Time limits (minutes) a student can pick before starting a timed quiz.
// The frontend's QUIZ_TIME_LIMIT_OPTIONS (src/constants/ui.js) must match.
const QUIZ_TIME_LIMIT_MINUTES = [5, 10, 15, 20, 30, 45, 60];

const TIMED_SOURCE_TYPES = ['lesson', 'topic', 'resource'];

// The timer and tab-switch recording apply only to quizzes generated in
// Learning Hub courses (lesson/topic quizzes, module checkpoints, course
// finals) and from Resource Library files — never to chat quizzes
// (source_type 'chat') or copies of shared quizzes (source_type NULL,
// practice). `quiz` is any row carrying source_type + assessment_kind.
function isTimerEligible(quiz) {
  if (!quiz || quiz.source_type === 'chat') return false;
  return Boolean(quiz.assessment_kind && quiz.assessment_kind !== 'practice')
    || TIMED_SOURCE_TYPES.includes(quiz.source_type);
}

module.exports = { QUIZ_TIME_LIMIT_MINUTES, isTimerEligible };
