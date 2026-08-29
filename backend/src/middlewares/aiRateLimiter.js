const rateLimit = require('express-rate-limit');

const aiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'AILA is receiving too many requests right now. Please wait a moment and try again.',
    details: null,
  },
});

module.exports = {
  aiRateLimiter,
};
