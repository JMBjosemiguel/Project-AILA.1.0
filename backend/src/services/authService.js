const bcrypt = require('bcrypt');
const ApiError = require('../utils/ApiError');
const { signAuthToken } = require('../utils/jwt');
const { transaction } = require('../config/database');
const {
  findUserByEmailWithPassword,
  findUserByEmail,
  findUserById,
  findUserByStudentNumber,
  getRoleIdByName,
  updateLastLogin,
} = require('../models/userModel');
const { createSession, deleteSession } = require('../models/sessionModel');

const STUDENT_ROLE = 'student';

function normalizeRegisterPayload(payload) {
  return {
    first_name: payload.first_name.trim(),
    last_name: payload.last_name.trim(),
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    student_number: payload.student_number?.trim() || null,
    program: payload.program?.trim() || null,
    year_level: payload.year_level ? Number(payload.year_level) : null,
  };
}

function buildToken(user, sessionId) {
  return signAuthToken({
    sub: user.id,
    role: user.role,
    sessionId,
  });
}

function normalizeBcryptHash(hash) {
  if (hash?.startsWith('$2y$')) {
    return `$2b$${hash.slice(4)}`;
  }

  return hash;
}

async function register(payload) {
  const data = normalizeRegisterPayload(payload);

  const existingEmail = await findUserByEmail(data.email);
  if (existingEmail) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  if (data.student_number) {
    const existingStudentNumber = await findUserByStudentNumber(data.student_number);
    if (existingStudentNumber) {
      throw new ApiError(409, 'An account with this student number already exists.');
    }
  }

  const roleId = await getRoleIdByName(STUDENT_ROLE);
  if (!roleId) {
    throw new ApiError(500, 'Student role is missing from the database.');
  }

  const passwordHash = await bcrypt.hash(
    data.password,
    Number(process.env.BCRYPT_SALT_ROUNDS || 10)
  );

  const userId = await transaction(async (connection) => {
    const [userResult] = await connection.execute(
      `
        INSERT INTO users (
          role_id, student_number, email, password_hash, first_name, last_name, is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [
        roleId,
        data.student_number,
        data.email,
        passwordHash,
        data.first_name,
        data.last_name,
      ]
    );

    await connection.execute(
      `
        INSERT INTO user_profiles (user_id, program, year_level, xp_points, level)
        VALUES (?, ?, ?, 0, 1)
      `,
      [userResult.insertId, data.program, data.year_level]
    );

    return userResult.insertId;
  });

  const user = await findUserById(userId);

  return {
    user,
  };
}

async function login(payload, requestMeta) {
  const email = payload.email.trim().toLowerCase();
  const userWithPassword = await findUserByEmailWithPassword(email);

  if (!userWithPassword || !userWithPassword.is_active) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const isPasswordValid = await bcrypt.compare(
    payload.password,
    normalizeBcryptHash(userWithPassword.password_hash)
  );
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const sessionId = await createSession(
    userWithPassword.id,
    requestMeta.deviceInfo,
    requestMeta.ipAddress
  );
  await updateLastLogin(userWithPassword.id);

  const user = await findUserById(userWithPassword.id);

  return {
    user,
    token: buildToken(user, sessionId),
  };
}

async function logout(auth) {
  await deleteSession(auth.session.id, auth.user.id);
}

module.exports = {
  register,
  login,
  logout,
  normalizeBcryptHash,
};
