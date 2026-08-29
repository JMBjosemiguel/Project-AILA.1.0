const ApiError = require('../utils/ApiError');

function errorHandler(error, req, res, next) {
  void req;
  void next;

  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = statusCode === 500 ? 'Internal server error.' : error.message;

  if (statusCode === 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: error.details || null,
  });
}

module.exports = {
  errorHandler,
};
