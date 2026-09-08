const express = require('express');
const learningController = require('../controllers/learningController');
const courseAssessmentController = require('../controllers/courseAssessmentController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter } = require('../middlewares/aiRateLimiter');
const {
  lessonIdParamValidator,
  generateCourseValidator,
  subjectIdParamValidator,
  moduleCheckpointParamValidator,
} = require('../validators/learningValidator');

const subjectsRouter = express.Router();
subjectsRouter.get('/', authenticate, learningController.listSubjects);
subjectsRouter.post('/generate', authenticate, aiRateLimiter, generateCourseValidator, validateRequest, learningController.generateCourse);

// Course assessments (module checkpoints + course final / long test).
subjectsRouter.get('/:subjectId/assessments', authenticate, subjectIdParamValidator, validateRequest, courseAssessmentController.getAssessments);
subjectsRouter.post('/:subjectId/final', authenticate, aiRateLimiter, subjectIdParamValidator, validateRequest, courseAssessmentController.openFinal);
subjectsRouter.post('/:subjectId/modules/:moduleId/checkpoint', authenticate, aiRateLimiter, moduleCheckpointParamValidator, validateRequest, courseAssessmentController.openCheckpoint);

subjectsRouter.delete('/:subjectId', authenticate, subjectIdParamValidator, validateRequest, learningController.deleteSubject);

const lessonsRouter = express.Router();
lessonsRouter.get('/:lessonId', authenticate, lessonIdParamValidator, validateRequest, learningController.getLesson);
lessonsRouter.post('/:lessonId/complete', authenticate, lessonIdParamValidator, validateRequest, learningController.completeLesson);

module.exports = {
  subjectsRouter,
  lessonsRouter,
};
