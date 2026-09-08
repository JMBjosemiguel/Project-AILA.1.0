import { useCallback } from 'react';
import { getCourseAssessments } from '../services/api/learningService';
import { useAsyncData } from './useAsyncData';

// The module checkpoint / course final status map for one course. `refreshKey`
// bumps to re-fetch after an attempt is submitted.
export function useCourseAssessments(subjectId, refreshKey = 0) {
  const loader = useCallback(() => getCourseAssessments(subjectId), [subjectId]);
  return useAsyncData(loader, [subjectId, refreshKey]);
}
