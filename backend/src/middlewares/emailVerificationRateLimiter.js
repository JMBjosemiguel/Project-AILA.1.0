const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 3;

// Resend is unauthenticated (the student isn't logged in yet), so key by the
// normalized email they typed rather than a user id — this is what stops
// "email bombing" one address, independent of the global per-IP /api limiter
// (server.js) which stops one IP from bombing many addresses.
function resendRateLimitKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return email ? `verify-resend:email:${email}` : `verify-resend:ip:${ipKeyGenerator(req.ip)}`;
}

function resendRateLimitExceeded(req, res) {
  res.status(429).json({
    success: false,
    message: "You've requested a verification email too many times. Please wait a few minutes and try again.",
    details: null,
  });
}

const emailVerificationRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_PER_WINDOW,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: resendRateLimitKey,
  handler: resendRateLimitExceeded,
});

module.exports = {
  emailVerificationRateLimiter,
  resendRateLimitKey,
};
