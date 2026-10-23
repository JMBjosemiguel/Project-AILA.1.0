const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 3;

// Same reasoning as emailVerificationRateLimiter: forgot-password is
// unauthenticated, so key by the normalized email typed rather than a user
// id. Independent of the global per-IP /api limiter (server.js), which
// stops one IP from bombing many addresses.
function forgotPasswordRateLimitKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return email ? `forgot-password:email:${email}` : `forgot-password:ip:${ipKeyGenerator(req.ip)}`;
}

function forgotPasswordRateLimitExceeded(req, res) {
  res.status(429).json({
    success: false,
    message: "You've requested a password reset too many times. Please wait a few minutes and try again.",
    details: null,
  });
}

const passwordResetRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_PER_WINDOW,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: forgotPasswordRateLimitKey,
  handler: forgotPasswordRateLimitExceeded,
});

module.exports = {
  passwordResetRateLimiter,
  forgotPasswordRateLimitKey,
};
