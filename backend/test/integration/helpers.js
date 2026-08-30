'use strict';
/*
 * Shared helpers for API integration tests.
 *
 * These tests exercise the real HTTP surface against a locally running backend
 * (`npm run dev`) and the local development database. They create their own
 * throwaway fixtures (users tagged `qa.itest.`) and delete them afterwards.
 * They never touch a production database.
 *
 * If the backend is not reachable the suites skip themselves.
 */
const path = require('path');

const BASE_URL = process.env.AILA_TEST_BASE_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.AILA_TEST_ADMIN_EMAIL || 'admin@aila.local';
const ADMIN_PASSWORD = process.env.AILA_TEST_ADMIN_PASSWORD || 'admin123';

// Load the app's own DB pool (reads backend/.env — local dev config).
require(path.join(__dirname, '../../node_modules/dotenv')).config({
  path: path.join(__dirname, '../../.env'),
  quiet: true,
});
const db = require('../../src/config/database');

async function serverReachable() {
  try {
    const res = await fetch(BASE_URL.replace(/\/api$/, '/health'), { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function api(method, endpoint, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function loginAdmin() {
  const res = await api('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (res.status !== 200) throw new Error(`admin login failed (${res.status}) — is the local DB seeded?`);
  return res.json.data.token;
}

async function createStudent(tag, suffix) {
  const email = `${tag}.${suffix}@example.com`;
  const password = 'ItestPassw0rd!';
  // student_number column is limited to 30 chars by the register validator
  const studentNumber = `IT-${Math.random().toString(36).slice(2, 10)}-${suffix}`.slice(0, 30);
  const reg = await api('POST', '/auth/register', {
    body: { first_name: 'ITest', last_name: suffix, email, password, student_number: studentNumber },
  });
  if (reg.status !== 201) throw new Error(`register ${suffix} failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  const login = await api('POST', '/auth/login', { body: { email, password } });
  return { id: reg.json.data.user.id, email, token: login.json.data.token };
}

async function purgeByTag(tag) {
  const users = await db.query('SELECT id FROM users WHERE email LIKE ?', [`${tag}%`]);
  for (const { id } of users) {
    for (const t of [
      'quiz_attempt_answers', 'quiz_attempts', 'quiz_questions', 'quizzes',
      'chat_messages', 'chat_conversations',
      'resource_views_log', 'resource_subjects', 'resources',
      'study_tasks', 'task_status_log',
      'notification_recipients', 'dashboard_activity_log', 'learning_streaks',
      'lesson_progress', 'learning_progress', 'user_sessions', 'feedback', 'user_profiles',
    ]) {
      const col = t === 'resources' ? 'uploaded_by' : (t === 'quiz_questions' || t === 'quiz_attempt_answers' || t === 'chat_messages' || t === 'resource_views_log' || t === 'resource_subjects' || t === 'task_status_log') ? null : 'user_id';
      if (col) await db.query(`DELETE FROM ${t} WHERE ${col} = ?`, [id]).catch(() => {});
    }
  }
  await db.query('DELETE FROM resources WHERE title LIKE ?', [`${tag}%`]).catch(() => {});
  await db.query('DELETE FROM quizzes WHERE topic LIKE ?', [`${tag}%`]).catch(() => {});
  await db.query('DELETE FROM chat_conversations WHERE title LIKE ?', [`${tag}%`]).catch(() => {});
  await db.query('DELETE FROM notifications WHERE title LIKE ?', [`${tag}%`]).catch(() => {});
  await db.query('DELETE FROM study_tasks WHERE title LIKE ?', [`${tag}%`]).catch(() => {});
  await db.query('DELETE FROM users WHERE email LIKE ?', [`${tag}%`]).catch(() => {});
}

function containsSecret(value) {
  const s = JSON.stringify(value || {});
  if (/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/.test(s)) return 'bcrypt-hash';
  for (const needle of ['password_hash', 'JWT_SECRET', 'R2_SECRET_ACCESS_KEY', 'GEMINI_API_KEY', 'DB_PASSWORD']) {
    if (s.includes(needle)) return needle;
  }
  return null;
}

module.exports = { BASE_URL, db, api, serverReachable, loginAdmin, createStudent, purgeByTag, containsSecret };
