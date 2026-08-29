const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const learningService = require('../services/learningService');

const listSubjects = asyncHandler(async (req, res) => {
  const subjects = await learningService.listSubjects(req.auth.user.id);
  sendSuccess(res, { subjects }, 200, 'Subjects retrieved.');
});

const generateCourse = asyncHandler(async (req, res) => {
  const { courseName, difficulty, goal } = req.body;
  const result = await learningService.generateCourse(req.auth.user.id, { courseName, difficulty, goal });
  sendSuccess(res, result, 201, 'Course generated.');
});

const getLesson = asyncHandler(async (req, res) => {
  const detail = await learningService.getLesson(req.auth.user.id, req.params.lessonId);
  sendSuccess(res, detail, 200, 'Lesson retrieved.');
});

const completeLesson = asyncHandler(async (req, res) => {
  const result = await learningService.completeLesson(req.auth.user.id, req.params.lessonId);
  sendSuccess(res, result, 200, result.alreadyCompleted ? 'Lesson was already completed.' : 'Lesson marked complete.');
});

const deleteSubject = asyncHandler(async (req, res) => {
  await learningService.deleteSubject(req.auth.user.id, req.params.subjectId);
  sendSuccess(res, null, 200, 'Course deleted.');
});

module.exports = {
  listSubjects,
  generateCourse,
  getLesson,
  completeLesson,
  deleteSubject,
};
