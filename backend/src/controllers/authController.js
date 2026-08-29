const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const authService = require('../services/authService');

function getRequestMeta(req) {
  return {
    deviceInfo: req.get('user-agent') || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
  };
}

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  sendSuccess(res, result, 201, 'Account created successfully.');
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

module.exports = {
  register,
  login,
  logout,
  me,
};
