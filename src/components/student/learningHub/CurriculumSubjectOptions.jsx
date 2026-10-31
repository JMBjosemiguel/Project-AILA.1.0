import { CURRICULUM_SUBJECT_GROUPS, OTHERS_SUBJECT_LABEL } from '../../../constants/curriculumSubjects';

// The <option>s for a curriculum-subject <select>: one <optgroup> per term
// (1st Semester, 2nd Semester, Summer), then "Others" (value '' = no subject).
export default function CurriculumSubjectOptions() {
  return (
    <>
      {CURRICULUM_SUBJECT_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
      ))}
      <option value="">{OTHERS_SUBJECT_LABEL}</option>
    </>
  );
}
