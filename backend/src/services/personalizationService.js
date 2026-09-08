/**
 * Central personalization context builder.
 *
 * One place to gather the student-learning signals that shape AI generation
 * (courses, lessons, formal quizzes), turn them into a concise, safe prompt
 * block, and produce a small snapshot for the audit column added in
 * migration 003.
 *
 * Every signal is the authenticated student's OWN data — each underlying query
 * is scoped to `userId`. Nothing here reads another student's rows, secrets, or
 * raw free-text wholesale.
 */
const userModel = require('../models/userModel');
const studentContext = require('./studentContextService');

const DIFFICULTY_WORD = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  easy: 'Beginner',
  medium: 'Intermediate',
  hard: 'Advanced',
};

const LOW_AVERAGE = 60;
const HIGH_AVERAGE = 80;

function difficultyWord(value) {
  return value ? (DIFFICULTY_WORD[value] || null) : null;
}

/**
 * Wrap student-controlled free-text (course name, goal, bio) so the model
 * treats it as data, never as instructions. Strips any fake delimiter tags the
 * student may have embedded and caps the length.
 */
function delimitStudentText(label, value) {
  if (!value) return '';
  const safe = String(value).replace(/<\/?student_[a-z_]+>/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!safe) return '';
  return `<student_${label}>\n${safe}\n</student_${label}>`;
}

/**
 * Build the structured personalization context for one generation request.
 *
 * options:
 *   subjectId            number  — scope performance signals to this course
 *   requestedDifficulty  string  — the difficulty the student explicitly asked for
 *   generationType       string  — 'course' | 'lesson' | 'quiz'
 *   knownSubject         object  — { id?, name?, goal? } the caller already has
 *                                  (avoids re-querying the subject row)
 */
async function buildPersonalizationContext(userId, options = {}) {
  const {
    subjectId = null,
    requestedDifficulty = null,
    generationType = 'generation',
    knownSubject = null,
  } = options;

  const [user, preferredDifficulty, weakTopics, strongTopics, recentQuiz, streakRisk, subjectProgress] = await Promise.all([
    userModel.findUserById(userId).catch(() => null),
    studentContext.getPreferredDifficulty(userId).catch(() => null),
    studentContext.getWeakTopics(userId, { subjectId }).catch(() => []),
    studentContext.getStrongTopics(userId, { subjectId }).catch(() => []),
    studentContext.getRecentQuizAverage(userId, { subjectId }).catch(() => null),
    studentContext.getStreakRisk(userId).catch(() => ({ atRisk: false, currentStreak: 0 })),
    subjectId ? studentContext.getSubjectProgress(userId, subjectId).catch(() => null) : Promise.resolve(null),
  ]);

  const profile = {
    program: user?.profile?.program ?? null,
    yearLevel: user?.profile?.year_level ?? null,
  };

  const preferences = {
    preferredDifficulty: preferredDifficulty || null,
    requestedDifficulty: requestedDifficulty || null,
  };

  const course = (subjectId || knownSubject)
    ? {
        subjectId: subjectId ?? knownSubject?.id ?? null,
        title: knownSubject?.name ?? null,
        goal: knownSubject?.goal ?? null,
        progressPercent: subjectProgress?.progressPercent ?? null,
      }
    : null;

  const performance = {
    recentQuizAverage: recentQuiz?.average ?? null,
    weakTopics: weakTopics.map((t) => t.topic).filter(Boolean).slice(0, 4),
    strongerTopics: strongTopics.map((t) => t.topic).filter(Boolean).slice(0, 3),
  };

  const engagement = {
    currentStreak: streakRisk.currentStreak || 0,
  };

  const hasPerformanceSignal =
    performance.recentQuizAverage != null ||
    performance.weakTopics.length > 0 ||
    performance.strongerTopics.length > 0;

  return {
    generationType,
    // 'basic' = profile + requested difficulty only. 'performance_aware' = also
    // uses real assessment history. Lets the panel see when adaptation is real.
    personalizationLevel: hasPerformanceSignal ? 'performance_aware' : 'basic',
    profile,
    preferences,
    course,
    performance,
    engagement,
  };
}

/**
 * Concise, authoritative guidance block for Gemini's systemInstruction.
 * Returns '' when there is nothing worth saying (no fake "Weak topics: none").
 */
function formatPersonalizationPrompt(context) {
  if (!context) return '';
  const { profile, preferences, course, performance } = context;
  const lines = [];

  const studentBits = [];
  if (profile.program) studentBits.push(`Program: ${profile.program}`);
  if (profile.yearLevel) studentBits.push(`Year level: ${profile.yearLevel}`);
  const level = difficultyWord(preferences.requestedDifficulty || preferences.preferredDifficulty);
  if (level) studentBits.push(`Level: ${level}`);
  if (studentBits.length) lines.push(studentBits.join(' | '));

  if (course && (course.progressPercent != null)) {
    lines.push(`Course progress so far: ${course.progressPercent}%`);
  }
  if (performance.weakTopics.length) {
    lines.push(`Areas needing reinforcement: ${performance.weakTopics.join(', ')}`);
  }
  if (performance.strongerTopics.length) {
    lines.push(`Already strong (do not over-drill basics here): ${performance.strongerTopics.join(', ')}`);
  }
  if (performance.recentQuizAverage != null) {
    lines.push(`Recent quiz average: ${performance.recentQuizAverage}%`);
  }

  if (!lines.length) return '';

  const guidance = [
    'GENERATION GUIDANCE',
    '- Keep the requested subject, scope and output format exactly as asked. This context only tunes emphasis, examples and difficulty — it must never replace the requested topic.',
  ];
  if (performance.weakTopics.length) {
    guidance.push('- Where the material naturally touches the areas needing reinforcement, add a little extra explanation, an extra worked example, or a short reminder note.');
  }
  if (performance.strongerTopics.length) {
    guidance.push('- Move briskly through fundamentals the student has already mastered.');
  }
  if (performance.recentQuizAverage != null && performance.recentQuizAverage < LOW_AVERAGE) {
    guidance.push('- Favour more foundational steps and more concrete examples; increase difficulty gradually.');
  }
  if (performance.recentQuizAverage != null && performance.recentQuizAverage >= HIGH_AVERAGE) {
    guidance.push('- Include more application and analysis; reduce basic recall.');
  }
  guidance.push('- Never reveal or hint at quiz answers before the student submits.');

  return `STUDENT LEARNING CONTEXT\n${lines.join('\n')}\n\n${guidance.join('\n')}`;
}

/**
 * Small non-sensitive snapshot stored in <table>.personalization_context.
 * Return an object; callers JSON.stringify before binding.
 */
function buildContextSnapshot(context) {
  if (!context) return null;
  const { generationType, personalizationLevel, profile, preferences, course, performance, engagement } = context;

  const snapshot = {
    source: `${generationType}_generation`,
    personalizationLevel,
    generatedAt: new Date().toISOString(),
  };
  if (profile.program) snapshot.program = profile.program;
  if (profile.yearLevel != null) snapshot.yearLevel = profile.yearLevel;
  if (preferences.preferredDifficulty) snapshot.preferredDifficulty = preferences.preferredDifficulty;
  if (preferences.requestedDifficulty) snapshot.requestedDifficulty = preferences.requestedDifficulty;
  if (course?.title) snapshot.course = String(course.title).slice(0, 150);
  if (course?.progressPercent != null) snapshot.courseProgressPercent = course.progressPercent;
  if (performance.weakTopics.length) snapshot.weakTopics = performance.weakTopics;
  if (performance.strongerTopics.length) snapshot.strongerTopics = performance.strongerTopics;
  if (performance.recentQuizAverage != null) snapshot.recentQuizAverage = performance.recentQuizAverage;
  if (engagement.currentStreak) snapshot.currentStreak = engagement.currentStreak;
  return snapshot;
}

/** Ready-to-store JSON string (or null). */
function snapshotJson(context) {
  const snapshot = buildContextSnapshot(context);
  return snapshot ? JSON.stringify(snapshot) : null;
}

module.exports = {
  buildPersonalizationContext,
  formatPersonalizationPrompt,
  buildContextSnapshot,
  snapshotJson,
  delimitStudentText,
};
