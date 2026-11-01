// Fixed, validated choices for "Add a course" (and nowhere else free-text
// goes into a generation prompt except the existing delimited goal block).
// Shared by the validator, courseGenerationService (prompt rules), and
// learningModel (course-card purpose badge) so the allowed-value lists and
// their labels/guidance only exist in one place.

const COURSE_PURPOSES = {
  from_scratch: 'Learn from scratch',
  exam_review: 'Review for an exam',
  board_exam: 'Board exam (NLE) review',
  catch_up: 'Catch up on a class',
  clinical_skills: 'Clinical skills and procedures',
  mastery: 'Master the topic',
};

// Prompt guidance injected for the roadmap AND every later lesson generation
// for that course — specific enough to actually change what gets written,
// not just a label restated back to the model.
const COURSE_PURPOSE_GUIDANCE = {
  from_scratch: 'The student is learning this topic from scratch, with no prior background — introduce foundational concepts first and build up progressively; do not assume prior knowledge.',
  exam_review: 'The student is reviewing for an upcoming exam — prioritize the most commonly tested concepts, keep explanations concise and recap-oriented, and call out likely exam traps.',
  board_exam: 'The student is reviewing for a licensure/board exam (e.g. the Philippine NLE) — use board-exam-style phrasing and emphasis, cover the highest-yield content first, and explicitly call out common pitfalls and frequently confused concepts the way a board exam reviewer would.',
  catch_up: 'The student is catching up after falling behind in this class — be direct and efficient; focus on what is essential to get caught up quickly, without unnecessary tangents.',
  clinical_skills: 'The student wants to build clinical/procedural skills — emphasize step-by-step procedures, safety considerations, and practical hands-on application over pure theory.',
  mastery: 'The student wants deep mastery of this topic, beyond the basics — include nuance, edge cases, and deeper "why" explanations, not just surface-level coverage.',
};

// The exact size of each course length. The module count is what the length
// changes; every length keeps the same per-module shape the roadmap always
// used (2-3 topics per module, 1-2 lessons per topic). The server enforces
// these after Gemini replies (courseGenerationService.fitRoadmapToLength).
const COURSE_LENGTH_SIZES = {
  short: { modules: 2, topicsPerModule: { min: 2, max: 3 }, lessonsPerTopic: { min: 1, max: 2 } },
  standard: { modules: 4, topicsPerModule: { min: 2, max: 3 }, lessonsPerTopic: { min: 1, max: 2 } },
  in_depth: { modules: 6, topicsPerModule: { min: 2, max: 3 }, lessonsPerTopic: { min: 1, max: 2 } },
};
const DEFAULT_COURSE_LENGTH = 'standard';

// An unknown or missing length (e.g. a course from before this option
// existed) is treated as 'standard'.
function courseLengthSize(length) {
  return COURSE_LENGTH_SIZES[length] || COURSE_LENGTH_SIZES[DEFAULT_COURSE_LENGTH];
}

const COURSE_LENGTH_NAMES = { short: 'Short', standard: 'Standard', in_depth: 'In-depth' };

const COURSE_LENGTHS = Object.fromEntries(
  Object.entries(COURSE_LENGTH_SIZES).map(([key, size]) => [key, `${COURSE_LENGTH_NAMES[key]}: ${size.modules} modules`])
);

// The roadmap prompt's size rule, with the exact counts stated plainly.
function courseLengthRule(length) {
  const { modules, topicsPerModule: t, lessonsPerTopic: l } = courseLengthSize(length);
  return `Produce EXACTLY ${modules} modules — no more and no fewer. Each module has ${t.min}-${t.max} topics; each topic has ${l.min}-${l.max} lessons.`;
}

const COURSE_LENGTH_ROADMAP_RULE = Object.fromEntries(
  Object.keys(COURSE_LENGTH_SIZES).map((key) => [key, courseLengthRule(key)])
);

const COURSE_FOCUSES = {
  worked_examples: 'Worked examples',
  case_scenarios: 'Case scenarios',
  key_terms: 'Key terms and definitions',
  practice_questions: 'Practice questions inside lessons',
  summaries_tables: 'Summaries and tables',
  real_world_application: 'Real-world application',
};

const COURSE_FOCUS_GUIDANCE = {
  worked_examples: 'include worked examples that show step-by-step reasoning',
  case_scenarios: 'include realistic case scenarios (e.g. patient cases or real situations) to illustrate concepts in context',
  key_terms: 'clearly define key terms and vocabulary as they are introduced',
  practice_questions: 'include a few short practice questions embedded within the lesson content itself (not just at the very end) to check understanding as the student progresses',
  summaries_tables: 'use summary tables or comparison tables wherever they would clarify the material',
  real_world_application: 'explicitly connect concepts to real-world, practical applications',
};

module.exports = {
  COURSE_PURPOSES,
  COURSE_PURPOSE_GUIDANCE,
  COURSE_PURPOSE_KEYS: Object.keys(COURSE_PURPOSES),
  COURSE_LENGTHS,
  COURSE_LENGTH_SIZES,
  DEFAULT_COURSE_LENGTH,
  courseLengthSize,
  courseLengthRule,
  COURSE_LENGTH_ROADMAP_RULE,
  COURSE_LENGTH_KEYS: Object.keys(COURSE_LENGTHS),
  COURSE_FOCUSES,
  COURSE_FOCUS_GUIDANCE,
  COURSE_FOCUS_KEYS: Object.keys(COURSE_FOCUSES),
};
