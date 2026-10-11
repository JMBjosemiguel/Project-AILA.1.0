'use strict';
/*
 * Local-only mock data for demos: ~150 synthetic BS Nursing students with
 * courses, quizzes, XP, streaks, achievements, feedback and chat history that
 * looks real and stays internally consistent with how AILA itself computes
 * XP, levels, streaks and mastery (same formulas/thresholds the app's own
 * services use — see the comments next to each generator below).
 *
 * Deterministic: a fixed RNG seed means every `mock:seed` run produces the
 * same data, so results are easy to re-check.
 *
 * Tagged for precise removal: every mock user's email is mock.NNN@mock.aila.local,
 * and every mock course additionally carries a `code` starting with "MOCK-"
 * (subjects.code is otherwise unused/optional). `mock:remove` deletes by that
 * email pattern and nothing else; `mock:seed` removes any earlier mock data
 * first, so it is safe to re-run.
 *
 * NEVER run against production — see assertSafeToRun() below. There is no
 * override flag on purpose.
 *
 * Usage (from backend/): npm run mock:seed | npm run mock:remove
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { pool, transaction } = require('../src/config/database');
const achievementService = require('../src/services/achievementService');
const { appDateStr } = require('../src/utils/appTime');

// ---------------------------------------------------------------------------
// Safety — refuses to run anywhere that isn't an obviously-local dev DB.
// ---------------------------------------------------------------------------
function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function assertSafeToRun() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run: NODE_ENV=production.');
  }
  const host = String(process.env.DB_HOST || '').toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: DB_HOST="${process.env.DB_HOST || ''}" is not localhost/127.0.0.1.`);
  }
  if (isTruthy(process.env.DB_SSL)) {
    throw new Error('Refusing to run: DB_SSL is enabled — this looks like a remote/managed database, not local dev.');
  }
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — no dependency, fixed seed.
// ---------------------------------------------------------------------------
const SEED = 1337420;
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(SEED);
function randInt(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function choice(arr) { return arr[Math.floor(rng() * arr.length)]; }
function weightedChoice(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of pairs) { r -= weight; if (r <= 0) return value; }
  return pairs[pairs.length - 1][0];
}
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const MOCK_EMAIL_LIKE = 'mock.%@mock.aila.local';
const STUDENT_COUNT = 150;

// ---------------------------------------------------------------------------
// Names — realistic Filipino first/last names for BS Nursing students.
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  'Maria', 'Jose', 'Juan', 'Angelica', 'Mark', 'Jasmine', 'John Paul', 'Kristine', 'Michael', 'Andrea',
  'Christian', 'Mary Grace', 'Joshua', 'Angel', 'Daniel', 'Precious', 'Paulo', 'Nicole', 'Francis', 'Erica',
  'Rafael', 'Cristina', 'Gabriel', 'Camille', 'Vincent', 'Jennifer', 'Carlos', 'Patricia', 'Miguel', 'Danica',
  'Ronnel', 'Czarina', 'Dennis', 'Shaina', 'Allan', 'Rochelle', 'Jerome', 'Kimberly', 'Russel', 'Angelique',
  'Benjie', 'Mariel', 'Edward', 'Charmaine', 'Arvin', 'Jenny', 'Reymart', 'Loraine', 'Vhon', 'Gretchen',
];
const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Garcia', 'Dela Cruz', 'Mendoza', 'Bautista', 'Ramos', 'Gonzales', 'Torres',
  'Flores', 'Castillo', 'Villanueva', 'Fernandez', 'Aquino', 'Pascual', 'Rivera', 'Salazar', 'Navarro', 'Santiago',
  'Castro', 'Marquez', 'Soriano', 'Domingo', 'Valdez', 'del Rosario', 'Ocampo', 'Manalo', 'Bernardo', 'Agustin',
];

// ---------------------------------------------------------------------------
// Course templates — 6 BS Nursing courses. Topic titles deliberately overlap
// ACROSS templates (same cluster of concepts, worded differently) so the
// admin "AI topic groups" regrouping has real near-duplicates to merge.
// ---------------------------------------------------------------------------
const TEMPLATES = [
  {
    name: 'Maternal and Newborn Nursing',
    modules: [
      { title: 'Antenatal Care', topics: [
        { title: 'Prenatal Nutrition Essentials', lessons: ['Macronutrients in Pregnancy', 'Micronutrient Supplementation'] },
        { title: 'Infant Measurements Guide', lessons: ['Head Circumference and Length', 'Ponderal Index Basics'] },
      ] },
      { title: 'Postpartum and Newborn Care', topics: [
        { title: 'Newborn Weight and Length', lessons: ['Expected Weight Loss Patterns', 'Growth Chart Plotting'] },
        { title: 'Breastfeeding Fundamentals', lessons: ['Latch and Positioning', 'Common Breastfeeding Problems'] },
      ] },
    ],
  },
  {
    name: 'Pediatric Nursing Care',
    modules: [
      { title: 'Growth and Development', topics: [
        { title: 'Infant Growth Milestones', lessons: ['Gross Motor Milestones', 'Fine Motor Milestones'] },
        { title: 'Toddler Developmental Screening', lessons: ['Denver II Overview', 'Red Flags in Development'] },
      ] },
      { title: 'Common Pediatric Conditions', topics: [
        { title: 'Pediatric Fever Management', lessons: ['Antipyretic Dosing', 'When to Refer'] },
        { title: 'Childhood Immunization Schedule', lessons: ['Routine Vaccine Timeline', 'Catch-Up Immunization'] },
      ] },
    ],
  },
  {
    name: 'Pharmacology and Medication Safety',
    modules: [
      { title: 'Dosage Calculation', topics: [
        { title: 'Medication Dosage Calculation', lessons: ['Basic Dosage Formulas', 'Pediatric Weight-Based Dosing'] },
        { title: 'Calculating IV Drip Rates', lessons: ['Drop Factor and Flow Rate', 'Infusion Pump Settings'] },
      ] },
      { title: 'Drug Classifications', topics: [
        { title: 'Antibiotic Classes Overview', lessons: ['Beta-Lactams and Resistance', 'Nursing Considerations for Antibiotics'] },
        { title: 'Cardiovascular Medications', lessons: ['Antihypertensives Overview', 'Anticoagulant Monitoring'] },
      ] },
    ],
  },
  {
    name: 'Fundamentals of Nursing Practice',
    modules: [
      { title: 'Vital Signs and Assessment', topics: [
        { title: 'Vital Signs Measurement Techniques', lessons: ['Blood Pressure Technique', 'Temperature Measurement Sites'] },
        { title: 'Calculating IV Drip Rates', lessons: ['Manual Flow Rate Calculation', 'Troubleshooting Infusion Rates'] },
      ] },
      { title: 'Infection Control', topics: [
        { title: 'Hand Hygiene Protocols', lessons: ['WHO 5 Moments', 'Alcohol-Based Rub Technique'] },
        { title: 'Standard Precautions Basics', lessons: ['PPE Selection', 'Sharps Safety'] },
      ] },
    ],
  },
  {
    name: 'Community Health Nursing',
    modules: [
      { title: 'Health Promotion', topics: [
        { title: 'Health Education Strategies', lessons: ['Teaching Methods for Patients', 'Health Literacy Basics'] },
        { title: 'Nutrition Across the Lifespan', lessons: ['Nutrition in Older Adults', 'Nutrition in School-Age Children'] },
      ] },
      { title: 'Epidemiology Basics', topics: [
        { title: 'Disease Surveillance Methods', lessons: ['Case Definition Basics', 'Outbreak Investigation Steps'] },
        { title: 'Vital Statistics Interpretation', lessons: ['Mortality and Morbidity Rates', 'Reading Epidemiological Data'] },
      ] },
    ],
  },
  {
    name: 'Medical-Surgical Nursing',
    modules: [
      { title: 'Perioperative Care', topics: [
        { title: 'Preoperative Patient Preparation', lessons: ['Informed Consent Basics', 'Preop Checklist Essentials'] },
        { title: 'Postoperative Monitoring', lessons: ['Pain Assessment Tools', 'Wound Healing Stages'] },
      ] },
      { title: 'Chronic Disease Management', topics: [
        { title: 'Diabetes Management Essentials', lessons: ['Insulin Administration Basics', 'Blood Glucose Monitoring'] },
        { title: 'Chronic Kidney Disease Care', lessons: ['Dialysis Overview', 'Fluid Restriction Management'] },
      ] },
    ],
  },
];

function sampleLessonContent(lessonTitle, topicTitle) {
  return [
    '_[Sample content — generated for demo/testing data, not real course material.]_',
    '',
    `## ${lessonTitle}`,
    '',
    `This lesson is part of **${topicTitle}**. It introduces the key ideas a BS Nursing student is expected to`,
    'recognize for this topic, with a short summary, one worked example, and a quick recap — enough to drive',
    'realistic-looking progress and quiz data without claiming to be a complete, clinically-reviewed lesson.',
    '',
    `### Key points`,
    `- What "${lessonTitle}" covers and why it matters in practice.`,
    '- A common pitfall students run into with this topic.',
    '- One quick way to check your own understanding before moving on.',
  ].join('\n');
}

const QUIZ_DISTRACTORS = [
  'An unrelated administrative procedure',
  'A documentation requirement with no clinical bearing here',
  'A billing or insurance consideration',
  'A facilities/equipment maintenance task',
];

function makeQuizQuestion(topicTitle, index) {
  const correct = `The core concept behind "${topicTitle}"`;
  const options = shuffle([correct, ...shuffle(QUIZ_DISTRACTORS).slice(0, 3)]);
  return {
    question: `Question ${index + 1}: Which of the following best relates to "${topicTitle}"?`,
    options,
    correct_answer: correct,
    explanation: `This question checks recall of the "${topicTitle}" content area.`,
  };
}

// ---------------------------------------------------------------------------
// XP formulas — mirrored exactly from backend/src/utils/gamification.js and
// backend/src/services/{learningService,plannerService,quizService}.js so
// user_profiles.xp_points / level stay consistent with the xp_events ledger,
// the same way awardXpOnce keeps them consistent for real student activity.
// ---------------------------------------------------------------------------
const XP_PER_LEVEL = 100;
const LESSON_COMPLETE_XP = 10;
const QUIZ_XP_MAX = 20;
const CHECKPOINT_PASS_XP = 30;
const FINAL_PASS_XP = 100;
function levelForXp(xp) { return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1; }

// ---------------------------------------------------------------------------
// Student activity profiles. "inactive" guarantees a stale last_active_date
// (7+ days) and "struggling" guarantees a weak recent quiz average (<60%) —
// together these are exactly the two signals the admin dashboard's
// "students who may need help" card looks for (see adminModel.getStudentsNeedingHelp).
// ---------------------------------------------------------------------------
const PROFILES = [
  ['strong', 30],
  ['average', 68],
  ['struggling', 30],
  ['inactive', 22],
];

// "days ago" (0-30) this student was active, per profile. 30 days covers both
// the "streaks/activity over the last 30 days" and "XP over the last 8 weeks"
// requirements (30 <= 56), so one window serves both.
function activeDaysAgoForProfile(profile) {
  const days = new Set();
  if (profile === 'inactive') {
    const start = randInt(8, 20);
    const runLen = randInt(1, 4);
    for (let i = 0; i < runLen; i += 1) days.add(Math.min(30, start + i));
    const extra = randInt(0, 3);
    for (let i = 0; i < extra; i += 1) days.add(randInt(start, 29));
  } else if (profile === 'struggling') {
    const runLen = randInt(2, 6);
    const start = randInt(0, 3);
    for (let i = 0; i < runLen; i += 1) days.add(start + i);
    const extra = randInt(2, 8);
    for (let i = 0; i < extra; i += 1) days.add(randInt(0, 30));
  } else if (profile === 'average') {
    const runLen = randInt(3, 10);
    const start = randInt(0, 5);
    for (let i = 0; i < runLen; i += 1) days.add(start + i);
    const extra = randInt(3, 12);
    for (let i = 0; i < extra; i += 1) days.add(randInt(0, 30));
  } else {
    const runLen = randInt(7, 21);
    for (let i = 0; i < runLen; i += 1) days.add(i);
    const extra = randInt(5, 15);
    for (let i = 0; i < extra; i += 1) days.add(randInt(0, 30));
  }
  return [...days].filter((d) => d >= 0 && d <= 30).sort((a, b) => a - b);
}

function dateFromDaysAgo(daysAgo) {
  const d = new Date();
  d.setHours(randInt(7, 21), randInt(0, 59), randInt(0, 59), 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

// Mirrors the day-to-day advance rule in utils/gamification.js's touchStreak:
// consecutive calendar day -> run continues, gap -> run resets to 1. Computes
// what current_streak/longest_streak would be if touchStreak had actually
// been called on each of these dates, in order.
function computeStreak(activityDates) {
  const days = [...new Set(activityDates.map((d) => appDateStr(d)))].sort();
  if (!days.length) return { current: 0, longest: 0, lastActiveDate: null };
  let longest = 1;
  let runEndingAtLast = 1;
  for (let i = 1; i < days.length; i += 1) {
    const diff = Math.round((new Date(`${days[i]}T00:00:00Z`) - new Date(`${days[i - 1]}T00:00:00Z`)) / 86400000);
    runEndingAtLast = diff === 1 ? runEndingAtLast + 1 : 1;
    longest = Math.max(longest, runEndingAtLast);
  }
  return { current: runEndingAtLast, longest, lastActiveDate: days[days.length - 1] };
}

function scoreRangeForProfile(profile) {
  switch (profile) {
    case 'strong': return [75, 100];
    case 'struggling': return [25, 55];
    case 'inactive': return [40, 85];
    default: return [55, 90];
  }
}

function completionFractionForProfile(profile) {
  switch (profile) {
    case 'strong': return [0.7, 1];
    case 'struggling': return [0.1, 0.45];
    case 'inactive': return [0.05, 0.35];
    default: return [0.3, 0.75];
  }
}

// ---------------------------------------------------------------------------
// Bulk insert helper — one multi-row INSERT per chunk. MySQL/MariaDB assigns
// contiguous AUTO_INCREMENT ids to a single multi-row INSERT, so
// `result.insertId + i` is safe here: this script is the only writer, there
// are no concurrent inserts into these tables while it runs.
// ---------------------------------------------------------------------------
async function bulkInsert(connection, table, columns, rows, chunkSize = 500) {
  if (!rows.length) return [];
  const ids = [];
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const params = chunk.flatMap((row) => columns.map((c) => row[c] ?? null));
    const [result] = await connection.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
      params
    );
    for (let i = 0; i < chunk.length; i += 1) ids.push(result.insertId + i);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// remove() — delete everything mock:seed created, in FK-safe order. Mock
// students are never admins and never perform admin actions, so nothing
// should reference them via admin_audit_log.admin_id (ON DELETE RESTRICT) —
// checked explicitly below rather than assumed.
// ---------------------------------------------------------------------------
async function removeMockData({ quiet = false } = {}) {
  assertSafeToRun();
  const log = quiet ? () => {} : (...args) => console.log(...args);

  const mockUsers = await pool.query('SELECT id FROM users WHERE email LIKE ?', [MOCK_EMAIL_LIKE]).then(([r]) => r);
  const userIds = mockUsers.map((u) => u.id);
  if (!userIds.length) {
    log('No mock data found — nothing to remove.');
    return { usersRemoved: 0 };
  }

  const stuckAudit = await pool.query(
    `SELECT COUNT(*) AS c FROM admin_audit_log WHERE admin_id IN (${userIds.map(() => '?').join(',')})`,
    userIds
  ).then(([r]) => r[0].c);
  if (stuckAudit > 0) {
    throw new Error(
      `Refusing to remove: ${stuckAudit} admin_audit_log row(s) reference a mock user as admin_id. ` +
      'Mock students should never be promoted to admin or perform admin actions — investigate before removing.'
    );
  }

  await transaction(async (connection) => {
    const placeholders = userIds.map(() => '?').join(',');

    // Course tree first (modules/topics/lessons are ON DELETE RESTRICT from
    // their parent, so they must go before subjects; subjects themselves are
    // ON DELETE CASCADE from users, but that cascade would hit the RESTRICT
    // on modules if it ran first).
    const subjectIds = await connection.query(
      `SELECT id FROM subjects WHERE created_by IN (${placeholders})`, userIds
    ).then(([r]) => r.map((s) => s.id));

    if (subjectIds.length) {
      const sPlaceholders = subjectIds.map(() => '?').join(',');
      await connection.query(
        `DELETE lp FROM learning_progress lp
         INNER JOIN topics t ON t.id = lp.topic_id
         INNER JOIN modules m ON m.id = t.module_id
         WHERE m.subject_id IN (${sPlaceholders})`,
        subjectIds
      );
      await connection.query(
        `DELETE lpr FROM lesson_progress lpr
         INNER JOIN lessons l ON l.id = lpr.lesson_id
         INNER JOIN topics t ON t.id = l.topic_id
         INNER JOIN modules m ON m.id = t.module_id
         WHERE m.subject_id IN (${sPlaceholders})`,
        subjectIds
      );
      await connection.query(
        `DELETE l FROM lessons l
         INNER JOIN topics t ON t.id = l.topic_id
         INNER JOIN modules m ON m.id = t.module_id
         WHERE m.subject_id IN (${sPlaceholders})`,
        subjectIds
      );
      await connection.query(
        `DELETE t FROM topics t INNER JOIN modules m ON m.id = t.module_id WHERE m.subject_id IN (${sPlaceholders})`,
        subjectIds
      );
      await connection.query(`DELETE FROM modules WHERE subject_id IN (${sPlaceholders})`, subjectIds);
      await connection.query(`DELETE FROM subjects WHERE id IN (${sPlaceholders})`, subjectIds);
    }

    // Everything else hangs off users with a plain ON DELETE CASCADE
    // (user_profiles, xp_events, learning_streaks, dashboard_activity_log,
    // quizzes -> quiz_questions/quiz_attempts -> quiz_attempt_answers,
    // chat_conversations -> chat_messages, feedback, user_achievements,
    // notification_recipients, ...) — deleting the user is enough.
    await connection.query(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
  });

  log(`Removed ${userIds.length} mock users and everything that hung off them.`);
  return { usersRemoved: userIds.length };
}

// ---------------------------------------------------------------------------
// seed()
// ---------------------------------------------------------------------------
async function seedMockData() {
  assertSafeToRun();

  console.log('Removing any earlier mock data first (so this script is safe to re-run)...');
  await removeMockData({ quiet: true });

  const roleRow = await pool.query("SELECT id FROM roles WHERE name = 'student' LIMIT 1").then(([r]) => r[0]);
  if (!roleRow) throw new Error('No "student" role found — is the database seeded (database/seed.sql)?');
  const studentRoleId = roleRow.id;

  const bcrypt = require('bcrypt');
  const crypto = require('crypto');
  // One shared, genuinely-random, never-displayed password hash for every
  // mock account — "unusable" just means nobody knows the password; nobody
  // needs a DISTINCT one since these accounts are never meant to log in.
  const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  const students = Array.from({ length: STUDENT_COUNT }, (_v, i) => {
    const n = i + 1;
    const profile = weightedChoice(PROFILES);
    const yearLevel = weightedChoice([[1, 15], [2, 55], [3, 20], [4, 10]]);
    return {
      n,
      email: `mock.${String(n).padStart(3, '0')}@mock.aila.local`,
      studentNumber: `MOCK-${String(n).padStart(3, '0')}`,
      firstName: choice(FIRST_NAMES),
      lastName: choice(LAST_NAMES),
      yearLevel,
      leaderboardOptIn: rng() < 0.7 ? 1 : 0,
      profile,
      activeDaysAgo: activeDaysAgoForProfile(profile),
    };
  });

  const summary = {
    students: 0, subjects: 0, modules: 0, topics: 0, lessons: 0,
    lessonProgress: 0, learningProgress: 0, quizzes: 0, quizQuestions: 0, quizAttempts: 0,
    xpEvents: 0, activityLog: 0, feedback: 0, chatConversations: 0, chatMessages: 0, achievementsGranted: 0,
  };

  let userIds = [];

  await transaction(async (connection) => {
    // ---- users + user_profiles -------------------------------------------------
    userIds = await bulkInsert(connection, 'users',
      ['role_id', 'student_number', 'email', 'password_hash', 'first_name', 'last_name', 'is_active', 'email_verified_at'],
      students.map((s) => ({
        role_id: studentRoleId, student_number: s.studentNumber, email: s.email, password_hash: unusablePasswordHash,
        first_name: s.firstName, last_name: s.lastName, is_active: 1, email_verified_at: new Date(),
      })));
    students.forEach((s, i) => { s.id = userIds[i]; });
    summary.students = userIds.length;

    await bulkInsert(connection, 'user_profiles',
      ['user_id', 'program', 'year_level', 'xp_points', 'level', 'leaderboard_opt_in'],
      students.map((s) => ({
        user_id: s.id, program: 'BS Nursing', year_level: s.yearLevel, xp_points: 0, level: 1,
        leaderboard_opt_in: s.leaderboardOptIn,
      })));

    // ---- course tree: each student gets 1-3 course enrollments -----------------
    const enrollments = []; // { student, templateIndex, subjectRow index (filled after insert) }
    for (const s of students) {
      const courseCount = weightedChoice([[1, 25], [2, 50], [3, 25]]);
      const templateIdxs = shuffle(TEMPLATES.map((_t, i) => i)).slice(0, courseCount);
      for (const templateIdx of templateIdxs) enrollments.push({ student: s, templateIdx });
    }

    const subjectRows = enrollments.map((e, i) => ({
      created_by: e.student.id,
      name: TEMPLATES[e.templateIdx].name,
      code: `MOCK-${e.student.n}-${e.templateIdx}-${i}`,
      difficulty: 'intermediate',
      is_ai_generated: 1,
      visibility: 'private',
    }));
    const subjectIds = await bulkInsert(connection, 'subjects',
      ['created_by', 'name', 'code', 'difficulty', 'is_ai_generated', 'visibility'], subjectRows);
    enrollments.forEach((e, i) => { e.subjectId = subjectIds[i]; });
    summary.subjects = subjectIds.length;

    const moduleRows = [];
    enrollments.forEach((e) => {
      TEMPLATES[e.templateIdx].modules.forEach((m, idx) => {
        moduleRows.push({ subject_id: e.subjectId, title: m.title, order_index: idx, _enrollment: e, _templateModuleIdx: idx });
      });
    });
    const moduleIds = await bulkInsert(connection, 'modules', ['subject_id', 'title', 'order_index'], moduleRows);
    moduleRows.forEach((m, i) => { m.id = moduleIds[i]; });
    summary.modules = moduleIds.length;

    const topicRows = [];
    moduleRows.forEach((mod) => {
      const templateTopics = TEMPLATES[mod._enrollment.templateIdx].modules[mod._templateModuleIdx].topics;
      templateTopics.forEach((t, idx) => {
        topicRows.push({ module_id: mod.id, title: t.title, order_index: idx, _module: mod, _templateTopicIdx: idx });
      });
    });
    const topicIds = await bulkInsert(connection, 'topics', ['module_id', 'title', 'order_index'], topicRows);
    topicRows.forEach((t, i) => { t.id = topicIds[i]; });
    summary.topics = topicIds.length;

    const lessonRows = [];
    topicRows.forEach((topic) => {
      const templateLessons = TEMPLATES[topic._module._enrollment.templateIdx]
        .modules[topic._module._templateModuleIdx].topics[topic._templateTopicIdx].lessons;
      templateLessons.forEach((title) => {
        lessonRows.push({
          topic_id: topic.id, title, content: sampleLessonContent(title, topic.title),
          difficulty: 'medium', estimated_minutes: 15, _topic: topic,
        });
      });
    });
    const lessonIds = await bulkInsert(connection, 'lessons',
      ['topic_id', 'title', 'content', 'difficulty', 'estimated_minutes'], lessonRows);
    lessonRows.forEach((l, i) => { l.id = lessonIds[i]; });
    summary.lessons = lessonIds.length;

    // Group lessons/topics per enrollment for progress/quiz generation.
    const lessonsByEnrollment = new Map();
    const topicsByEnrollment = new Map();
    lessonRows.forEach((l) => {
      const key = l._topic._module._enrollment;
      if (!lessonsByEnrollment.has(key)) lessonsByEnrollment.set(key, []);
      lessonsByEnrollment.get(key).push(l);
    });
    topicRows.forEach((t) => {
      const key = t._module._enrollment;
      if (!topicsByEnrollment.has(key)) topicsByEnrollment.set(key, []);
      topicsByEnrollment.get(key).push(t);
    });

    // ---- per-student activity: lesson completions, topic progress, quizzes ----
    const lessonProgressRows = [];
    const learningProgressRows = [];
    const quizRows = [];
    const quizQuestionRowsByQuizIdx = [];
    const quizAttemptRowsByQuizIdx = [];
    const xpEventRows = [];
    const activityLogRows = [];
    const studentActivityDates = new Map(); // student.id -> Date[]

    for (const s of students) {
      const activityDates = s.activeDaysAgo.map((d) => dateFromDaysAgo(d));
      studentActivityDates.set(s.id, []);
      let dateCursor = 0;
      const nextDate = () => {
        const d = activityDates[dateCursor % activityDates.length] || dateFromDaysAgo(0);
        dateCursor += 1;
        return d;
      };

      const myEnrollments = enrollments.filter((e) => e.student === s);
      const [compMin, compMax] = completionFractionForProfile(s.profile);

      for (const enr of myEnrollments) {
        const myLessons = lessonsByEnrollment.get(enr) || [];
        const myTopics = topicsByEnrollment.get(enr) || [];
        const fraction = compMin + rng() * (compMax - compMin);
        const toComplete = shuffle(myLessons).slice(0, Math.round(myLessons.length * fraction));
        const completedLessonIds = new Set();

        for (const lesson of toComplete) {
          const when = nextDate();
          studentActivityDates.get(s.id).push(when);
          lessonProgressRows.push({ user_id: s.id, lesson_id: lesson.id, completed_at: when });
          completedLessonIds.add(lesson.id);

          xpEventRows.push({
            user_id: s.id, event_key: `lesson_completed:${lesson.id}`, points: LESSON_COMPLETE_XP,
            reason: `Completed lesson "${lesson.title}"`, created_at: when,
          });
          activityLogRows.push({
            user_id: s.id, activity_type: 'lesson_completed', reference_id: lesson.id,
            description: `Completed lesson "${lesson.title}"`, created_at: when,
          });
          activityLogRows.push({
            user_id: s.id, activity_type: 'xp_earned', reference_id: LESSON_COMPLETE_XP,
            description: `+${LESSON_COMPLETE_XP} XP - Completed lesson "${lesson.title}"`, created_at: when,
          });
        }

        // learning_progress mirrors learningModel.recomputeTopicProgress's
        // own formula: percent = round(completed/total*100), status from percent.
        for (const topic of myTopics) {
          const topicLessons = myLessons.filter((l) => l._topic.id === topic.id);
          const completedInTopic = topicLessons.filter((l) => completedLessonIds.has(l.id)).length;
          if (!topicLessons.length || completedInTopic === 0) continue; // 'not_started' rows are skipped — no consumer needs them
          const percent = Math.round((completedInTopic / topicLessons.length) * 100);
          const status = percent >= 100 ? 'completed' : 'in_progress';
          learningProgressRows.push({ user_id: s.id, topic_id: topic.id, progress_percent: percent, status });
        }

        // 1-3 practice quizzes per enrollment, each on a random topic.
        const practiceCount = randInt(1, 3);
        const [scoreMin, scoreMax] = scoreRangeForProfile(s.profile);
        for (let i = 0; i < practiceCount; i += 1) {
          const topic = choice(myTopics);
          const itemCount = randInt(5, 10);
          const when = nextDate();
          studentActivityDates.get(s.id).push(when);
          const quizIdx = quizRows.length;
          quizRows.push({
            user_id: s.id, topic: topic.title, quiz_type: 'multiple_choice', difficulty: 'medium',
            source_type: 'topic', source_id: topic.id, item_count: itemCount, assessment_kind: 'practice',
            created_at: when,
          });
          quizQuestionRowsByQuizIdx[quizIdx] = Array.from({ length: itemCount }, (_v, qi) => makeQuizQuestion(topic.title, qi));
          const scorePct = Math.round(scoreMin + rng() * (scoreMax - scoreMin));
          const score = Math.round((scorePct / 100) * itemCount);
          quizAttemptRowsByQuizIdx[quizIdx] = {
            user_id: s.id, score, total: itemCount, status: 'submitted', passed: null,
            started_at: when, completed_at: when,
          };

          const xpAmount = Math.round((score / Math.max(1, itemCount)) * QUIZ_XP_MAX);
          xpEventRows.push({
            user_id: s.id, event_key: `quiz_completed:${'__QUIZ_ID__'}:${quizIdx}`, points: xpAmount,
            reason: `Completed the "${topic.title}" quiz`, created_at: when, _quizIdx: quizIdx,
          });
          activityLogRows.push({
            user_id: s.id, activity_type: 'quiz_completed', reference_id: null,
            description: `Scored ${score}/${itemCount} on "${topic.title}" quiz`, created_at: when, _quizIdx: quizIdx,
          });
          activityLogRows.push({
            user_id: s.id, activity_type: 'xp_earned', reference_id: xpAmount,
            description: `+${xpAmount} XP - Completed the "${topic.title}" quiz`, created_at: when,
          });
        }

        // Module checkpoint (module 1 only, ~50% of the time, only once that
        // module's topics have decent completion) and course final (~50% of
        // checkpoint-passers with high overall completion).
        const module1 = TEMPLATES[enr.templateIdx].modules[0];
        const module1Row = moduleRows.find((m) => m._enrollment === enr && m._templateModuleIdx === 0);
        if (fraction >= 0.4 && rng() < 0.5) {
          const when = nextDate();
          studentActivityDates.get(s.id).push(when);
          const passed = rng() < (s.profile === 'strong' ? 0.9 : s.profile === 'struggling' ? 0.3 : 0.65) ? 1 : 0;
          const scorePct = passed ? randInt(70, 100) : randInt(30, 69);
          const itemCount = 8;
          const score = Math.round((scorePct / 100) * itemCount);
          const quizIdx = quizRows.length;
          quizRows.push({
            user_id: s.id, topic: `${module1.title} Checkpoint`, quiz_type: 'multiple_choice', difficulty: 'medium',
            source_type: null, source_id: null, item_count: itemCount, subject_id: enr.subjectId, module_id: module1Row.id,
            assessment_kind: 'module_checkpoint', passing_score: 70, assessment_slot: module1Row.id, created_at: when,
          });
          quizQuestionRowsByQuizIdx[quizIdx] = Array.from({ length: itemCount }, (_v, qi) => makeQuizQuestion(module1.title, qi));
          quizAttemptRowsByQuizIdx[quizIdx] = {
            user_id: s.id, score, total: itemCount, status: 'submitted', passed,
            started_at: when, completed_at: when,
          };
          if (passed) {
            xpEventRows.push({
              user_id: s.id, event_key: `module_checkpoint_pass:${module1Row.id}`, points: CHECKPOINT_PASS_XP,
              reason: `Passed the "${module1.title}" Module Checkpoint`, created_at: when,
            });
            activityLogRows.push({
              user_id: s.id, activity_type: 'xp_earned', reference_id: CHECKPOINT_PASS_XP,
              description: `+${CHECKPOINT_PASS_XP} XP - Passed the "${module1.title}" Module Checkpoint`, created_at: when,
            });

            if (fraction >= 0.75 && rng() < 0.5) {
              const whenFinal = nextDate();
              studentActivityDates.get(s.id).push(whenFinal);
              const finalPassed = rng() < (s.profile === 'strong' ? 0.85 : 0.5) ? 1 : 0;
              const finalPct = finalPassed ? randInt(70, 100) : randInt(35, 69);
              const finalItemCount = 16;
              const finalScore = Math.round((finalPct / 100) * finalItemCount);
              const finalQuizIdx = quizRows.length;
              quizRows.push({
                user_id: s.id, topic: `${TEMPLATES[enr.templateIdx].name} Final`, quiz_type: 'multiple_choice', difficulty: 'medium',
                source_type: null, source_id: null, item_count: finalItemCount, subject_id: enr.subjectId, module_id: null,
                assessment_kind: 'course_final', passing_score: 70, assessment_slot: 0, created_at: whenFinal,
              });
              quizQuestionRowsByQuizIdx[finalQuizIdx] = Array.from({ length: finalItemCount }, (_v, qi) => makeQuizQuestion(TEMPLATES[enr.templateIdx].name, qi));
              quizAttemptRowsByQuizIdx[finalQuizIdx] = {
                user_id: s.id, score: finalScore, total: finalItemCount, status: 'submitted', passed: finalPassed,
                started_at: whenFinal, completed_at: whenFinal,
              };
              if (finalPassed) {
                xpEventRows.push({
                  user_id: s.id, event_key: `course_final_pass:${enr.subjectId}`, points: FINAL_PASS_XP,
                  reason: `Passed the "${TEMPLATES[enr.templateIdx].name}" Course Final`, created_at: whenFinal,
                });
                activityLogRows.push({
                  user_id: s.id, activity_type: 'xp_earned', reference_id: FINAL_PASS_XP,
                  description: `+${FINAL_PASS_XP} XP - Passed the "${TEMPLATES[enr.templateIdx].name}" Course Final`, created_at: whenFinal,
                });
              }
            }
          }
        }
      }
    }

    await bulkInsert(connection, 'lesson_progress', ['user_id', 'lesson_id', 'completed_at'], lessonProgressRows);
    summary.lessonProgress = lessonProgressRows.length;
    await bulkInsert(connection, 'learning_progress', ['user_id', 'topic_id', 'progress_percent', 'status'], learningProgressRows);
    summary.learningProgress = learningProgressRows.length;

    const quizIds = await bulkInsert(connection, 'quizzes',
      ['user_id', 'topic', 'quiz_type', 'difficulty', 'source_type', 'source_id', 'item_count',
        'subject_id', 'module_id', 'assessment_kind', 'passing_score', 'assessment_slot', 'created_at'],
      quizRows);
    summary.quizzes = quizIds.length;

    const quizQuestionRows = [];
    quizQuestionRowsByQuizIdx.forEach((questions, quizIdx) => {
      questions.forEach((q, orderIdx) => {
        quizQuestionRows.push({
          quiz_id: quizIds[quizIdx], question: q.question, options: JSON.stringify(q.options),
          correct_answer: q.correct_answer, explanation: q.explanation, order_index: orderIdx,
        });
      });
    });
    await bulkInsert(connection, 'quiz_questions', ['quiz_id', 'question', 'options', 'correct_answer', 'explanation', 'order_index'], quizQuestionRows);
    summary.quizQuestions = quizQuestionRows.length;

    const quizAttemptRows = quizAttemptRowsByQuizIdx.map((attempt, quizIdx) => ({ ...attempt, quiz_id: quizIds[quizIdx] }));
    await bulkInsert(connection, 'quiz_attempts',
      ['quiz_id', 'user_id', 'score', 'total', 'status', 'passed', 'started_at', 'completed_at'], quizAttemptRows);
    summary.quizAttempts = quizAttemptRows.length;

    // Resolve the placeholder quiz-completed event_keys/reference_ids now that real quiz ids exist.
    xpEventRows.forEach((row) => {
      if (row._quizIdx !== undefined) {
        row.event_key = `quiz_completed:${quizIds[row._quizIdx]}`;
        delete row._quizIdx;
      }
    });
    activityLogRows.forEach((row) => {
      if (row._quizIdx !== undefined) {
        row.reference_id = quizIds[row._quizIdx];
        delete row._quizIdx;
      }
    });

    await bulkInsert(connection, 'xp_events', ['user_id', 'event_key', 'points', 'reason', 'created_at'], xpEventRows);
    summary.xpEvents = xpEventRows.length;
    await bulkInsert(connection, 'dashboard_activity_log', ['user_id', 'activity_type', 'reference_id', 'description', 'created_at'], activityLogRows);
    summary.activityLog = activityLogRows.length;

    // ---- user_profiles.xp_points / level, computed from the ledger just inserted ----
    const xpByUser = new Map();
    xpEventRows.forEach((row) => xpByUser.set(row.user_id, (xpByUser.get(row.user_id) || 0) + row.points));
    for (const [userId, totalXp] of xpByUser.entries()) {
      await connection.query('UPDATE user_profiles SET xp_points = ?, level = ? WHERE user_id = ?', [totalXp, levelForXp(totalXp), userId]);
    }

    // ---- learning_streaks, computed from the same activity dates ----
    const streakRows = students.map((s) => {
      const { current, longest, lastActiveDate } = computeStreak(studentActivityDates.get(s.id) || []);
      return { user_id: s.id, current_streak: current, longest_streak: longest, last_active_date: lastActiveDate };
    }).filter((r) => r.last_active_date !== null);
    await bulkInsert(connection, 'learning_streaks', ['user_id', 'current_streak', 'longest_streak', 'last_active_date'], streakRows);

    // ---- ~40 feedback entries, spread over the last 60 days, mostly positive ----
    const FEEDBACK_COMMENTS = [
      'AILA explains things more clearly than our textbook.',
      'The quiz generator really helped me review before the exam.',
      'Would love more practice questions for pharmacology.',
      'The lesson reader is easy to use on my phone.',
      'Dashboard streak tracking keeps me motivated to study daily.',
      'Sometimes the AI answers are a bit too long.',
      'Great app overall, helped me pass my checkpoint quiz.',
      'Wish there were more nursing-specific case scenarios.',
      'Chat support answered my question about dosage calculation well.',
      'The leaderboard is a fun way to stay consistent.',
    ];
    const feedbackRows = Array.from({ length: 40 }, () => {
      const s = choice(students);
      const rating = weightedChoice([[5, 40], [4, 35], [3, 15], [2, 7], [1, 3]]);
      return {
        user_id: s.id, context_type: 'general', rating, comment: choice(FEEDBACK_COMMENTS),
        status: rng() < 0.4 ? 'resolved' : 'pending', created_at: dateFromDaysAgo(randInt(0, 60)),
      };
    });
    await bulkInsert(connection, 'feedback', ['user_id', 'context_type', 'rating', 'comment', 'status', 'created_at'], feedbackRows);
    summary.feedback = feedbackRows.length;

    // ---- a handful of simple chat conversations (canned text, no Gemini) ----
    const CHAT_PAIRS = [
      ['Can you explain IV drip rate calculation?', 'Sure! IV drip rate depends on the volume, drop factor, and time. Want a worked example?'],
      ['What is the newborn weight loss pattern?', 'Newborns typically lose up to 10% of birth weight in the first week, regained by 2 weeks.'],
      ['How do I study for my pharmacology checkpoint?', 'Try reviewing drug classifications first, then practice dosage calculation questions.'],
      ['What are the WHO 5 moments for hand hygiene?', 'They are: before touching a patient, before a procedure, after a procedure, after touching a patient, and after touching surroundings.'],
    ];
    const chatStudents = shuffle(students).slice(0, 25);
    const conversationRows = chatStudents.map((s) => ({
      user_id: s.id, title: 'Study question', started_at: dateFromDaysAgo(randInt(0, 30)),
    }));
    const conversationIds = await bulkInsert(connection, 'chat_conversations', ['user_id', 'title', 'started_at'], conversationRows);
    summary.chatConversations = conversationIds.length;

    const messageRows = [];
    conversationIds.forEach((conversationId, i) => {
      const [question, answer] = choice(CHAT_PAIRS);
      const startedAt = conversationRows[i].started_at;
      messageRows.push({ conversation_id: conversationId, sender: 'user', message_type: 'text', message_text: question, created_at: startedAt });
      messageRows.push({ conversation_id: conversationId, sender: 'bot', message_type: 'text', message_text: answer, created_at: new Date(startedAt.getTime() + 15000) });
    });
    await bulkInsert(connection, 'chat_messages', ['conversation_id', 'sender', 'message_type', 'message_text', 'created_at'], messageRows);
    summary.chatMessages = messageRows.length;
  });

  // ---- achievements, via the project's existing reconciliation utility ----
  // (no bonus XP, no notifications — see achievementService.reconcileUser) ----
  let achievementsGranted = 0;
  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    const slugs = await achievementService.reconcileUser(userId);
    achievementsGranted += slugs.length;
  }
  summary.achievementsGranted = achievementsGranted;

  console.log('\nMock data seeded:');
  console.table(summary);
  return summary;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
async function main() {
  const action = process.argv[2];
  if (action === 'seed') {
    await seedMockData();
  } else if (action === 'remove') {
    await removeMockData();
  } else {
    console.error('Usage: node scripts/mockData.js <seed|remove>');
    process.exitCode = 1;
    return;
  }
  await pool.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('mockData script failed:', error.message);
    process.exitCode = 1;
    pool.end().finally(() => {});
  });
}

module.exports = { seedMockData, removeMockData, assertSafeToRun };
