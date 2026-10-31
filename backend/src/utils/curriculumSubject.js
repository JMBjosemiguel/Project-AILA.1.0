// Reads the one curriculum-subject config file (constants/curriculumSubjects.json,
// also imported by the frontend) — the list itself lives only there.
const config = require('../constants/curriculumSubjects.json');

// Grouped by term in the file; flattened here, each subject keeping its term.
const CURRICULUM_TERMS = config.terms;
const CURRICULUM_SUBJECTS = CURRICULUM_TERMS.flatMap((term) => term.subjects.map((subject) => ({ ...subject, term: term.label })));
const CURRICULUM_SUBJECT_CODES = CURRICULUM_SUBJECTS.map((subject) => subject.code);
const OTHERS_LABEL = config.othersLabel;

// Every value the API accepts for a NEW course: a listed code, or
// ''/"Others" (= no subject). Existing courses keep whatever code they have
// stored (e.g. an old placeholder): copies carry it over untouched and it
// simply reads as "Others" (see curriculumSubjectLabel).
const ACCEPTED_CURRICULUM_SUBJECT_VALUES = ['', OTHERS_LABEL, ...CURRICULUM_SUBJECT_CODES];

// '' / "Others" / null / undefined are all stored as NULL ("Others").
function normalizeCurriculumSubject(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed !== OTHERS_LABEL && CURRICULUM_SUBJECT_CODES.includes(trimmed) ? trimmed : null;
}

function curriculumSubjectLabel(code) {
  const match = CURRICULUM_SUBJECTS.find((subject) => subject.code === code);
  return match ? `${match.code}: ${match.name}` : OTHERS_LABEL;
}

module.exports = {
  CURRICULUM_TERMS,
  CURRICULUM_SUBJECTS,
  CURRICULUM_SUBJECT_CODES,
  OTHERS_LABEL,
  ACCEPTED_CURRICULUM_SUBJECT_VALUES,
  normalizeCurriculumSubject,
  curriculumSubjectLabel,
};
