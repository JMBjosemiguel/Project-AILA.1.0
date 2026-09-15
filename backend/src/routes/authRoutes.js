const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { emailVerificationRateLimiter } = require('../middlewares/emailVerificationRateLimiter');
const {
  loginValidator,
  registerValidator,
  verifyEmailValidator,
  resendVerificationValidator,
} = require('../validators/authValidator');

const router = express.Router();

router.post('/register', registerValidator, validateRequest, authController.register);
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

module.exports = router;
