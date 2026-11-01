export const DEFAULT_ACCENT = {
  color: '#64748B',
  tint: '#F1F5F9',
  label: 'Unassigned',
};

export const RESOURCE_TYPES = ['all', 'pdf', 'docx', 'ppt', 'pptx', 'image', 'link'];

// Display labels for RESOURCE_TYPES — CSS capitalize/uppercase can't tell an
// acronym (PDF, DOCX) from a plain word (Image, Link), so this is explicit.
export const RESOURCE_TYPE_LABELS = {
  all: 'All',
  pdf: 'PDF',
  docx: 'DOCX',
  ppt: 'PPT',
  pptx: 'PPTX',
  image: 'Image',
  link: 'Link',
};

// Must match the backend's uploadResourceFile middleware exactly (resources
// upload limits — both the Resource Library's own uploader and the chat
// attachment picker go through the same /resources/upload endpoint).
export const ACCEPTED_RESOURCE_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

// Must match the backend's MAX_FILE_SIZE (middlewares/uploadResourceFile.js).
export const MAX_RESOURCE_FILE_SIZE_MB = 25;
export const MAX_RESOURCE_FILE_SIZE_BYTES = MAX_RESOURCE_FILE_SIZE_MB * 1024 * 1024;

// Mirrors backend/src/constants/courseOptions.js — the backend is the
// source of truth for what's VALID (it rejects anything else); this is
// purely the display side (labels, option order) for "Add a course".
export const COURSE_PURPOSES = [
  { value: 'from_scratch', label: 'Learn from scratch' },
  { value: 'exam_review', label: 'Review for an exam' },
  { value: 'board_exam', label: 'Board exam (NLE) review' },
  { value: 'catch_up', label: 'Catch up on a class' },
  { value: 'clinical_skills', label: 'Clinical skills and procedures' },
  { value: 'mastery', label: 'Master the topic' },
];
export const COURSE_PURPOSE_LABELS = Object.fromEntries(COURSE_PURPOSES.map((p) => [p.value, p.label]));

// Must match the backend's QUIZ_TIME_LIMIT_MINUTES (constants/quizTimer.js).
export const QUIZ_TIME_LIMIT_OPTIONS = [
  { value: null, label: 'No limit' },
  ...[5, 10, 15, 20, 30, 45, 60].map((minutes) => ({ value: minutes, label: `${minutes} min` })),
];

// Must match the backend's COURSE_LENGTH_SIZES (constants/courseOptions.js),
// which the server enforces on every generated roadmap.
export const COURSE_LENGTHS = [
  { value: 'short', label: 'Short', modules: 2 },
  { value: 'standard', label: 'Standard', modules: 4 },
  { value: 'in_depth', label: 'In-depth', modules: 6 },
].map((option) => ({ ...option, description: `${option.label}: ${option.modules} modules` }));

export const COURSE_FOCUSES = [
  { value: 'worked_examples', label: 'Worked examples' },
  { value: 'case_scenarios', label: 'Case scenarios' },
  { value: 'key_terms', label: 'Key terms and definitions' },
  { value: 'practice_questions', label: 'Practice questions inside lessons' },
  { value: 'summaries_tables', label: 'Summaries and tables' },
  { value: 'real_world_application', label: 'Real-world application' },
];

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};
