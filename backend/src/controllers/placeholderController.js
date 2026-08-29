const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

function createPlaceholderController(moduleName) {
  return asyncHandler(async () => {
    throw new ApiError(501, `${moduleName} API is scaffolded and pending CRUD implementation.`);
  });
}

module.exports = {
  createPlaceholderController,
};
