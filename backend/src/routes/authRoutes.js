const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { emailVerificationRateLimiter } = require('../middlewares/emailVerificationRateLimiter');
const { passwordResetRateLimiter } = require('../middlewares/passwordResetRateLimiter');
const {
  loginValidator,
  registerValidator,
  verifyEmailValidator,
  resendVerificationValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require('../validators/authValidator');

const router = express.Router();

// Rate-limited the same as resend: register() can now re-issue a
// verification email for an existing-but-unverified account (see
// authService.register), so without this a script could bypass the resend
// limiter entirely just by calling /register repeatedly for the same email.
router.post('/register', emailVerificationRateLimiter, registerValidator, validateRequest, authController.register);
router.post('/login', loginValidator, validateRequest, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/verify-email', verifyEmailValidator, validateRequest, authController.verifyEmail);
router.post(
  '/resend-verification',
  emailVerificationRateLimiter,
  resendVerificationValidator,
  validateRequest,
  authController.resendVerification
);
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  forgotPasswordValidator,
  validateRequest,
  authController.forgotPassword
);
router.post('/reset-password', resetPasswordValidator, validateRequest, authController.resetPassword);

module.exports = router;
