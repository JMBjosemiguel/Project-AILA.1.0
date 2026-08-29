const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const aiStudyToolsService = require('../services/aiStudyToolsService');

const generate = asyncHandler(async (req, res) => {
  const { tool, topic, difficulty } = req.body;

  const result = await aiStudyToolsService.generateTextTool({
    userId: req.auth.user.id,
    tool,
    topic,
    difficulty,
  });

  sendSuccess(res, result, 200, 'Study tool generated.');
});

const objectivesPreview = asyncHandler(async (req, res) => {
  const objectives = await aiStudyToolsService.generateObjectivesPreview(
    req.query.topic,
    req.query.difficulty
  );

  sendSuccess(res, { objectives }, 200, 'Objectives generated.');
});

module.exports = {
  generate,
  objectivesPreview,
};
