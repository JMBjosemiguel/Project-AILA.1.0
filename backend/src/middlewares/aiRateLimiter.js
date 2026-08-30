const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 30;

// Every route that uses this limiter runs `authenticate` first, so req.auth is
// always present here. Key the bucket by the authenticated user id so each
// student gets an independent AI allowance — a per-IP key would let students
// behind the same NAT / proxy hop drain each other's budget.
function aiRateLimitKey(req) {
  const userId = req.auth?.user?.id;
  if (userId) return `ai:user:${userId}`;
  return `ai:ip:${ipKeyGenerator(req.ip)}`;
}

function aiRateLimitExceeded(req, res) {
  const resetMs = req.rateLimit?.resetTime
    ? req.rateLimit.resetTime.getTime() - Date.now()
    : WINDOW_MS;
  const minutes = Math.max(1, Math.ceil(resetMs / 60000));

  res.status(429).json({
    success: false,
    message: `You've reached the AI request limit. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    details: null,
  });
}

const aiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_PER_WINDOW,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: aiRateLimitKey,
  handler: aiRateLimitExceeded,
});

module.exports = {
  aiRateLimiter,
  aiRateLimitKey,
};
