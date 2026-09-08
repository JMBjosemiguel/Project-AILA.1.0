const ApiError = require('../utils/ApiError');
const assessmentModel = require('../models/courseAssessmentModel');
const quizService = require('./quizService');

const FINAL_SLOT = assessmentModel.FINAL_SLOT;

const COURSE_DIFFICULTY_TO_QUIZ = { beginner: 'easy', intermediate: 'medium', advanced: 'hard' };

// Per (user, course, slot) in-process guard: concurrent first-opens of the same
// assessment share one generation instead of each calling Gemini and then
// discarding on the UNIQUE constraint. Process-local — on a multi-instance
// deployment the UNIQUE index still keeps the data single, at the cost of a
// wasted Gemini call (same tradeoff as Batch 1 lesson generation).
const assessmentGenerationInFlight = new Map();

async function withGenerationGuard(key, task) {
  if (assessmentGenerationInFlight.has(key)) return assessmentGenerationInFlight.get(key);
  const promise = task();
  assessmentGenerationInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    assessmentGenerationInFlight.delete(key);
  }
}

// --- status derivation ---------------------------------------------------

function scorePercent(attempt) {
  return attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
}

/**
 * Turn one assessment's attempt history + its unlock state into a single
 * status the UI can render. Pass-history wins: once passed, always passed —
 * a later worse retake never downgrades it (spec §16).
 */
function deriveStatus({ unlocked, quiz, attempts }) {
  const inProgress = attempts.find((a) => a.status === 'in_progress') || null;
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const passedAttempt = submitted.find((a) => a.passed === 1) || null;
  const latest = submitted[0] || null;
  const bestScore = submitted.length ? Math.max(...submitted.map(scorePercent)) : null;

  let status;
  if (passedAttempt) status = 'passed';
  else if (inProgress) status = 'in_progress';
  else if (submitted.length) status = 'failed';
  else if (!unlocked) status = 'locked';
  else status = 'ready';

  return {
    status,
    quizId: quiz ? quiz.id : null,
    passingScore: quiz ? Number(quiz.passing_score ?? quizService.DEFAULT_PASSING_SCORE) : quizService.DEFAULT_PASSING_SCORE,
    itemCount: quiz ? quiz.item_count : null,
    passed: Boolean(passedAttempt),
    bestScore,
    latestScore: latest ? scorePercent(latest) : null,
    attemptCount: submitted.length,
    // The attempt to open for "Review" (best pass, else latest submitted) and
    // the one to "Resume" (any in-progress).
    reviewAttemptId: (passedAttempt || latest) ? (passedAttempt || latest).id : null,
    inProgressAttemptId: inProgress ? inProgress.id : null,
  };
}

// --- outline builders (concise — titles only, never lesson bodies) ------

async function buildModuleOutline(module_) {
  const topics = await assessmentModel.getModuleOutline(module_.id);
  const lines = [`Module: ${module_.title}`];
  for (const topic of topics) {
    lines.push(topic.lessons.length ? `- ${topic.title}: ${topic.lessons.join('; ')}` : `- ${topic.title}`);
  }
  return lines.join('\n');
}

async function buildCourseOutline(subjectId, courseName) {
  const modules = await assessmentModel.getCourseOutline(subjectId);
  const lines = [`Course: ${courseName}`];
  modules.forEach((module_, index) => {
    lines.push(`Module ${index + 1}: ${module_.title}${module_.topics.length ? ` — topics: ${module_.topics.join(', ')}` : ''}`);
  });
  return lines.join('\n');
}

// --- the course assessment map (drives the Learning Hub UI) -------------

async function getCourseAssessments(userId, subjectId) {
  const course = await assessmentModel.getCourseForUser(Number(subjectId), userId);
  if (!course) throw new ApiError(404, 'Course not found.');

  const modules = await assessmentModel.getCourseModules(course.id);
  const assessmentQuizzes = await assessmentModel.listCourseAssessmentQuizzes(userId, course.id);
  const bySlot = new Map(assessmentQuizzes.map((q) => [Number(q.assessment_slot), q]));

  const moduleResults = [];
  for (const module_ of modules) {
    const content = await assessmentModel.getModuleContentStatus(module_.id, userId);
    const quiz = bySlot.get(module_.id) || null;
    const attempts = quiz ? await assessmentModel.getAssessmentAttempts(userId, quiz.id) : [];
    const checkpoint = deriveStatus({ unlocked: content.contentCompleted, quiz, attempts });

    moduleResults.push({
      moduleId: module_.id,
      title: module_.title,
      orderIndex: module_.order_index,
      contentCompleted: content.contentCompleted,
      totalTopics: content.totalTopics,
      completedTopics: content.completedTopics,
      checkpoint,
      moduleCompleted: content.contentCompleted && checkpoint.passed,
    });
  }

  const allCheckpointsPassed = moduleResults.length > 0 && moduleResults.every((m) => m.checkpoint.passed);
  const finalQuiz = bySlot.get(FINAL_SLOT) || null;
  const finalAttempts = finalQuiz ? await assessmentModel.getAssessmentAttempts(userId, finalQuiz.id) : [];
  const final = deriveStatus({ unlocked: allCheckpointsPassed, quiz: finalQuiz, attempts: finalAttempts });

  const allContentComplete = moduleResults.length > 0 && moduleResults.every((m) => m.contentCompleted);

  return {
    subjectId: course.id,
    courseName: course.name,
    modules: moduleResults,
    final,
    prerequisitesForFinal: { allCheckpointsPassed },
    courseCompleted: allContentComplete && allCheckpointsPassed && final.passed,
  };
}

// --- open / generate one assessment (on demand) -------------------------

async function openModuleCheckpoint(userId, subjectId, moduleId) {
  const module_ = await assessmentModel.getModuleForUser(Number(subjectId), Number(moduleId), userId);
  if (!module_) throw new ApiError(404, 'Module not found.');

  let quiz = await assessmentModel.findAssessmentQuiz(userId, module_.subject_id, module_.id);

  if (!quiz) {
    const content = await assessmentModel.getModuleContentStatus(module_.id, userId);
    if (!content.contentCompleted) {
      throw new ApiError(409, "Finish this module's lessons before taking the checkpoint.");
    }
    const quizId = await withGenerationGuard(`cp:${userId}:${module_.id}`, async () => {
      const course = await assessmentModel.getCourseForUser(module_.subject_id, userId);
      return quizService.createAndSaveAssessment({
        userId,
        kind: 'module_checkpoint',
        subjectId: module_.subject_id,
        moduleId: module_.id,
        assessmentSlot: module_.id,
        topic: module_.title,
        difficulty: COURSE_DIFFICULTY_TO_QUIZ[course?.difficulty] || 'medium',
        outlineText: await buildModuleOutline(module_),
      });
    });
    quiz = await assessmentModel.findAssessmentQuiz(userId, module_.subject_id, module_.id) || { id: quizId };
  }

  const take = await quizService.getQuizForUser(userId, quiz.id);
  return { ...take, assessmentKind: 'module_checkpoint', passingScore: Number(quiz.passing_score ?? quizService.DEFAULT_PASSING_SCORE) };
}

async function openCourseFinal(userId, subjectId) {
  const course = await assessmentModel.getCourseForUser(Number(subjectId), userId);
  if (!course) throw new ApiError(404, 'Course not found.');

  let quiz = await assessmentModel.findAssessmentQuiz(userId, course.id, FINAL_SLOT);

  if (!quiz) {
    const modules = await assessmentModel.getCourseModules(course.id);
    for (const module_ of modules) {
      const cpQuiz = await assessmentModel.findAssessmentQuiz(userId, course.id, module_.id);
      const passed = cpQuiz
        ? (await assessmentModel.getAssessmentAttempts(userId, cpQuiz.id)).some((a) => a.passed === 1)
        : false;
      if (!passed) {
        throw new ApiError(409, 'Pass every module checkpoint before taking the course final.');
      }
    }
    const quizId = await withGenerationGuard(`final:${userId}:${course.id}`, async () => quizService.createAndSaveAssessment({
      userId,
      kind: 'course_final',
      subjectId: course.id,
      moduleId: null,
      assessmentSlot: FINAL_SLOT,
      topic: course.name,
      difficulty: COURSE_DIFFICULTY_TO_QUIZ[course.difficulty] || 'medium',
      outlineText: await buildCourseOutline(course.id, course.name),
    }));
    quiz = await assessmentModel.findAssessmentQuiz(userId, course.id, FINAL_SLOT) || { id: quizId };
  }

  const take = await quizService.getQuizForUser(userId, quiz.id);
  return { ...take, assessmentKind: 'course_final', passingScore: Number(quiz.passing_score ?? quizService.DEFAULT_PASSING_SCORE) };
}

module.exports = {
  getCourseAssessments,
  openModuleCheckpoint,
  openCourseFinal,
};
