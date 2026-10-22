const { rateLimit } = require('express-rate-limit');

// This route is public (no auth), so it's keyed by IP like the general /api
// limiter — trust proxy is already set in server.js. Separate from and
// tighter than the general 1000/15min limit, since a shared quiz link can be
// hit by anyone with no account at all.
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 60;

function rateLimitExceeded(req, res) {
  res.status(429).json({
    success: false,
    message: 'Too many requests — please wait a moment and try again.',
    details: null,
  });
}

const shareCheckRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitExceeded,
});

module.exports = {
  shareCheckRateLimiter,
  SHARE_CHECK_LIMIT: LIMIT,
  SHARE_CHECK_WINDOW_MS: WINDOW_MS,
};
