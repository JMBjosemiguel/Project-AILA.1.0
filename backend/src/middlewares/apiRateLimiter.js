const { rateLimit } = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
// Raised from 300: Render's trust-proxy setup already resolves each visitor's
// real IP (see docs/DEPLOYMENT.md #10), so 300/15min was genuinely shared
// per-visitor, not pooled across everyone — it was just too low for normal
// use (AI features alone can mean dozens of requests in a session).
const LIMIT = 1000;

function rateLimitExceeded(req, res) {
  res.status(429).json({
    success: false,
    message: 'Too many requests — please wait a moment and try again.',
    details: null,
  });
}

const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitExceeded,
});

module.exports = {
  apiRateLimiter,
  GENERAL_API_LIMIT: LIMIT,
  GENERAL_API_WINDOW_MS: WINDOW_MS,
  rateLimitExceeded,
};
