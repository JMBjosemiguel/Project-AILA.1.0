'use strict';
/*
 * Mock demo data: ~150 synthetic 2nd-year BS Nursing students with a static
 * nursing curriculum, backdated lesson/quiz activity, XP, streaks, feedback
 * and achievements that stay internally consistent with how AILA itself
 * computes XP, levels, streaks and mastery (same formulas/thresholds the
 * app's own services use — see the comments next to each generator below).
 *
 * Usage (from backend/):
 *   node scripts/mockData.js                 (dry-run, default — writes nothing)
 *   node scripts/mockData.js --apply
 *   node scripts/mockData.js --remove
 *   node scripts/mockData.js --apply --count=200 --leaderboard-optin=40
 *   node --env-file=.env.aiven scripts/mockData.js --apply --confirm-host=<exact DB_HOST>
 *
 * Flags:
 *   --dry-run              Default. Prints DB host/name + planned row counts. Writes nothing.
 *   --apply                Inserts everything in ONE transaction. Refuses if mock data already exists.
 *   --remove                Deletes ONLY mock data (by email domain tag), FK-safe order, ONE transaction.
 *   --count=150             How many mock students to generate (dry-run and --apply).
 *   --leaderboard-optin=N   0-100, percent of mock students with leaderboard_opt_in=1. Default 0.
 *   --confirm-host=<host>   Required to run --apply/--remove against a non-local DB_HOST — must match
 *                           DB_HOST exactly (case-insensitive). No wildcard/override shortcut on purpose.
 *
 * Deterministic: a fixed RNG seed means every run against the same --count
 * produces the same data, so results are easy to re-check.
 *
 * Tagged for precise removal: every mock student's email is
 * mock.studentNNN@mock.aila.test — `mock.aila.test` is the removal tag.
 * --remove deletes by that email domain and nothing else. --apply refuses
 * outright if any such row already exists (run --remove first).
 *
 * NEVER connects to production on its own: refuses whenever DB_HOST is not
 * localhost/127.0.0.1, unless --confirm-host repeats that exact host back —
 * a deliberate, explicit "yes, I mean it" rather than a silent override.
 *
 * NO Gemini calls, NO outbound email, NO storage/file uploads. Never touches
 * a row outside the mock_student%/@mock.aila.test tag.
 */
const path = require('path');
// Loaded with an explicit path so a bare `.env` next to this script never
// wins over whatever `node --env-file=.env.aiven ...` already placed in
// process.env — dotenv's own default behavior never overwrites a key that's
// already set, so this is also exactly what makes --env-file "just work"
// without any extra code here.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { pool, transaction } = require('../src/config/database');
const achievementService = require('../src/services/achievementService');
const { appDateStr } = require('../src/utils/appTime');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { mode: 'dry-run', count: 150, leaderboardOptIn: 0, confirmHost: null };
  for (const raw of argv) {
    if (raw === '--apply') args.mode = 'apply';
    else if (raw === '--remove') args.mode = 'remove';
    else if (raw === '--dry-run') args.mode = 'dry-run';
    else if (raw.startsWith('--count=')) args.count = Number(raw.slice('--count='.length));
    else if (raw.startsWith('--leaderboard-optin=')) args.leaderboardOptIn = Number(raw.slice('--leaderboard-optin='.length));
    else if (raw.startsWith('--confirm-host=')) args.confirmHost = raw.slice('--confirm-host='.length);
    else throw new Error(`Unrecognized argument: ${raw}`);
  }
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 2000) {
    throw new Error(`--count must be an integer between 1 and 2000 (got ${args.count}).`);
  }
  if (!Number.isInteger(args.leaderboardOptIn) || args.leaderboardOptIn < 0 || args.leaderboardOptIn > 100) {
    throw new Error(`--leaderboard-optin must be an integer between 0 and 100 (got ${args.leaderboardOptIn}).`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Safety — refuses anywhere that isn't an obviously-local dev DB, unless the
// caller explicitly confirms the exact host. No code path bypasses this.
// ---------------------------------------------------------------------------
function assertSafeToRun(args) {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run: NODE_ENV=production.');
  }
  const host = String(process.env.DB_HOST || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal) {
    if (!args.confirmHost || args.confirmHost.toLowerCase() !== host) {
      throw new Error(
        `Refusing to run: DB_HOST="${process.env.DB_HOST || ''}" is not localhost/127.0.0.1. ` +
        `Pass --confirm-host=${process.env.DB_HOST || '<host>'} to proceed.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — no dependency, fixed seed.
// ---------------------------------------------------------------------------
const SEED = 20260224;
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function weightedChoice(rng, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of pairs) { r -= weight; if (r <= 0) return value; }
  return pairs[pairs.length - 1][0];
}
function shuffle(rng, arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const MOCK_EMAIL_DOMAIN = '@mock.aila.test'; // the removal tag
const MOCK_EMAIL_LIKE = `%${MOCK_EMAIL_DOMAIN}`;
const MOCK_PROGRAM = 'Bachelor of Science in Nursing';
const MOCK_YEAR_LEVEL = 2;
const ACTIVITY_WINDOW_DAYS = 42; // "the last ~6 weeks"

// ---------------------------------------------------------------------------
// Names — realistic Filipino first/last names.
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
// Static nursing course template — exactly the 5 courses asked for. Each
// student gets their OWN copy of whichever of these they "enroll" in (the
// app's own data model has no shared-curriculum table: subjects.created_by
// is a single owner, the same way a student's AI-generated course works —
// see database/schema.sql), so this is duplicated per student by design,
// not an oversight.
// ---------------------------------------------------------------------------
const TEMPLATES = [
  {
    name: 'Fundamentals of Nursing',
    modules: [
      { title: 'Vital Signs and Patient Assessment', topics: [
        { title: 'Vital Signs Measurement Techniques', lessons: ['Blood Pressure Measurement', 'Temperature and Pulse Assessment'] },
        { title: 'Infection Control Principles', lessons: ['Hand Hygiene Protocols', 'Personal Protective Equipment'] },
      ] },
      { title: 'Basic Nursing Procedures', topics: [
        { title: 'Wound Care Basics', lessons: ['Dressing Change Technique', 'Wound Healing Stages'] },
        { title: 'Patient Positioning and Mobility', lessons: ['Safe Patient Transfer', 'Pressure Injury Prevention'] },
      ] },
    ],
  },
  {
    name: 'Anatomy and Physiology',
    modules: [
      { title: 'Cardiovascular and Respiratory Systems', topics: [
        { title: 'Cardiovascular System Overview', lessons: ['Heart Chambers and Valves', 'Cardiac Cycle Basics'] },
        { title: 'Respiratory System Function', lessons: ['Gas Exchange Mechanics', 'Lung Volumes and Capacities'] },
      ] },
      { title: 'Musculoskeletal and Nervous Systems', topics: [
        { title: 'Musculoskeletal System Structure', lessons: ['Bone Classification', 'Muscle Contraction Basics'] },
        { title: 'Nervous System Fundamentals', lessons: ['Neuron Structure and Function', 'Central vs Peripheral Nervous System'] },
      ] },
    ],
  },
  {
    name: 'Pharmacology',
    modules: [
      { title: 'Dosage Calculation', topics: [
        { title: 'Medication Dosage Calculation', lessons: ['Basic Dosage Formulas', 'Pediatric Weight-Based Dosing'] },
        { title: 'IV Drip Rate Calculation', lessons: ['Drop Factor and Flow Rate', 'Infusion Pump Settings'] },
      ] },
      { title: 'Drug Classifications', topics: [
        { title: 'Antibiotic Classes Overview', lessons: ['Beta-Lactams and Resistance', 'Nursing Considerations for Antibiotics'] },
        { title: 'Cardiovascular Medications', lessons: ['Antihypertensives Overview', 'Anticoagulant Monitoring'] },
      ] },
    ],
  },
  {
    name: 'Health Assessment',
    modules: [
      { title: 'Physical Examination Techniques', topics: [
        { title: 'Inspection and Palpation Basics', lessons: ['General Survey Technique', 'Abdominal Palpation Basics'] },
        { title: 'Auscultation Fundamentals', lessons: ['Heart Sounds Basics', 'Lung Sounds Basics'] },
      ] },
      { title: 'Patient History Taking', topics: [
        { title: 'Health History Interview Skills', lessons: ['Chief Complaint Documentation', 'Review of Systems Basics'] },
        { title: 'Risk Factor Identification', lessons: ['Family History Assessment', 'Lifestyle Risk Screening'] },
      ] },
    ],
  },
  {
    name: 'Microbiology and Parasitology',
    modules: [
      { title: 'Bacteriology Basics', topics: [
        { title: 'Bacterial Structure and Classification', lessons: ['Gram Staining Technique', 'Bacterial Shapes and Arrangements'] },
        { title: 'Common Pathogenic Bacteria', lessons: ['Staphylococcus and Streptococcus', 'Enteric Bacteria Overview'] },
      ] },
      { title: 'Parasitic Infections', topics: [
        { title: 'Protozoan Parasites', lessons: ['Amoebiasis Basics', 'Malaria Transmission Cycle'] },
        { title: 'Helminthic Infections', lessons: ['Soil-Transmitted Helminths', 'Deworming Protocols'] },
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
    'recognize for this topic, with a short summary, one worked example, and a quick recap.',
    '',
    '### Key points',
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
function makeQuizQuestion(rng, topicTitle, index) {
  const correct = `The core concept behind "${topicTitle}"`;
  const options = shuffle(rng, [correct, ...shuffle(rng, QUIZ_DISTRACTORS).slice(0, 3)]);
  return {
    question: `Question ${index + 1}: Which of the following best relates to "${topicTitle}"?`,
    options,
    correct_answer: correct,
    explanation: `This question checks recall of the "${topicTitle}" content area.`,
  };
}

// ---------------------------------------------------------------------------
// XP formulas — mirrored exactly from backend/src/utils/gamification.js and
// backend/src/services/{learningService,quizService}.js so user_profiles
// stays consistent with the xp_events ledger just inserted, the same way
// awardXpOnce keeps them consistent for real student activity.
// ---------------------------------------------------------------------------
const XP_PER_LEVEL = 100;
const LESSON_COMPLETE_XP = 10;
const QUIZ_XP_MAX = 20;
const CHECKPOINT_PASS_XP = 30;
const FINAL_PASS_XP = 100;
const CHECKPOINT_ITEMS = 8;
const FINAL_ITEMS = 16;
const DEFAULT_PASSING_SCORE = 70;
function levelForXp(xp) { return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1; }

// ---------------------------------------------------------------------------
// Student activity profiles. "struggling" guarantees a weak recent quiz
// average (<60%, see constants/mastery.WEAK_SCORE_THRESHOLD) and "inactive"
// guarantees a stale last_active_date (7+ days) — together exactly the two
// signals adminModel.getStudentsNeedingHelp looks for.
// ---------------------------------------------------------------------------
const PROFILES = [
  ['strong', 30],
  ['average', 68],
  ['struggling', 30],
  ['inactive', 22],
];
const MAX_DAYS_AGO = ACTIVITY_WINDOW_DAYS - 1;

function activeDaysAgoForProfile(rng, profile) {
  const days = new Set();
  if (profile === 'inactive') {
    const start = randInt(rng, 8, Math.min(28, MAX_DAYS_AGO));
    const runLen = randInt(rng, 1, 4);
    for (let i = 0; i < runLen; i += 1) days.add(Math.min(MAX_DAYS_AGO, start + i));
    const extra = randInt(rng, 0, 3);
    for (let i = 0; i < extra; i += 1) days.add(randInt(rng, start, MAX_DAYS_AGO));
  } else if (profile === 'struggling') {
    const runLen = randInt(rng, 2, 6);
    const start = randInt(rng, 0, 3);
    for (let i = 0; i < runLen; i += 1) days.add(start + i);
    const extra = randInt(rng, 2, 8);
    for (let i = 0; i < extra; i += 1) days.add(randInt(rng, 0, MAX_DAYS_AGO));
  } else if (profile === 'average') {
    const runLen = randInt(rng, 3, 10);
    const start = randInt(rng, 0, 5);
    for (let i = 0; i < runLen; i += 1) days.add(start + i);
    const extra = randInt(rng, 3, 12);
    for (let i = 0; i < extra; i += 1) days.add(randInt(rng, 0, MAX_DAYS_AGO));
  } else {
    const runLen = randInt(rng, 7, 21);
    for (let i = 0; i < runLen; i += 1) days.add(i);
    const extra = randInt(rng, 5, 15);
    for (let i = 0; i < extra; i += 1) days.add(randInt(rng, 0, MAX_DAYS_AGO));
  }
  return [...days].filter((d) => d >= 0 && d <= MAX_DAYS_AGO).sort((a, b) => a - b);
}

function dateFromDaysAgo(rng, daysAgo) {
  const d = new Date();
  d.setHours(randInt(rng, 7, 21), randInt(rng, 0, 59), randInt(rng, 0, 59), 0);
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
const CHAT_PAIRS = [
  ['Can you explain IV drip rate calculation?', 'Sure! IV drip rate depends on the volume, drop factor, and time. Want a worked example?'],
  ['What is the newborn weight loss pattern?', 'Newborns typically lose up to 10% of birth weight in the first week, regained by 2 weeks.'],
  ['How do I study for my pharmacology checkpoint?', 'Try reviewing drug classifications first, then practice dosage calculation questions.'],
  ['What are the WHO 5 moments for hand hygiene?', 'They are: before touching a patient, before a procedure, after a procedure, after touching a patient, and after touching surroundings.'],
];

// ---------------------------------------------------------------------------
// buildPlan() — PURE. No DB access, no side effects. Returns every row this
// run would create, keyed by table name, plus the per-student metrics a
// dry-run needs to ESTIMATE (not insert) achievement unlocks. --dry-run and
// --apply both call this so they can never drift apart from each other.
// ---------------------------------------------------------------------------
function buildPlan({ count, leaderboardOptIn }) {
  const rng = makeRng(SEED);

  const students = Array.from({ length: count }, (_v, i) => {
    const n = i + 1;
    const profile = weightedChoice(rng, PROFILES);
    return {
      n,
      email: `mock.student${String(n).padStart(3, '0')}${MOCK_EMAIL_DOMAIN}`,
      studentNumber: `MOCK-${String(n).padStart(3, '0')}`,
      firstName: choice(rng, FIRST_NAMES),
      lastName: choice(rng, LAST_NAMES),
      leaderboardOptIn: (rng() * 100) < leaderboardOptIn ? 1 : 0,
      profile,
      activeDaysAgo: activeDaysAgoForProfile(rng, profile),
    };
  });

  // ---- course tree: each student enrolls in 2-5 of the 5 fixed subjects ----
  const enrollments = [];
  for (const s of students) {
    const courseCount = weightedChoice(rng, [[2, 15], [3, 30], [4, 30], [5, 25]]);
    const templateIdxs = shuffle(rng, TEMPLATES.map((_t, i) => i)).slice(0, courseCount);
    for (const templateIdx of templateIdxs) enrollments.push({ student: s, templateIdx });
  }

  const subjectRows = enrollments.map((e, i) => ({
    created_by: e.student.id ?? null, // filled with a real id only at apply time
    name: TEMPLATES[e.templateIdx].name,
    code: `MOCK-${e.student.n}-${e.templateIdx}`,
    difficulty: 'intermediate',
    is_ai_generated: 0,
    visibility: 'private',
    _enrollment: e,
    _rowIndex: i,
  }));
  enrollments.forEach((e, i) => { e._subjectRow = subjectRows[i]; });

  const moduleRows = [];
  subjectRows.forEach((subjectRow) => {
    TEMPLATES[subjectRow._enrollment.templateIdx].modules.forEach((m, idx) => {
      moduleRows.push({ title: m.title, order_index: idx, _subjectRow: subjectRow, _templateModuleIdx: idx });
    });
  });

  const topicRows = [];
  moduleRows.forEach((mod) => {
    const templateTopics = TEMPLATES[mod._subjectRow._enrollment.templateIdx].modules[mod._templateModuleIdx].topics;
    templateTopics.forEach((t, idx) => {
      topicRows.push({ title: t.title, order_index: idx, _module: mod, _templateTopicIdx: idx });
    });
  });

  const lessonRows = [];
  topicRows.forEach((topic) => {
    const templateLessons = TEMPLATES[topic._module._subjectRow._enrollment.templateIdx]
      .modules[topic._module._templateModuleIdx].topics[topic._templateTopicIdx].lessons;
    templateLessons.forEach((title) => {
      lessonRows.push({ title, content: sampleLessonContent(title, topic.title), difficulty: 'medium', estimated_minutes: 15, _topic: topic });
    });
  });

  const lessonsByEnrollment = new Map();
  const topicsByEnrollment = new Map();
  lessonRows.forEach((l) => {
    const key = l._topic._module._subjectRow._enrollment;
    if (!lessonsByEnrollment.has(key)) lessonsByEnrollment.set(key, []);
    lessonsByEnrollment.get(key).push(l);
  });
  topicRows.forEach((t) => {
    const key = t._module._subjectRow._enrollment;
    if (!topicsByEnrollment.has(key)) topicsByEnrollment.set(key, []);
    topicsByEnrollment.get(key).push(t);
  });

  // ---- per-student activity ----
  const lessonProgressRows = [];
  const learningProgressRows = [];
  const quizRows = [];
  const quizQuestionRowsByQuizIdx = [];
  const quizAttemptRowsByQuizIdx = [];
  const xpEventRows = [];
  const activityLogRows = [];
  const studentActivityDates = new Map();
  const studentMetrics = new Map(); // for the dry-run achievement estimate only
  const streakByStudent = new Map(); // {current, longest, lastActiveDate} per student — the actual learning_streaks row

  for (const s of students) {
    const activityDates = s.activeDaysAgo.map((d) => dateFromDaysAgo(rng, d));
    studentActivityDates.set(s.id ?? s.n, []);
    let dateCursor = 0;
    const nextDate = () => {
      const d = activityDates[dateCursor % activityDates.length] || dateFromDaysAgo(rng, 0);
      dateCursor += 1;
      return d;
    };

    const myEnrollments = enrollments.filter((e) => e.student === s);
    const [compMin, compMax] = completionFractionForProfile(s.profile);
    let lessonsCompleted = 0;
    let hasSubmittedQuiz = false;
    let hasPerfectQuiz = false;
    let hasPassedCheckpoint = false;
    let hasPassedFinal = false;

    for (const enr of myEnrollments) {
      const myLessons = lessonsByEnrollment.get(enr) || [];
      const myTopics = topicsByEnrollment.get(enr) || [];
      const fraction = compMin + rng() * (compMax - compMin);
      const toComplete = shuffle(rng, myLessons).slice(0, Math.round(myLessons.length * fraction));
      const completedLessonIds = new Set();

      for (const lesson of toComplete) {
        const when = nextDate();
        studentActivityDates.get(s.id ?? s.n).push(when);
        lessonProgressRows.push({ _student: s, _lesson: lesson, completed_at: when });
        completedLessonIds.add(lesson);
        lessonsCompleted += 1;

        xpEventRows.push({ _student: s, _eventKeyFor: 'lesson', _lesson: lesson, points: LESSON_COMPLETE_XP, reason: `Completed lesson "${lesson.title}"`, created_at: when });
        activityLogRows.push({ _student: s, activity_type: 'lesson_completed', _referenceFor: 'lesson', _lesson: lesson, description: `Completed lesson "${lesson.title}"`, created_at: when });
        activityLogRows.push({ _student: s, activity_type: 'xp_earned', reference_id: LESSON_COMPLETE_XP, description: `+${LESSON_COMPLETE_XP} XP - Completed lesson "${lesson.title}"`, created_at: when });
      }

      // learning_progress mirrors learningModel.recomputeTopicProgress's own
      // formula: percent = round(completed/total*100), status from percent.
      for (const topic of myTopics) {
        const topicLessons = myLessons.filter((l) => l._topic === topic);
        const completedInTopic = topicLessons.filter((l) => completedLessonIds.has(l)).length;
        if (!topicLessons.length || completedInTopic === 0) continue; // not_started rows: no consumer needs them
        const percent = Math.round((completedInTopic / topicLessons.length) * 100);
        const status = percent >= 100 ? 'completed' : 'in_progress';
        learningProgressRows.push({ _student: s, _topic: topic, progress_percent: percent, status });
      }

      // 1-3 practice quizzes per enrollment, each on a random topic.
      const practiceCount = randInt(rng, 1, 3);
      const [scoreMin, scoreMax] = scoreRangeForProfile(s.profile);
      for (let i = 0; i < practiceCount; i += 1) {
        const topic = choice(rng, myTopics);
        const itemCount = randInt(rng, 5, 10);
        const when = nextDate();
        studentActivityDates.get(s.id ?? s.n).push(when);
        const quizIdx = quizRows.length;
        quizRows.push({
          _student: s, topic: topic.title, quiz_type: 'multiple_choice', difficulty: 'medium',
          source_type: 'topic', _topic: topic, item_count: itemCount, subject_id: null, module_id: null,
          assessment_kind: 'practice', passing_score: null, assessment_slot: null, created_at: when,
        });
        quizQuestionRowsByQuizIdx[quizIdx] = Array.from({ length: itemCount }, (_v, qi) => makeQuizQuestion(rng, topic.title, qi));
        const scorePct = Math.round(scoreMin + rng() * (scoreMax - scoreMin));
        const score = Math.round((scorePct / 100) * itemCount);
        quizAttemptRowsByQuizIdx[quizIdx] = { _student: s, score, total: itemCount, status: 'submitted', passed: null, started_at: when, completed_at: when };
        hasSubmittedQuiz = true;
        if (score === itemCount) hasPerfectQuiz = true;

        const xpAmount = Math.round((score / Math.max(1, itemCount)) * QUIZ_XP_MAX);
        xpEventRows.push({ _student: s, _eventKeyFor: 'quiz', _quizIdx: quizIdx, points: xpAmount, reason: `Completed the "${topic.title}" quiz`, created_at: when });
        activityLogRows.push({ _student: s, activity_type: 'quiz_completed', _referenceFor: 'quiz', _quizIdx: quizIdx, description: `Scored ${score}/${itemCount} on "${topic.title}" quiz`, created_at: when });
        activityLogRows.push({ _student: s, activity_type: 'xp_earned', reference_id: xpAmount, description: `+${xpAmount} XP - Completed the "${topic.title}" quiz`, created_at: when });
      }

      // Module checkpoint (first module, ~50% of the time once that module's
      // topics have decent completion) and course final (~50% of
      // checkpoint-passers with high overall completion).
      const templateName = TEMPLATES[enr.templateIdx].name;
      const module1 = TEMPLATES[enr.templateIdx].modules[0];
      const module1Row = moduleRows.find((m) => m._subjectRow === enr._subjectRow && m._templateModuleIdx === 0);
      if (fraction >= 0.4 && rng() < 0.5) {
        const when = nextDate();
        studentActivityDates.get(s.id ?? s.n).push(when);
        const passed = rng() < (s.profile === 'strong' ? 0.9 : s.profile === 'struggling' ? 0.3 : 0.65) ? 1 : 0;
        const scorePct = passed ? randInt(rng, 70, 100) : randInt(rng, 30, 69);
        const score = Math.round((scorePct / 100) * CHECKPOINT_ITEMS);
        const percent = Math.round((score / CHECKPOINT_ITEMS) * 100);
        const quizIdx = quizRows.length;
        quizRows.push({
          _student: s, topic: `${templateName}: ${module1.title} Checkpoint`, quiz_type: 'multiple_choice', difficulty: 'medium',
          source_type: null, source_id: null, item_count: CHECKPOINT_ITEMS, subject_id: null, _module: module1Row,
          assessment_kind: 'module_checkpoint', passing_score: DEFAULT_PASSING_SCORE, _assessmentSlotIsModule: true, created_at: when,
        });
        quizQuestionRowsByQuizIdx[quizIdx] = Array.from({ length: CHECKPOINT_ITEMS }, (_v, qi) => makeQuizQuestion(rng, module1.title, qi));
        quizAttemptRowsByQuizIdx[quizIdx] = { _student: s, score, total: CHECKPOINT_ITEMS, status: 'submitted', passed, started_at: when, completed_at: when };
        hasSubmittedQuiz = true;
        if (score === CHECKPOINT_ITEMS) hasPerfectQuiz = true;
        if (passed) hasPassedCheckpoint = true;

        activityLogRows.push({
          _student: s, activity_type: 'quiz_completed', _referenceFor: 'quiz', _quizIdx: quizIdx,
          description: `${passed ? 'Passed' : 'Attempted'} the "${module1.title}" module checkpoint (${percent}%)`, created_at: when,
        });
        if (passed) {
          xpEventRows.push({ _student: s, _eventKeyFor: 'checkpoint', _module: module1Row, points: CHECKPOINT_PASS_XP, reason: `Passed the "${module1.title}" Module Checkpoint`, created_at: when });
          activityLogRows.push({ _student: s, activity_type: 'xp_earned', reference_id: CHECKPOINT_PASS_XP, description: `+${CHECKPOINT_PASS_XP} XP - Passed the "${module1.title}" Module Checkpoint`, created_at: when });

          if (fraction >= 0.75 && rng() < 0.5) {
            const whenFinal = nextDate();
            studentActivityDates.get(s.id ?? s.n).push(whenFinal);
            const finalPassed = rng() < (s.profile === 'strong' ? 0.85 : 0.5) ? 1 : 0;
            const finalPct = finalPassed ? randInt(rng, 70, 100) : randInt(rng, 35, 69);
            const finalScore = Math.round((finalPct / 100) * FINAL_ITEMS);
            const finalPercent = Math.round((finalScore / FINAL_ITEMS) * 100);
            const finalQuizIdx = quizRows.length;
            quizRows.push({
              _student: s, topic: `${templateName} Final`, quiz_type: 'multiple_choice', difficulty: 'medium',
              source_type: null, source_id: null, item_count: FINAL_ITEMS, _subjectRow: enr._subjectRow, module_id: null,
              assessment_kind: 'course_final', passing_score: DEFAULT_PASSING_SCORE, _assessmentSlotIsFinal: true, created_at: whenFinal,
            });
            quizQuestionRowsByQuizIdx[finalQuizIdx] = Array.from({ length: FINAL_ITEMS }, (_v, qi) => makeQuizQuestion(rng, templateName, qi));
            quizAttemptRowsByQuizIdx[finalQuizIdx] = { _student: s, score: finalScore, total: FINAL_ITEMS, status: 'submitted', passed: finalPassed, started_at: whenFinal, completed_at: whenFinal };
            hasSubmittedQuiz = true;
            if (finalScore === FINAL_ITEMS) hasPerfectQuiz = true;
            if (finalPassed) hasPassedFinal = true;

            activityLogRows.push({
              _student: s, activity_type: 'quiz_completed', _referenceFor: 'quiz', _quizIdx: finalQuizIdx,
              description: `${finalPassed ? 'Passed' : 'Attempted'} the "${templateName}" course final (${finalPercent}%)`, created_at: whenFinal,
            });
            if (finalPassed) {
              xpEventRows.push({ _student: s, _eventKeyFor: 'final', _subjectRow: enr._subjectRow, points: FINAL_PASS_XP, reason: `Passed the "${templateName}" Course Final`, created_at: whenFinal });
              activityLogRows.push({ _student: s, activity_type: 'xp_earned', reference_id: FINAL_PASS_XP, description: `+${FINAL_PASS_XP} XP - Passed the "${templateName}" Course Final`, created_at: whenFinal });
            }
          }
        }
      }
    }

    const { current, longest, lastActiveDate } = computeStreak(studentActivityDates.get(s.id ?? s.n) || []);
    const totalXp = xpEventRows.filter((r) => r._student === s).reduce((sum, r) => sum + r.points, 0);
    streakByStudent.set(s, { current, longest, lastActiveDate });
    studentMetrics.set(s, {
      lessonsCompleted, hasSubmittedQuiz, hasPerfectQuiz, hasPassedCheckpoint, hasPassedFinal,
      // Same GREATEST(current, longest) the real achievementModel.getUserMetrics
      // query uses for its `days` metric — see its SQL comment.
      streakDays: Math.max(current, longest), level: levelForXp(totalXp), totalXp,
    });
  }

  // ~40 feedback entries, spread over the activity window, mostly positive.
  const feedbackRows = Array.from({ length: Math.max(1, Math.round(count * 0.27)) }, () => {
    const s = choice(rng, students);
    const rating = weightedChoice(rng, [[5, 40], [4, 35], [3, 15], [2, 7], [1, 3]]);
    return {
      _student: s, context_type: 'general', rating, comment: choice(rng, FEEDBACK_COMMENTS),
      status: rng() < 0.4 ? 'resolved' : 'pending', created_at: dateFromDaysAgo(rng, randInt(rng, 0, MAX_DAYS_AGO)),
    };
  });

  // A handful of simple chat conversations (canned text, no Gemini).
  const chatStudents = shuffle(rng, students).slice(0, Math.min(students.length, Math.max(1, Math.round(count * 0.17))));
  const conversationRows = chatStudents.map((s) => ({ _student: s, title: 'Study question', started_at: dateFromDaysAgo(rng, randInt(rng, 0, Math.min(MAX_DAYS_AGO, 29))) }));
  const messageRows = [];
  conversationRows.forEach((c) => {
    const [question, answer] = choice(rng, CHAT_PAIRS);
    messageRows.push({ _conversation: c, sender: 'user', message_type: 'text', message_text: question, created_at: c.started_at });
    messageRows.push({ _conversation: c, sender: 'bot', message_type: 'text', message_text: answer, created_at: new Date(c.started_at.getTime() + 15000) });
  });

  return {
    students, subjectRows, moduleRows, topicRows, lessonRows,
    lessonProgressRows, learningProgressRows,
    quizRows, quizQuestionRowsByQuizIdx, quizAttemptRowsByQuizIdx,
    xpEventRows, activityLogRows, feedbackRows, conversationRows, messageRows,
    studentMetrics, streakByStudent,
  };
}

// ---------------------------------------------------------------------------
// Bulk insert helper — one multi-row INSERT per chunk. MySQL/MariaDB assigns
// contiguous AUTO_INCREMENT ids to a single multi-row INSERT, so
// `result.insertId + i` is safe here: this script is the only writer, and
// there are no concurrent inserts into these tables while it runs.
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
// dry-run — prints DB host/name + planned counts, from the pure plan only.
// Never opens a transaction; a best-effort connectivity ping is reported but
// never fatal, since the whole point of dry-run is that it works offline.
// ---------------------------------------------------------------------------
async function dryRun(args) {
  console.log(`DB_HOST = ${process.env.DB_HOST || '(unset, defaults to localhost)'}`);
  console.log(`DB_NAME = ${process.env.DB_NAME || '(unset, defaults to aila_db)'}`);

  let connectionOk = false;
  try {
    await pool.query('SELECT 1');
    connectionOk = true;
  } catch (err) {
    console.log(`Connectivity check: FAILED (${err.message}) — row counts below are still planned correctly; they just were not verified against a live schema.`);
  }
  if (connectionOk) console.log('Connectivity check: OK');

  const plan = buildPlan(args);
  const achievementEstimate = connectionOk ? await estimateAchievements(plan.studentMetrics) : 'N/A (no DB connection)';

  const counts = {
    students: plan.students.length,
    subjects: plan.subjectRows.length,
    modules: plan.moduleRows.length,
    topics: plan.topicRows.length,
    lessons: plan.lessonRows.length,
    lesson_progress: plan.lessonProgressRows.length,
    learning_progress: plan.learningProgressRows.length,
    quizzes: plan.quizRows.length,
    quiz_questions: plan.quizQuestionRowsByQuizIdx.reduce((s, qs) => s + qs.length, 0),
    quiz_attempts: plan.quizAttemptRowsByQuizIdx.length,
    xp_events: plan.xpEventRows.length,
    dashboard_activity_log: plan.activityLogRows.length,
    feedback: plan.feedbackRows.length,
    chat_conversations: plan.conversationRows.length,
    chat_messages: plan.messageRows.length,
    user_achievements_estimate: achievementEstimate,
  };

  console.log(`\n--count=${args.count}  --leaderboard-optin=${args.leaderboardOptIn}\nPlanned row counts (nothing written):`);
  console.table(counts);
}

async function estimateAchievements(studentMetrics) {
  const catalog = await pool.query('SELECT slug, criteria_type, criteria_value, is_active FROM achievements WHERE is_active = 1').then(([r]) => r);
  let total = 0;
  for (const metrics of studentMetrics.values()) {
    for (const a of catalog) {
      if (achievementService.meetsCriteria(a, metrics)) total += 1;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// apply — refuses if mock data already exists, then inserts everything in
// ONE transaction, then runs the project's own achievement reconciliation
// (no bonus XP, no notifications — see achievementService.reconcileUser).
// ---------------------------------------------------------------------------
async function applyMockData(args) {
  assertSafeToRun(args);

  const existing = await pool.query('SELECT COUNT(*) AS c FROM users WHERE email LIKE ?', [MOCK_EMAIL_LIKE]).then(([r]) => r[0].c);
  if (existing > 0) {
    throw new Error(`Refusing to apply: ${existing} mock user row(s) already exist. Run --remove first.`);
  }

  const roleRow = await pool.query("SELECT id FROM roles WHERE name = 'student' LIMIT 1").then(([r]) => r[0]);
  if (!roleRow) throw new Error('No "student" role found — is the database seeded (database/seed.sql)?');
  const studentRoleId = roleRow.id;

  const bcrypt = require('bcrypt');
  const crypto = require('crypto');
  // One shared, genuinely-random, never-displayed password hash for every
  // mock account — "unusable" just means nobody knows the password; nobody
  // needs a DISTINCT one since these accounts are never meant to log in.
  const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  const plan = buildPlan(args);
  const summary = {};
  let userIds = [];

  await transaction(async (connection) => {
    userIds = await bulkInsert(connection, 'users',
      ['role_id', 'student_number', 'email', 'password_hash', 'first_name', 'last_name', 'is_active', 'email_verified_at'],
      plan.students.map((s) => ({
        role_id: studentRoleId, student_number: s.studentNumber, email: s.email, password_hash: unusablePasswordHash,
        first_name: s.firstName, last_name: s.lastName, is_active: 1, email_verified_at: new Date(),
      })));
    plan.students.forEach((s, i) => { s.id = userIds[i]; });
    summary.students = userIds.length;

    await bulkInsert(connection, 'user_profiles',
      ['user_id', 'program', 'year_level', 'xp_points', 'level', 'leaderboard_opt_in'],
      plan.students.map((s) => ({ user_id: s.id, program: MOCK_PROGRAM, year_level: MOCK_YEAR_LEVEL, xp_points: 0, level: 1, leaderboard_opt_in: s.leaderboardOptIn })));

    const subjectIds = await bulkInsert(connection, 'subjects',
      ['created_by', 'name', 'code', 'difficulty', 'is_ai_generated', 'visibility'],
      plan.subjectRows.map((r) => ({ created_by: r._enrollment.student.id, name: r.name, code: r.code, difficulty: r.difficulty, is_ai_generated: r.is_ai_generated, visibility: r.visibility })));
    plan.subjectRows.forEach((r, i) => { r.id = subjectIds[i]; });
    summary.subjects = subjectIds.length;

    const moduleIds = await bulkInsert(connection, 'modules', ['subject_id', 'title', 'order_index'],
      plan.moduleRows.map((m) => ({ subject_id: m._subjectRow.id, title: m.title, order_index: m.order_index })));
    plan.moduleRows.forEach((m, i) => { m.id = moduleIds[i]; });
    summary.modules = moduleIds.length;

    const topicIds = await bulkInsert(connection, 'topics', ['module_id', 'title', 'order_index'],
      plan.topicRows.map((t) => ({ module_id: t._module.id, title: t.title, order_index: t.order_index })));
    plan.topicRows.forEach((t, i) => { t.id = topicIds[i]; });
    summary.topics = topicIds.length;

    const lessonIds = await bulkInsert(connection, 'lessons', ['topic_id', 'title', 'content', 'difficulty', 'estimated_minutes'],
      plan.lessonRows.map((l) => ({ topic_id: l._topic.id, title: l.title, content: l.content, difficulty: l.difficulty, estimated_minutes: l.estimated_minutes })));
    plan.lessonRows.forEach((l, i) => { l.id = lessonIds[i]; });
    summary.lessons = lessonIds.length;

    await bulkInsert(connection, 'lesson_progress', ['user_id', 'lesson_id', 'completed_at'],
      plan.lessonProgressRows.map((r) => ({ user_id: r._student.id, lesson_id: r._lesson.id, completed_at: r.completed_at })));
    summary.lessonProgress = plan.lessonProgressRows.length;

    await bulkInsert(connection, 'learning_progress', ['user_id', 'topic_id', 'progress_percent', 'status'],
      plan.learningProgressRows.map((r) => ({ user_id: r._student.id, topic_id: r._topic.id, progress_percent: r.progress_percent, status: r.status })));
    summary.learningProgress = plan.learningProgressRows.length;

    const quizIds = await bulkInsert(connection, 'quizzes',
      ['user_id', 'topic', 'quiz_type', 'difficulty', 'source_type', 'source_id', 'item_count', 'subject_id', 'module_id', 'assessment_kind', 'passing_score', 'assessment_slot', 'created_at'],
      plan.quizRows.map((q) => ({
        user_id: q._student.id, topic: q.topic, quiz_type: q.quiz_type, difficulty: q.difficulty,
        source_type: q.source_type, source_id: q._topic ? q._topic.id : null, item_count: q.item_count,
        subject_id: q._subjectRow ? q._subjectRow.id : (q._module ? q._module._subjectRow.id : null),
        module_id: q._module ? q._module.id : null,
        assessment_kind: q.assessment_kind, passing_score: q.passing_score,
        assessment_slot: q._assessmentSlotIsModule ? q._module.id : q._assessmentSlotIsFinal ? 0 : null,
        created_at: q.created_at,
      })));
    plan.quizRows.forEach((q, i) => { q.id = quizIds[i]; });
    summary.quizzes = quizIds.length;

    const quizQuestionRows = [];
    plan.quizQuestionRowsByQuizIdx.forEach((questions, quizIdx) => {
      questions.forEach((qq, orderIdx) => {
        quizQuestionRows.push({ quiz_id: quizIds[quizIdx], question: qq.question, options: JSON.stringify(qq.options), correct_answer: qq.correct_answer, explanation: qq.explanation, order_index: orderIdx });
      });
    });
    await bulkInsert(connection, 'quiz_questions', ['quiz_id', 'question', 'options', 'correct_answer', 'explanation', 'order_index'], quizQuestionRows);
    summary.quizQuestions = quizQuestionRows.length;

    await bulkInsert(connection, 'quiz_attempts', ['quiz_id', 'user_id', 'score', 'total', 'status', 'passed', 'started_at', 'completed_at'],
      plan.quizAttemptRowsByQuizIdx.map((a, quizIdx) => ({ quiz_id: quizIds[quizIdx], user_id: a._student.id, score: a.score, total: a.total, status: a.status, passed: a.passed, started_at: a.started_at, completed_at: a.completed_at })));
    summary.quizAttempts = plan.quizAttemptRowsByQuizIdx.length;

    const xpEventRows = plan.xpEventRows.map((r) => {
      let eventKey;
      if (r._eventKeyFor === 'lesson') eventKey = `lesson_completed:${r._lesson.id}`;
      else if (r._eventKeyFor === 'quiz') eventKey = `quiz_completed:${quizIds[r._quizIdx]}`;
      else if (r._eventKeyFor === 'checkpoint') eventKey = `module_checkpoint_pass:${r._module.id}`;
      else if (r._eventKeyFor === 'final') eventKey = `course_final_pass:${r._subjectRow.id}`;
      return { user_id: r._student.id, event_key: eventKey, points: r.points, reason: r.reason, created_at: r.created_at };
    });
    await bulkInsert(connection, 'xp_events', ['user_id', 'event_key', 'points', 'reason', 'created_at'], xpEventRows);
    summary.xpEvents = xpEventRows.length;

    const activityLogRows = plan.activityLogRows.map((r) => {
      let referenceId = r.reference_id ?? null;
      if (r._referenceFor === 'lesson') referenceId = r._lesson.id;
      else if (r._referenceFor === 'quiz') referenceId = quizIds[r._quizIdx];
      return { user_id: r._student.id, activity_type: r.activity_type, reference_id: referenceId, description: r.description, created_at: r.created_at };
    });
    await bulkInsert(connection, 'dashboard_activity_log', ['user_id', 'activity_type', 'reference_id', 'description', 'created_at'], activityLogRows);
    summary.activityLog = activityLogRows.length;

    // ---- user_profiles.xp_points / level, computed from the ledger just inserted ----
    const xpByUser = new Map();
    xpEventRows.forEach((row) => xpByUser.set(row.user_id, (xpByUser.get(row.user_id) || 0) + row.points));
    for (const [userId, totalXp] of xpByUser.entries()) {
      await connection.query('UPDATE user_profiles SET xp_points = ?, level = ? WHERE user_id = ?', [totalXp, levelForXp(totalXp), userId]);
    }

    // ---- learning_streaks, computed from the same activity dates ----
    const streakRows = [];
    for (const s of plan.students) {
      const result = plan.streakByStudent.get(s);
      if (result && result.lastActiveDate) {
        streakRows.push({ user_id: s.id, current_streak: result.current, longest_streak: result.longest, last_active_date: result.lastActiveDate });
      }
    }
    await bulkInsert(connection, 'learning_streaks', ['user_id', 'current_streak', 'longest_streak', 'last_active_date'], streakRows);

    await bulkInsert(connection, 'feedback', ['user_id', 'context_type', 'rating', 'comment', 'status', 'created_at'],
      plan.feedbackRows.map((r) => ({ user_id: r._student.id, context_type: r.context_type, rating: r.rating, comment: r.comment, status: r.status, created_at: r.created_at })));
    summary.feedback = plan.feedbackRows.length;

    const conversationIds = await bulkInsert(connection, 'chat_conversations', ['user_id', 'title', 'started_at'],
      plan.conversationRows.map((c) => ({ user_id: c._student.id, title: c.title, started_at: c.started_at })));
    plan.conversationRows.forEach((c, i) => { c.id = conversationIds[i]; });
    summary.chatConversations = conversationIds.length;

    await bulkInsert(connection, 'chat_messages', ['conversation_id', 'sender', 'message_type', 'message_text', 'created_at'],
      plan.messageRows.map((m) => ({ conversation_id: m._conversation.id, sender: m.sender, message_type: m.message_type, message_text: m.message_text, created_at: m.created_at })));
    summary.chatMessages = plan.messageRows.length;
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

  console.log('\nMock data applied:');
  console.table(summary);
  return summary;
}

// ---------------------------------------------------------------------------
// remove() — delete everything --apply created, in FK-safe order, ONE
// transaction. Mock students are never admins and never perform admin
// actions, so nothing should reference them via admin_audit_log.admin_id
// (ON DELETE RESTRICT) — checked explicitly rather than assumed.
// ---------------------------------------------------------------------------
async function removeMockData(args) {
  assertSafeToRun(args);

  const mockUsers = await pool.query('SELECT id FROM users WHERE email LIKE ?', [MOCK_EMAIL_LIKE]).then(([r]) => r);
  const userIds = mockUsers.map((u) => u.id);
  if (!userIds.length) {
    console.log('No mock data found — nothing to remove.');
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

  console.log(`Removed ${userIds.length} mock users and everything that hung off them.`);
  return { usersRemoved: userIds.length };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'dry-run') {
    await dryRun(args);
  } else if (args.mode === 'apply') {
    await applyMockData(args);
  } else if (args.mode === 'remove') {
    await removeMockData(args);
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

module.exports = { buildPlan, applyMockData, removeMockData, dryRun, assertSafeToRun, parseArgs };
