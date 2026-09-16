const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const authService = require('../services/authService');

function getRequestMeta(req) {
  return {
    deviceInfo: req.get('user-agent') || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
  };
}

// Status/message reflect the TRUTH of what happened, not just "did the
// request succeed": the account (steps 1-4) is already durable by the time
// authService.register() returns, regardless of emailSent — so this never
// reports failure once accountCreated is true. 201 = a new account, email
// sent. 200 = re-issued a link for an already-pending unverified account,
// email sent. 202 = accepted/created but the email itself did not go out —
// recoverable via the resend endpoint the frontend routes to either way.
function registerStatusAndMessage(result) {
  if (!result.emailSent) {
    return {
      statusCode: 202,
      message: result.alreadyPending
        ? "We found an existing unverified registration for this email, but we couldn't send the verification email. Please resend it."
        : "Your account was created, but we couldn't send the verification email. Please resend it.",
    };
  }

  return {
    statusCode: result.alreadyPending ? 200 : 201,
    message: result.alreadyPending
      ? "We found an existing unverified registration for this email. We've sent a new verification link — check your email to verify your account."
      : 'Account created. Check your email to verify your account.',
  };
}

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  const { statusCode, message } = registerStatusAndMessage(result);
  sendSuccess(res, result, statusCode, message);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, getRequestMeta(req));
  sendSuccess(res, result, 200, 'Login successful.');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.auth);
  sendSuccess(res, null, 200, 'Logout successful.');
});

const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { user: req.auth.user }, 200, 'Authenticated user loaded.');
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.body.token);
  sendSuccess(
    res,
    result,
    200,
    result.alreadyVerified ? 'Your email is already verified.' : 'Email verified successfully.'
  );
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification(req.body.email);
  sendSuccess(
    res,
    result,
    200,
    result.alreadyVerified
      ? 'This email is already verified. You can sign in now.'
      : "If an account exists for that email and needs verification, we've sent a new link."
  );
});

module.exports = {
  register,
  login,
  logout,
  me,
  verifyEmail,
  resendVerification,
};
