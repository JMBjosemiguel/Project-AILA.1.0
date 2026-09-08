const ApiError = require('../utils/ApiError');
const { transaction } = require('../config/database');
const learningModel = require('../models/learningModel');
const courseGenerationService = require('./courseGenerationService');
const personalizationService = require('./personalizationService');
const { awardXpOnce, touchStreak, logActivity } = require('../utils/gamification');
const { notifyUser } = require('../utils/notify');

const LESSON_COMPLETE_XP = 10;

// Pull just the personalization LEVEL out of a stored snapshot — never the whole
// snapshot, which stays server-side only.
function personalizationLevelFromSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed?.personalizationLevel ?? null;
  } catch {
    return null;
  }
}

async function listSubjects(userId) {
  return learningModel.listSubjectsForUser(userId);
}

async function generateCourse(userId, { courseName, difficulty, goal }) {
  // The course does not exist yet, so performance signals are global (not
  // subject-scoped). Context building is best-effort — a failure here must not
  // block course generation.
  let context = null;
  try {
    context = await personalizationService.buildPersonalizationContext(userId, {
      requestedDifficulty: difficulty,
      generationType: 'course',
      knownSubject: { name: courseName, goal },
    });
  } catch {
    context = null;
  }

  const subjectId = await courseGenerationService.generateRoadmap({ userId, courseName, difficulty, goal, context });
  return { subjectId, personalizationLevel: context?.personalizationLevel ?? 'basic' };
}

async function getLesson(userId, lessonId) {
  const detail = await learningModel.getLessonDetail(Number(lessonId), userId);
  if (!detail) {
    throw new ApiError(404, 'Lesson not found.');
  }

  if (!detail.lesson.content) {
    let context = null;
    try {
      context = await personalizationService.buildPersonalizationContext(userId, {
        subjectId: detail.subject.id,
        generationType: 'lesson',
        knownSubject: { id: detail.subject.id, name: detail.subject.name, goal: detail.subject.goal },
      });
    } catch {
      context = null; // optional context failed — generate generically
    }

    try {
      detail.lesson.content = await courseGenerationService.generateLessonContent({
        id: detail.lesson.id,
        title: detail.lesson.title,
        difficulty: detail.lesson.difficulty,
        topic_title: detail.topic.title,
        module_title: detail.module.title,
        subject_name: detail.subject.name,
        goal: detail.subject.goal,
      }, context);
      detail.lesson.personalizationLevel = context?.personalizationLevel ?? null;
    } catch {
      // AI is unavailable right now — return the lesson shell so the page can
      // render a retry instead of failing the whole request. Nothing partial
      // was stored, so a later open will try again.
      detail.lesson.content = null;
      detail.lesson.contentError = true;
    }
  } else {
    detail.lesson.personalizationLevel = personalizationLevelFromSnapshot(detail.lesson.personalization_context);
  }

  delete detail.lesson.personalization_context; // never expose the raw snapshot to the client
  return detail;
}

async function completeLesson(userId, lessonId) {
  const lesson = await learningModel.getLessonBasicForUser(Number(lessonId), userId);
  if (!lesson) {
    throw new ApiError(404, 'Lesson not found.');
  }

  const existing = await learningModel.getLessonProgress(userId, lesson.id);
  if (existing) {
    return { alreadyCompleted: true, lessonId: lesson.id };
  }

  return transaction(async (connection) => {
    await learningModel.markLessonComplete(userId, lesson.id, connection);
    const topicProgress = await learningModel.recomputeTopicProgress(userId, lesson.topic_id, connection);
    await awardXpOnce(userId, {
      eventKey: `lesson_completed:${lesson.id}`,
      points: LESSON_COMPLETE_XP,
      reason: `Completed lesson "${lesson.title}"`,
    }, connection);
    await touchStreak(userId, connection);
    await logActivity(userId, 'lesson_completed', lesson.id, `Completed lesson "${lesson.title}"`, connection);
    await notifyUser(userId, {
      type: 'system',
      title: 'Lesson completed',
      body: `You completed "${lesson.title}". +${LESSON_COMPLETE_XP} XP earned.`,
      connection,
    });

    return { alreadyCompleted: false, lessonId: lesson.id, topicProgress };
  });
}

async function deleteSubject(userId, subjectId) {
  const owned = await learningModel.subjectBelongsToUser(Number(subjectId), userId);
  if (!owned) {
    throw new ApiError(404, 'Course not found.');
  }

  await transaction((connection) => learningModel.deleteSubjectCascade(Number(subjectId), userId, connection));
}

module.exports = {
  listSubjects,
  generateCourse,
  getLesson,
  completeLesson,
  deleteSubject,
};
