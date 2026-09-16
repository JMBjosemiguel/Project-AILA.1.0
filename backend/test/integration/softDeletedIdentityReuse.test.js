'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

const authService = require('../../src/services/authService');
const emailService = require('../../src/services/emailService');
const adminService = require('../../src/services/adminService');

const TAG = `qa.itest.softdel.${Date.now()}`;
let n = 0;
function nextEmail() {
  n += 1;
  return `${TAG}.${n}@example.com`;
}
function nextStudentNumber() {
  n += 1;
  return `SD-${Date.now() % 100000}-${n}`;
}

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

// Email delivery is orthogonal to this bug — always stub it to succeed so
// registration completes normally and any failure surfaced is about the
// soft-delete/identity-release logic, not SMTP.
const realSendVerificationEmail = emailService.sendVerificationEmail;
function stubEmailSuccess() {
  emailService.sendVerificationEmail = async () => ({ driver: 'console', to: 'stub' });
}
function restoreEmail() {
  emailService.sendVerificationEmail = realSendVerificationEmail;
}

const BASE_PAYLOAD = { first_name: 'ITest', last_name: 'SoftDel', password: 'ItestPassw0rd!' };
const ADMIN_ID_PLACEHOLDER = 1; // adminService.deleteUser logs against this id; not asserted on here

// Tombstoning rewrites email to something outside the qa.itest.softdel.* tag
// pattern, so purgeByTag alone can't find those rows afterward — track every
// id this file creates and hard-delete by id in cleanup as a supplement.
const allCreatedUserIds = [];
async function registerTracked(payload) {
  const result = await authService.register(payload);
  allCreatedUserIds.push(result.user.id);
  return result;
}
async function purgeById(ids) {
  if (!ids.length) return;
  for (const table of ['quiz_attempt_answers', 'quiz_attempts', 'quiz_questions', 'quizzes', 'chat_messages', 'chat_conversations', 'user_sessions', 'user_profiles', 'email_verification_tokens']) {
    const col = table === 'quiz_questions' || table === 'quiz_attempt_answers' || table === 'chat_messages' ? null : 'user_id';
    // eslint-disable-next-line no-await-in-loop
    if (col) await db.query(`DELETE FROM ${table} WHERE ${col} IN (?)`, [ids]).catch(() => {});
  }
  await db.query('DELETE FROM users WHERE id IN (?)', [ids]).catch(() => {});
}

test('registration reuses email/student number from a soft-deleted account', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }
  stubEmailSuccess();

  t.after(async () => {
    restoreEmail();
    await purgeById(allCreatedUserIds);
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('A. a VERIFIED, ACTIVE duplicate email is still rejected with 409 (unchanged)', async () => {
    const email = nextEmail();
    const created = await registerTracked({ ...BASE_PAYLOAD, email });
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [created.user.id]);

    await assert.rejects(
      () => registerTracked({ ...BASE_PAYLOAD, email }),
      (err) => err.statusCode === 409
    );
  });

  await t.test('B/J. an UNVERIFIED, ACTIVE duplicate email still uses the pending-recovery path, no duplicate row (unchanged)', async () => {
    const email = nextEmail();
    const first = await registerTracked({ ...BASE_PAYLOAD, email });
    const retry = await registerTracked({ ...BASE_PAYLOAD, email });

    assert.equal(retry.alreadyPending, true);
    assert.equal(retry.user.id, first.user.id);
    const rows = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    assert.equal(rows.length, 1);
  });

  await t.test('C/I. Admin delete, then re-registering with the SAME email succeeds with a NEW user id; the old row stays deleted', async () => {
    const email = nextEmail();
    const created = await registerTracked({ ...BASE_PAYLOAD, email });
    const oldUserId = created.user.id;

    await adminService.deleteUser(ADMIN_ID_PLACEHOLDER, oldUserId);
    const deletedRow = (await db.query('SELECT id, email, student_number, deleted_at, is_active FROM users WHERE id = ?', [oldUserId]))[0];
    assert.ok(deletedRow.deleted_at, 'old row is soft-deleted');
    assert.equal(deletedRow.is_active, 0);
    assert.notEqual(deletedRow.email, email, "old row's email was tombstoned, no longer the original address");
    assert.match(deletedRow.email, /@deleted\.aila\.invalid$/);

    const reRegistered = await registerTracked({ ...BASE_PAYLOAD, email, first_name: 'BrandNew' });
    assert.equal(reRegistered.accountCreated, true);
    assert.notEqual(reRegistered.alreadyPending, true, 'a genuinely new account, not a "pending retry" of the deleted one');
    assert.notEqual(reRegistered.user.id, oldUserId, 'new account gets a NEW user id');
    assert.equal(reRegistered.user.email, email, 'the new account owns the original email now');

    // Old row is untouched otherwise — still deleted, still has its own id,
    // never reactivated by the new registration.
    const oldRowAfter = (await db.query('SELECT deleted_at, is_active FROM users WHERE id = ?', [oldUserId]))[0];
    assert.ok(oldRowAfter.deleted_at);
    assert.equal(oldRowAfter.is_active, 0);
  });

  await t.test('D. Admin delete, then re-registering with the SAME student number succeeds', async () => {
    const studentNumber = nextStudentNumber();
    const created = await registerTracked({ ...BASE_PAYLOAD, email: nextEmail(), student_number: studentNumber });
    await adminService.deleteUser(ADMIN_ID_PLACEHOLDER, created.user.id);

    const reRegistered = await registerTracked({ ...BASE_PAYLOAD, email: nextEmail(), student_number: studentNumber });
    assert.equal(reRegistered.accountCreated, true);
    assert.equal(reRegistered.user.student_number, studentNumber);
    assert.notEqual(reRegistered.user.id, created.user.id);

    const oldRow = (await db.query('SELECT student_number FROM users WHERE id = ?', [created.user.id]))[0];
    assert.notEqual(oldRow.student_number, studentNumber, "old row's student number was tombstoned");
  });

  await t.test('E. a deleted account matching BOTH email and student number: only ONE new account is created', async () => {
    const email = nextEmail();
    const studentNumber = nextStudentNumber();
    const created = await registerTracked({ ...BASE_PAYLOAD, email, student_number: studentNumber });
    await adminService.deleteUser(ADMIN_ID_PLACEHOLDER, created.user.id);

    const reRegistered = await registerTracked({ ...BASE_PAYLOAD, email, student_number: studentNumber });
    assert.equal(reRegistered.user.email, email);
    assert.equal(reRegistered.user.student_number, studentNumber);
    assert.notEqual(reRegistered.user.id, created.user.id, 'a genuinely new row, not the old one resurrected');

    // Exactly one row now owns the (real) identity — the old row's matching
    // fields were tombstoned away by the SAME release step that handled both
    // collisions (email + student number) in one pass, not two separate
    // partial releases that could have left something dangling.
    const liveOwners = await db.query('SELECT id FROM users WHERE email = ? OR student_number = ?', [email, studentNumber]);
    assert.deepEqual(liveOwners.map((r) => r.id), [reRegistered.user.id]);

    // The old row still exists (soft-deleted, both fields tombstoned) —
    // total rows tied to this scenario is 2, just not findable by the
    // original identity anymore.
    const totalRows = await db.query('SELECT id FROM users WHERE id IN (?, ?)', [created.user.id, reRegistered.user.id]);
    assert.equal(totalRows.length, 2);
  });

  await t.test('F. the new account inherits NO historical data from the deleted account', async () => {
    const email = nextEmail();
    const created = await registerTracked({ ...BASE_PAYLOAD, email });
    const oldUserId = created.user.id;
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [oldUserId]);

    // Give the old (soon-to-be-deleted) account some real historical rows.
    await db.query(
      "INSERT INTO chat_conversations (user_id, title) VALUES (?, 'old convo')",
      [oldUserId]
    );
    const oldConvo = (await db.query('SELECT id FROM chat_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1', [oldUserId]))[0];
    await db.query(
      "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, 'old quiz', 'multiple_choice', 'medium', 1)",
      [oldUserId]
    );
    const oldQuiz = (await db.query('SELECT id FROM quizzes WHERE user_id = ? ORDER BY id DESC LIMIT 1', [oldUserId]))[0];
    await db.query('UPDATE user_profiles SET xp_points = 500, level = 5 WHERE user_id = ?', [oldUserId]);

    await adminService.deleteUser(ADMIN_ID_PLACEHOLDER, oldUserId);
    const reRegistered = await registerTracked({ ...BASE_PAYLOAD, email, first_name: 'Fresh' });
    const newUserId = reRegistered.user.id;

    // The new account has its own fresh, zeroed profile.
    const newProfile = (await db.query('SELECT xp_points, level FROM user_profiles WHERE user_id = ?', [newUserId]))[0];
    assert.equal(Number(newProfile.xp_points), 0);
    assert.equal(Number(newProfile.level), 1);

    // The old historical rows still point at the OLD id, never the new one.
    const convoOwner = (await db.query('SELECT user_id FROM chat_conversations WHERE id = ?', [oldConvo.id]))[0];
    assert.equal(convoOwner.user_id, oldUserId);
    const quizOwner = (await db.query('SELECT user_id FROM quizzes WHERE id = ?', [oldQuiz.id]))[0];
    assert.equal(quizOwner.user_id, oldUserId);

    // The new account owns NO chats/quizzes at all yet.
    const newConvoCount = await db.query('SELECT COUNT(*) c FROM chat_conversations WHERE user_id = ?', [newUserId]);
    assert.equal(Number(newConvoCount[0].c), 0);
    const newQuizCount = await db.query('SELECT COUNT(*) c FROM quizzes WHERE user_id = ?', [newUserId]);
    assert.equal(Number(newQuizCount[0].c), 0);

    t.after(async () => {
      await db.query('DELETE FROM chat_conversations WHERE id = ?', [oldConvo.id]).catch(() => {});
      await db.query('DELETE FROM quizzes WHERE id = ?', [oldQuiz.id]).catch(() => {});
    });
  });

  await t.test('G. concurrent registration attempts for the same freed email cannot create two accounts', async () => {
    const email = nextEmail();
    const created = await registerTracked({ ...BASE_PAYLOAD, email });
    await adminService.deleteUser(ADMIN_ID_PLACEHOLDER, created.user.id);

    const results = await Promise.allSettled([
      registerTracked({ ...BASE_PAYLOAD, email }),
      registerTracked({ ...BASE_PAYLOAD, email }),
    ]);

    const rows = await db.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    assert.equal(rows.length, 1, 'exactly one active account, regardless of how the race resolved');
    // Both should resolve one way or another (either both succeed as
    // create-then-pending-retry, or one 409s) — the DB invariant above is
    // what actually matters; this just confirms neither path threw an
    // unexpected 500.
    for (const r of results) {
      if (r.status === 'rejected') {
        assert.equal(r.reason.statusCode, 409);
      }
    }
  });

  await t.test('H. tombstoning many deleted accounts never collides with the UNIQUE constraints', async () => {
    const created = [];
    for (let i = 0; i < 15; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      created.push(await registerTracked({ ...BASE_PAYLOAD, email: nextEmail(), student_number: nextStudentNumber() }));
    }
    for (const c of created) {
      // eslint-disable-next-line no-await-in-loop
      await adminService.deleteUser(ADMIN_ID_PLACEHOLDER, c.user.id);
    }

    const rows = await db.query(
      'SELECT email, student_number FROM users WHERE id IN (?)',
      [created.map((c) => c.user.id)]
    );
    const emails = rows.map((r) => r.email);
    const numbers = rows.map((r) => r.student_number);
    assert.equal(new Set(emails).size, emails.length, 'every tombstoned email is unique');
    assert.equal(new Set(numbers).size, numbers.length, 'every tombstoned student number is unique');
  });

  await t.test('an already-soft-deleted row from BEFORE this fix (no tombstone) is still released correctly at registration time', async () => {
    // Simulate a pre-fix deleted row: soft-deleted the OLD way, email/number
    // left exactly as they were (this is what real production rows deleted
    // before this fix look like).
    const email = nextEmail();
    const studentNumber = nextStudentNumber();
    const created = await registerTracked({ ...BASE_PAYLOAD, email, student_number: studentNumber });
    await db.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?', [created.user.id]);

    const staleRow = (await db.query('SELECT email, student_number FROM users WHERE id = ?', [created.user.id]))[0];
    assert.equal(staleRow.email, email, 'precondition: old row still holds the original email, unlike a post-fix delete');

    const reRegistered = await registerTracked({ ...BASE_PAYLOAD, email, student_number: studentNumber });
    assert.equal(reRegistered.accountCreated, true);
    assert.notEqual(reRegistered.user.id, created.user.id);
    assert.equal(reRegistered.user.email, email);
    assert.equal(reRegistered.user.student_number, studentNumber);

    const oldRowAfter = (await db.query('SELECT email, student_number, deleted_at FROM users WHERE id = ?', [created.user.id]))[0];
    assert.notEqual(oldRowAfter.email, email);
    assert.notEqual(oldRowAfter.student_number, studentNumber);
    assert.ok(oldRowAfter.deleted_at, 'still deleted — never reactivated');
  });
});
