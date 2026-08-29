const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validateRequest(req, res, next) {
  void res;
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const details = result.array().map((item) => ({
    field: item.path,
    message: item.msg,
  }));

  return next(new ApiError(422, 'Validation failed.', details));
}

module.exports = {
  validateRequest,
};
