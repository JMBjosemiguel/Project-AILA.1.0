const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const profileService = require('../services/profileService');

const getProfile = asyncHandler(async (req, res) => {
  const result = await profileService.getProfile(req.auth.user.id);
  sendSuccess(res, result, 200, 'Profile retrieved.');
});

const updateProfile = asyncHandler(async (req, res) => {
  const { program, year_level: yearLevel, bio, avatar_url: avatarUrl } = req.body;
  const result = await profileService.updateProfile(req.auth.user.id, { program, year_level: yearLevel, bio, avatar_url: avatarUrl });
  sendSuccess(res, result, 200, 'Profile updated.');
});

const changePassword = asyncHandler(async (req, res) => {
  await profileService.changePassword(req.auth.user.id, req.body.current_password, req.body.new_password);
  sendSuccess(res, null, 200, 'Password updated.');
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
};
