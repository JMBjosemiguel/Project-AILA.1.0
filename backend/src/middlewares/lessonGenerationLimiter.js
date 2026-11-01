const asyncHandler = require('../utils/asyncHandler');
const learningModel = require('../models/learningModel');
const { aiRateLimiter } = require('./aiRateLimiter');

// Opening a lesson that already has its content is free. One that still has to
// be generated costs a Gemini call, so only that case counts against the
// per-student AI limit (a script walking every empty lesson of a course used to
// trigger them all unmetered). Runs after `authenticate`.
function createLessonGenerationLimiter({
  needsGeneration = learningModel.lessonNeedsGeneration,
  limiter = aiRateLimiter,
} = {}) {
  return asyncHandler(async (req, res, next) => {
    const needs = await needsGeneration(Number(req.params.lessonId), req.auth.user.id);
    if (!needs) return next();
    return limiter(req, res, next);
  });
}

module.exports = {
  createLessonGenerationLimiter,
  lessonGenerationLimiter: createLessonGenerationLimiter(),
};
