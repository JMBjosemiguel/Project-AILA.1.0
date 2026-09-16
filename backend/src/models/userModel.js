const crypto = require('crypto');
const { query, execute } = require('../config/database');

// Soft-deleted users keep their row (and every historical child-table
// relationship keyed by user_id) but must stop occupying the unique
// email/student_number identity a brand-new student needs to register with.
// `.invalid` is the RFC 2606-reserved TLD for exactly this "never a real,
// deliverable address" case. Irreversible by design — nothing reads a
// tombstoned value back into a usable email/number.
function buildTombstoneEmail(userId) {
  return `deleted+${userId}+${crypto.randomBytes(6).toString('hex')}@deleted.aila.invalid`;
}

function buildTombstoneStudentNumber(userId) {
  // VARCHAR(30) — keep this comfortably short regardless of how large userId
  // ever gets; the UNIQUE constraint is still the ultimate backstop against
  // the astronomically unlikely random-suffix collision.
  return `del${userId}_${crypto.randomBytes(3).toString('hex')}`.slice(0, 30);
}

const publicUserSelect = `
  SELECT
    users.id,
    users.role_id,
    users.student_number,
    users.email,
    users.first_name,
    users.last_name,
    users.is_active,
    users.email_verified_at,
    users.last_login_at,
    users.created_at,
    users.updated_at,
    roles.name AS role,
    user_profiles.id AS profile_id,
    user_profiles.program,
    user_profiles.year_level,
    user_profiles.avatar_url,
    user_profiles.bio,
    user_profiles.xp_points,
    user_profiles.level,
    user_profiles.leaderboard_opt_in
  FROM users
  INNER JOIN roles ON roles.id = users.role_id
  LEFT JOIN user_profiles ON user_profiles.user_id = users.id
`;

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    role_id: row.role_id,
    student_number: row.student_number,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    is_active: Boolean(row.is_active),
    email_verified: Boolean(row.email_verified_at),
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    role: row.role,
    profile: row.profile_id
      ? {
          id: row.profile_id,
          user_id: row.id,
          program: row.program,
          year_level: row.year_level,
          avatar_url: row.avatar_url,
          bio: row.bio,
          xp_points: row.xp_points,
          level: row.level,
          leaderboard_opt_in: Boolean(row.leaderboard_opt_in),
        }
      : null,
  };
}

async function findUserByEmailWithPassword(email) {
  const rows = await query(
    `
      SELECT
        users.*,
        roles.name AS role
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.email = ?
        AND users.deleted_at IS NULL
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

async function findUserById(id) {
  const rows = await query(
    `
      ${publicUserSelect}
      WHERE users.id = ?
        AND users.deleted_at IS NULL
      LIMIT 1
    `,
    [id]
  );

  return mapUser(rows[0]);
}

async function findUserByEmail(email) {
  const rows = await query(
    `
      ${publicUserSelect}
      WHERE users.email = ?
        AND users.deleted_at IS NULL
      LIMIT 1
    `,
    [email]
  );

  return mapUser(rows[0]);
}

async function findUserByStudentNumber(studentNumber) {
  const rows = await query(
    `
      ${publicUserSelect}
      WHERE users.student_number = ?
        AND users.deleted_at IS NULL
      LIMIT 1
    `,
    [studentNumber]
  );

  return mapUser(rows[0]);
}

async function findPasswordHashById(userId) {
  const rows = await query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows[0]?.password_hash || null;
}

async function getRoleIdByName(roleName) {
  const rows = await query('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleName]);
  return rows[0]?.id || null;
}

async function updateLastLogin(userId) {
  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
}

async function updateProfileFields(userId, fields) {
  const columns = Object.keys(fields);
  if (!columns.length) return;

  const setClause = columns.map((column) => `${column} = ?`).join(', ');
  const params = [...columns.map((column) => fields[column]), userId];

  await query(`UPDATE user_profiles SET ${setClause} WHERE user_id = ?`, params);
}

async function updatePasswordHash(userId, passwordHash) {
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

// Soft-deleted rows still hold whatever email/student_number they had while
// active, so they can otherwise collide with the DB's UNIQUE constraints for
// a brand-new registration even though findUserByEmail/findUserByStudentNumber
// (both deleted_at IS NULL) correctly report "no active duplicate". FOR
// UPDATE — this is only ever called inside register()'s transaction, so it
// serializes against a concurrent registration racing for the same identity.
async function findDeletedIdentityConflicts({ email, studentNumber }, connection) {
  return execute(
    connection,
    `
      SELECT id, email, student_number
      FROM users
      WHERE deleted_at IS NOT NULL
        AND (email = ? OR (? IS NOT NULL AND student_number = ?))
      FOR UPDATE
    `,
    [email, studentNumber, studentNumber]
  );
}

// Overwrites ONLY the field(s) on a soft-deleted row that actually collide
// with the incoming registration — the row stays deleted, keeps its id, and
// every historical relationship keyed by that id (chats, quizzes, XP,
// resources, ...) stays exactly where it is. Never reactivates the row.
async function releaseDeletedIdentity(row, { email, studentNumber }, connection) {
  const sets = [];
  const params = [];

  if (row.email === email) {
    sets.push('email = ?');
    params.push(buildTombstoneEmail(row.id));
  }
  if (studentNumber && row.student_number === studentNumber) {
    sets.push('student_number = ?');
    params.push(buildTombstoneStudentNumber(row.id));
  }
  if (!sets.length) return;

  params.push(row.id);
  await execute(connection, `UPDATE users SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NOT NULL`, params);
}

async function getRecentActivity(userId, limit = 15) {
  return query(
    'SELECT id, activity_type, reference_id, description, created_at FROM dashboard_activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, Number(limit)]
  );
}

module.exports = {
  findUserByEmailWithPassword,
  findUserById,
  findUserByEmail,
  findUserByStudentNumber,
  findPasswordHashById,
  getRoleIdByName,
  updateLastLogin,
  updateProfileFields,
  updatePasswordHash,
  getRecentActivity,
  mapUser,
  findDeletedIdentityConflicts,
  releaseDeletedIdentity,
  buildTombstoneEmail,
  buildTombstoneStudentNumber,
};
