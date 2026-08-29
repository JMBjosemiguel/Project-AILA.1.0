const express = require('express');
const learningController = require('../controllers/learningController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter } = require('../middlewares/aiRateLimiter');
const { lessonIdParamValidator, generateCourseValidator, subjectIdParamValidator } = require('../validators/learningValidator');

const subjectsRouter = express.Router();
subjectsRouter.get('/', authenticate, learningController.listSubjects);
subjectsRouter.post('/generate', authenticate, aiRateLimiter, generateCourseValidator, validateRequest, learningController.generateCourse);
subjectsRouter.delete('/:subjectId', authenticate, subjectIdParamValidator, validateRequest, learningController.deleteSubject);

const lessonsRouter = express.Router();
lessonsRouter.get('/:lessonId', authenticate, lessonIdParamValidator, validateRequest, learningController.getLesson);
lessonsRouter.post('/:lessonId/complete', authenticate, lessonIdParamValidator, validateRequest, learningController.completeLesson);

module.exports = {
  subjectsRouter,
  lessonsRouter,
};
