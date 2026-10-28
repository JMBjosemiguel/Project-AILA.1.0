// The subject list lives in ONE file, shared with the backend (which validates
// against it): backend/src/constants/curriculumSubjects.json. Vite inlines it
// at build time, so editing that file updates both sides.
import config from '../../backend/src/constants/curriculumSubjects.json';

export const OTHERS_SUBJECT_LABEL = config.othersLabel;

// Dropdown options: the listed subjects, then "Others" (value '' = no subject).
export const CURRICULUM_SUBJECT_OPTIONS = [
  ...config.subjects.map((subject) => ({ value: subject.code, label: `${subject.code} ${subject.name}` })),
  { value: '', label: OTHERS_SUBJECT_LABEL },
];

// A course with no subject (NULL) or one no longer on the list shows as "Others".
export function curriculumSubjectLabel(code) {
  const match = config.subjects.find((subject) => subject.code === code);
  return match ? `${match.code} ${match.name}` : OTHERS_SUBJECT_LABEL;
}

function groupKey(code) {
  return config.subjects.some((subject) => subject.code === code) ? code : '';
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
