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

// A single batched quiz generation (up to 150 items, ~15 per batch) can take
// 10+ batch requests on its own — at the normal 30-per-5-minutes AI limit,
// one large quiz would eat most or all of a student's whole allowance for
// everything else AILA does. The "start" request still counts against the
// normal aiRateLimiter above (it's one request, same as any other quiz
// generation); only the repeated per-batch requests get this separate,
// higher ceiling. Generation-specific safety (ownership, "still generating",
// "never past target", a hard cap on batch calls per quiz) lives in
// quizService.appendQuizBatch, not here — this is purely about not starving
// the student's other AI usage.
const quizBatchRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: aiRateLimitKey,
  handler: aiRateLimitExceeded,
});

module.exports = {
  aiRateLimiter,
  aiRateLimitKey,
  quizBatchRateLimiter,
};
