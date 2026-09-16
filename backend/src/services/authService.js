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
  findDeletedIdentityConflicts,
  releaseDeletedIdentity,
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

// Best-effort send — never throws on a mail-provider failure. The account
// row is already durable by the time this runs (either committed moments
// ago, in register()'s own transaction, or long since existing), so a slow
// or unreachable SMTP relay must degrade to `emailSent: false`, never an
// error that makes an already-successful signup look like it failed.
async function sendVerificationBestEffort(user, rawToken) {
  try {
    await emailService.sendVerificationEmail(user, buildVerifyUrl(rawToken));
    return { emailSent: true };
  } catch (emailError) {
    console.error(`[authService] verification email failed to send for user ${user.id}: ${emailError.message}`);
    return { emailSent: false };
  }
}

// For an ALREADY-COMMITTED existing user (resendVerification, or a
// register() retry against a still-unverified account): issues a fresh
// token in its own transaction, then best-effort emails it. Fresh
// registration does NOT use this — its token is issued inside the same
// transaction as the INSERT itself (see register()) so token creation still
// happens before that transaction's COMMIT, per the required ordering.
async function issueAndSendVerification(user) {
  const rawToken = await transaction((connection) => issueVerificationToken(user.id, connection));
  return sendVerificationBestEffort(user, rawToken);
}

async function register(payload) {
  const data = normalizeRegisterPayload(payload);

  const existingEmail = await findUserByEmail(data.email);
  if (existingEmail) {
    if (existingEmail.email_verified) {
      throw new ApiError(409, 'An account with this email already exists.');
    }

    // Unverified duplicate: this is very likely the SAME student retrying
    // after the first attempt looked like it failed (the classic case being
    // exactly the bug this function now avoids — a slow/unreachable SMTP
    // relay stalling the first response). The account already exists and
    // must not be duplicated; the newly-submitted name/password/program are
    // deliberately NOT written to the existing row — only the account's own
    // verified inbox can ever receive the link, so re-sending to it is safe
    // regardless of who actually submitted this retry.
    const { emailSent } = await issueAndSendVerification(existingEmail);
    return {
      user: existingEmail,
      accountCreated: true,
      verificationRequired: true,
      emailSent,
      alreadyPending: true,
    };
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
      // A soft-deleted account (Admin > delete) still occupies its old
      // email/student_number under the DB's UNIQUE constraints even though
      // findUserByEmail/findUserByStudentNumber above correctly ignore it —
      // release just the colliding field(s) on that dead row (tombstoned,
      // never reactivated) so this INSERT doesn't hit ER_DUP_ENTRY for an
      // identity nothing active is using anymore. Covers rows deleted before
      // this fix existed too, not just ones deleted going forward.
      const deletedConflicts = await findDeletedIdentityConflicts(
        { email: data.email, studentNumber: data.student_number },
        connection
      );
      for (const conflictRow of deletedConflicts) {
        // eslint-disable-next-line no-await-in-loop
        await releaseDeletedIdentity(conflictRow, { email: data.email, studentNumber: data.student_number }, connection);
      }

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

  // Steps 1-4 (validate, create user, create token, COMMIT) are already
  // durable at this point — the account exists no matter what happens next.
  // The email send is best-effort and must never turn an already-successful
  // signup into a reported failure (see sendVerificationBestEffort).
  const { emailSent } = await sendVerificationBestEffort(user, rawToken);

  return {
    user,
    accountCreated: true,
    verificationRequired: true,
    emailSent,
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
    return { sent: true, alreadyVerified: true };
  }

  // Deliberately NOT reporting the real emailSent outcome here (unlike
  // register(), which may): a known-unverified account is the ONLY case
  // that ever attempts a real send, so surfacing a true/false split in this
  // response would let an SMTP outage turn this endpoint into a perfect,
  // deterministic account-existence oracle (every unknown email stays
  // "sent", every known-but-currently-failing one would flip to "not
  // sent"). issueAndSendVerification() already logs the real outcome
  // server-side for diagnostics; the response shape here stays exactly what
  // it was before this fix — only the try/catch (no more 502 on a genuine
  // SMTP failure) is new.
  await issueAndSendVerification(user);
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
