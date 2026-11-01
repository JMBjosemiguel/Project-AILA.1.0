const bcrypt = require('bcrypt');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/userModel');
const authService = require('./authService');

// '' clears an optional text field; stored as NULL so "not provided" has one
// representation.
function blankToNull(value) {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function getProfile(userId) {
  const [user, activities, personal] = await Promise.all([
    userModel.findUserById(userId),
    userModel.getRecentActivity(userId),
    userModel.findProfilePersonalFields(userId),
  ]);

  return {
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      student_number: user.student_number,
    },
    // Middle name, Facebook and contact number come only from this owner-only
    // endpoint (and admin user details) — never from the shared auth user object.
    profile: user.profile ? { ...user.profile, ...personal } : null,
    activities,
  };
}

async function updateProfile(userId, updates) {
  const fields = {};
  if (updates.program !== undefined) fields.program = updates.program;
  if (updates.year_level !== undefined) fields.year_level = updates.year_level;
  if (updates.bio !== undefined) fields.bio = updates.bio;
  if (updates.avatar_url !== undefined) fields.avatar_url = blankToNull(updates.avatar_url);
  if (updates.leaderboard_opt_in !== undefined) fields.leaderboard_opt_in = updates.leaderboard_opt_in ? 1 : 0;
  if (updates.middle_name !== undefined) fields.middle_name = blankToNull(updates.middle_name);
  if (updates.facebook !== undefined) fields.facebook = blankToNull(updates.facebook);
  if (updates.contact_number !== undefined) fields.contact_number = blankToNull(updates.contact_number);

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
