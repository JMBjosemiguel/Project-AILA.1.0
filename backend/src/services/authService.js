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
const emailVerificationModel = require('../models/emailVerificationModel');
const emailService = require('../services/emailService');
const { generateVerificationToken, hashVerificationToken, looksLikeVerificationToken } = require('../utils/verificationToken');

const STUDENT_ROLE = 'student';
const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000; // ~30 minutes

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

// Maps the DB's unique-index name back to a field-specific, friendly message.
// Both `users.email` and `users.student_number` are already pre-checked before
// the insert; this only fires on the rare concurrent double-submit race where
// two requests pass the pre-check at the same time.
function duplicateUserError(error) {
  const detail = `${error.sqlMessage || ''} ${error.message || ''}`;
  if (detail.includes('uq_users_email')) {
    return new ApiError(409, 'An account with this email already exists.');
  }
  if (detail.includes('uq_users_student_number')) {
    return new ApiError(409, 'An account with this student number already exists.');
  }
  return null;
}

function buildVerifyUrl(rawToken) {
  const base = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
}

// Issues a fresh token (superseding any still-active one for this user) and
// stores only its hash. Returns the RAW token — callers must email it and
// never persist it themselves.
async function issueVerificationToken(userId, connection = null) {
  await emailVerificationModel.invalidateActiveTokens(userId, connection);
  const { raw, hash } = generateVerificationToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await emailVerificationModel.createToken({ userId, tokenHash: hash, expiresAt }, connection);
  return raw;
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

  let userId;
  let rawToken;
  try {
    userId = await transaction(async (connection) => {
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

      rawToken = await issueVerificationToken(userResult.insertId, connection);

      return userResult.insertId;
    });
  } catch (error) {
    // A concurrent duplicate registration can slip past the pre-checks above
    // and only fail here, at the unique-index level — surface it as the same
    // friendly 409 instead of an uncaught 500.
    if (error && error.code === 'ER_DUP_ENTRY') {
      const mapped = duplicateUserError(error);
      if (mapped) throw mapped;
    }
    throw error;
  }

  const user = await findUserById(userId);

  // Best-effort: account creation must succeed even if the mail provider is
  // briefly down. The student can always request another link via resend.
  try {
    await emailService.sendVerificationEmail(user, buildVerifyUrl(rawToken));
  } catch (emailError) {
    console.error(`[authService] verification email failed to send for user ${userId}: ${emailError.message}`);
  }

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

  // Checked only AFTER the password is confirmed correct, so a wrong password
  // on an unverified account still just says "Invalid email or password" —
  // never revealing verification status to someone who doesn't know the password.
  if (!userWithPassword.email_verified_at) {
    throw new ApiError(403, 'Please verify your email address before signing in.', { code: 'EMAIL_NOT_VERIFIED' });
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

async function verifyEmail(rawToken) {
  if (!looksLikeVerificationToken(rawToken)) {
    throw new ApiError(400, 'This verification link is invalid.', { code: 'TOKEN_INVALID' });
  }
  const tokenHash = hashVerificationToken(rawToken);

  return transaction(async (connection) => {
    const tokenRow = await emailVerificationModel.findTokenByHashForUpdate(tokenHash, connection);
    if (!tokenRow) {
      throw new ApiError(400, 'This verification link is invalid.', { code: 'TOKEN_INVALID' });
    }

    const [userRows] = await connection.execute(
      'SELECT email_verified_at FROM users WHERE id = ? LIMIT 1',
      [tokenRow.user_id]
    );
    const userRow = userRows[0];
    if (!userRow) {
      throw new ApiError(400, 'This verification link is invalid.', { code: 'TOKEN_INVALID' });
    }

    // Already verified (via this token or a later one) — a friendly, non-error
    // outcome regardless of what state this particular token is in.
    if (userRow.email_verified_at) {
      return { alreadyVerified: true };
    }

    if (tokenRow.used_at) {
      throw new ApiError(400, 'This verification link is invalid.', { code: 'TOKEN_USED' });
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      throw new ApiError(410, 'This verification link has expired. Please request a new one.', { code: 'TOKEN_EXPIRED' });
    }

    await emailVerificationModel.markTokenUsed(tokenRow.id, connection);
    await emailVerificationModel.markUserVerified(tokenRow.user_id, connection);

    return { alreadyVerified: false };
  });
}

async function resendVerification(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  const user = await findUserByEmail(email);

  // Unknown email: respond exactly like a successful send so this endpoint
  // cannot be used to discover which addresses have an AILA account.
  if (!user) {
    return { sent: true };
  }

  if (user.email_verified) {
    return { alreadyVerified: true };
  }

  const rawToken = await transaction(async (connection) => issueVerificationToken(user.id, connection));
  await emailService.sendVerificationEmail(user, buildVerifyUrl(rawToken));

  return { sent: true };
}

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  resendVerification,
  normalizeBcryptHash,
};
