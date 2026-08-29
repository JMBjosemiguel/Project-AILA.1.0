const ApiError = require('../utils/ApiError');
const { transaction } = require('../config/database');
const learningModel = require('../models/learningModel');
const courseGenerationService = require('./courseGenerationService');
const { awardXp, touchStreak, logActivity } = require('../utils/gamification');
const { notifyUser } = require('../utils/notify');

const LESSON_COMPLETE_XP = 10;

async function listSubjects(userId) {
  return learningModel.listSubjectsForUser(userId);
}

async function generateCourse(userId, { courseName, difficulty, goal }) {
  const subjectId = await courseGenerationService.generateRoadmap({ userId, courseName, difficulty, goal });
  return { subjectId };
}

async function getLesson(userId, lessonId) {
  const detail = await learningModel.getLessonDetail(Number(lessonId), userId);
  if (!detail) {
    throw new ApiError(404, 'Lesson not found.');
  }

  if (!detail.lesson.content) {
    const content = await courseGenerationService.generateLessonContent({
      id: detail.lesson.id,
      title: detail.lesson.title,
      difficulty: detail.lesson.difficulty,
      topic_title: detail.topic.title,
      module_title: detail.module.title,
      subject_name: detail.subject.name,
      goal: detail.subject.goal,
    });
    detail.lesson.content = content;
  }

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
    await awardXp(userId, LESSON_COMPLETE_XP, `Completed lesson "${lesson.title}"`, connection);
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
