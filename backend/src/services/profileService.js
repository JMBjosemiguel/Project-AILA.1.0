const bcrypt = require('bcrypt');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/userModel');
const authService = require('./authService');

async function getProfile(userId) {
  const [user, activities] = await Promise.all([
    userModel.findUserById(userId),
    userModel.getRecentActivity(userId),
  ]);

  return {
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      student_number: user.student_number,
    },
    profile: user.profile,
    activities,
  };
}

async function updateProfile(userId, updates) {
  const fields = {};
  if (updates.program !== undefined) fields.program = updates.program;
  if (updates.year_level !== undefined) fields.year_level = updates.year_level;
  if (updates.bio !== undefined) fields.bio = updates.bio;
  if (updates.avatar_url !== undefined) fields.avatar_url = updates.avatar_url;

  if (Object.keys(fields).length) {
    await userModel.updateProfileFields(userId, fields);
  }

  return getProfile(userId);
}

async function changePassword(userId, currentPassword, newPassword) {
  const hash = await userModel.findPasswordHashById(userId);
  const isValid = await bcrypt.compare(currentPassword, authService.normalizeBcryptHash(hash));

  if (!isValid) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  const newHash = await bcrypt.hash(newPassword, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
  await userModel.updatePasswordHash(userId, newHash);
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
};
