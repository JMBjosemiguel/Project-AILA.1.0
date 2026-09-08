const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const courseAssessmentService = require('../services/courseAssessmentService');

// GET /api/subjects/:subjectId/assessments — the checkpoint/final status map.
const getAssessments = asyncHandler(async (req, res) => {
  const data = await courseAssessmentService.getCourseAssessments(req.auth.user.id, req.params.subjectId);
  sendSuccess(res, data, 200, 'Course assessments retrieved.');
});

// POST /api/subjects/:subjectId/modules/:moduleId/checkpoint — open (generate on
// first call) the module checkpoint. Returns a take-safe payload.
const openCheckpoint = asyncHandler(async (req, res) => {
  const data = await courseAssessmentService.openModuleCheckpoint(
    req.auth.user.id, req.params.subjectId, req.params.moduleId
  );
  sendSuccess(res, data, 200, 'Module checkpoint ready.');
});

// POST /api/subjects/:subjectId/final — open (generate on first call) the course final.
const openFinal = asyncHandler(async (req, res) => {
  const data = await courseAssessmentService.openCourseFinal(req.auth.user.id, req.params.subjectId);
  sendSuccess(res, data, 200, 'Course final ready.');
});

module.exports = {
  getAssessments,
  openCheckpoint,
  openFinal,
};
