// The subject list lives in ONE file, shared with the backend (which validates
// against it): backend/src/constants/curriculumSubjects.json. Vite inlines it
// at build time, so editing that file updates both sides. Only the code is
// stored on a course; it is shown as "CODE: Title".
import config from '../../backend/src/constants/curriculumSubjects.json';

export const OTHERS_SUBJECT_LABEL = config.othersLabel;

const subjectLabel = (subject) => `${subject.code}: ${subject.name}`;
const SUBJECTS = config.terms.flatMap((term) => term.subjects);

// Dropdown groups (one <optgroup> per term), in list order.
export const CURRICULUM_SUBJECT_GROUPS = config.terms.map((term) => ({
  label: term.label,
  options: term.subjects.map((subject) => ({ value: subject.code, label: subjectLabel(subject) })),
}));

// Every option, flat: the listed subjects, then "Others" (value '' = no subject).
export const CURRICULUM_SUBJECT_OPTIONS = [
  ...CURRICULUM_SUBJECT_GROUPS.flatMap((group) => group.options),
  { value: '', label: OTHERS_SUBJECT_LABEL },
];

// A course with no subject (NULL) or one no longer on the list (e.g. an old
// placeholder code) shows as "Others"; its stored value is left as it is.
export function curriculumSubjectLabel(code) {
  const match = SUBJECTS.find((subject) => subject.code === code);
  return match ? subjectLabel(match) : OTHERS_SUBJECT_LABEL;
}

function groupKey(code) {
  return SUBJECTS.some((subject) => subject.code === code) ? code : '';
}

// Groups courses by curriculum_subject in list order, "Others" last; empty
// groups are left out.
export function groupCoursesBySubject(courses) {
  return CURRICULUM_SUBJECT_OPTIONS
    .map((option) => ({
      value: option.value,
      label: option.label,
      courses: courses.filter((course) => groupKey(course.curriculum_subject) === option.value),
    }))
    .filter((group) => group.courses.length > 0);
}

export function matchesSubjectFilter(course, filter) {
  return filter === 'all' || groupKey(course.curriculum_subject) === filter;
}
