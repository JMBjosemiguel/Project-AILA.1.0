import { BookOpen, FileText, FolderOpen, ListChecks, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import EmptyState from '../../../components/common/EmptyState';
import LoadError from '../../../components/common/LoadError';
import { SkeletonGrid } from '../../../components/common/Skeleton';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import AddCourseWizard from '../../../components/student/learningHub/AddCourseWizard';
import LessonDetailPanel from '../../../components/student/learningHub/LessonDetailPanel';
import SubjectCard from '../../../components/student/learningHub/SubjectCard';
import QuizRunner from '../../../components/student/quiz/QuizRunner';
import { useLearningHubData } from '../../../hooks/useLearningHubData';
import { deleteCourse } from '../../../services/api/learningService';
import { getResourceLibraryData } from '../../../services/api/resourceService';
import { searchQuizzes } from '../../../services/api/quizService';
import { setPrefillPrompt } from '../../../utils/aiPrefill';
import { consumeResumeLesson } from '../../../utils/learningHubTarget';
import { consumeResumeQuiz } from '../../../utils/quizResumeTarget';
import { setResourceSearchTarget } from '../../../utils/resourceSearchTarget';

function matchesSearch(value, query) {
  return String(value ?? '').toLowerCase().includes(query);
}

function subjectMatchesSearch(subject, query) {
  if (!query) return true;

  const subjectFields = [
    subject.name,
    subject.code,
    subject.description,
    subject.difficulty,
    subject.goal,
  ];

  if (subjectFields.some((value) => matchesSearch(value, query))) {
    return true;
  }

  return (subject.modules ?? []).some((module) => (
    matchesSearch(module.title, query) ||
    (module.topics ?? []).some((topic) => (
      matchesSearch(topic.title, query) ||
      (topic.lessons ?? []).some((lesson) => matchesSearch(lesson.title, query))
    ))
  ));
}

// Flat, directly-clickable lesson matches (title only) — distinct from
// subjectMatchesSearch above, which also matches a lesson's parent module/topic
// so the right course card still surfaces in the main grid.
function collectMatchingLessons(subjects, query) {
  if (!query) return [];

  const matches = [];
  for (const subject of subjects) {
    for (const module_ of subject.modules ?? []) {
      for (const topic of module_.topics ?? []) {
        for (const lesson of topic.lessons ?? []) {
          if (matchesSearch(lesson.title, query)) {
            matches.push({ id: lesson.id, title: lesson.title, subjectName: subject.name });
          }
        }
      }
    }
  }
  return matches;
}

const ASSESSMENT_KIND_LABEL = {
  module_checkpoint: 'Module Checkpoint',
  course_final: 'Course Final',
};

function quizResultSubtitle(quiz) {
  if (quiz.assessmentKind && quiz.assessmentKind !== 'practice') {
    return ASSESSMENT_KIND_LABEL[quiz.assessmentKind] || quiz.assessmentKind;
  }
  return quiz.difficulty ? `${quiz.difficulty} practice quiz` : 'Practice quiz';
}

export default function LearningHubPage({ onNavigate }) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading, error } = useLearningHubData(refreshVersion);
  const [search, setSearch] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [quizRequest, setQuizRequest] = useState(null);
  const [resumeQuizId, setResumeQuizId] = useState(null);
  const [assessmentLaunch, setAssessmentLaunch] = useState(null); // { quizId? , reviewAttemptId? }
  const [assessmentsRefreshKey, setAssessmentsRefreshKey] = useState(0);
  const [addingCourse, setAddingCourse] = useState(false);
  const [extraResults, setExtraResults] = useState({ quizzes: [], resources: [] });
  const [extraLoading, setExtraLoading] = useState(false);
  const searchRequestRef = useRef(0);
  const subjects = data?.subjects ?? [];
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    const resumeId = consumeResumeLesson();
    if (resumeId) setSelectedLessonId(resumeId);
    const resumeQuiz = consumeResumeQuiz();
    if (resumeQuiz) setResumeQuizId(resumeQuiz);
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(() => (
    normalizedSearch ? subjects.filter((subject) => subjectMatchesSearch(subject, normalizedSearch)) : subjects
  ), [subjects, normalizedSearch]);
  const matchingLessons = useMemo(() => (
    collectMatchingLessons(subjects, normalizedSearch)
  ), [subjects, normalizedSearch]);

  // Courses and lessons are matched client-side against data already loaded for
  // this page. Quizzes and resources live elsewhere, so they're only fetched
  // (debounced) once the student actually searches — never on normal page load.
  const runExtraSearch = useCallback(async (term) => {
    const requestId = (searchRequestRef.current += 1);
    if (!term) {
      setExtraResults({ quizzes: [], resources: [] });
      return;
    }

    setExtraLoading(true);
    try {
      const [quizData, resourceData] = await Promise.all([
        searchQuizzes(term),
        getResourceLibraryData({ search: term }),
      ]);
      if (searchRequestRef.current !== requestId) return;
      setExtraResults({
        quizzes: quizData?.quizzes ?? [],
        resources: resourceData?.resources ?? [],
      });
    } catch {
      if (searchRequestRef.current === requestId) setExtraResults({ quizzes: [], resources: [] });
    } finally {
      if (searchRequestRef.current === requestId) setExtraLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!normalizedSearch) {
      setExtraResults({ quizzes: [], resources: [] });
      return undefined;
    }
    const timer = setTimeout(() => runExtraSearch(normalizedSearch), 300);
    return () => clearTimeout(timer);
  }, [normalizedSearch, runExtraSearch]);

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runExtraSearch(normalizedSearch);
    }
  };

  const handleOpenLesson = (lessonId) => {
    setSearch('');
    setSelectedLessonId(lessonId);
  };

  const handleOpenQuiz = (quizId) => {
    setSearch('');
    setResumeQuizId(quizId);
  };

  const handleOpenResource = () => {
    setResourceSearchTarget(normalizedSearch);
    setSearch('');
    onNavigate?.('resources');
  };

  const handleAskAila = (prompt) => {
    setPrefillPrompt(prompt);
    onNavigate?.('assistant');
  };

  const handleDeleteCourse = async (subject) => {
    const ok = await confirm({
      title: 'Delete this course?',
      message: `This removes "${subject.name}"'s roadmap and progress. Your quiz history stays intact.`,
    });
    if (!ok) return;

    try {
      await deleteCourse(subject.id);
      toast.success('Course deleted.');
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      toast.error(error.message || 'Could not delete that course.');
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-ink-100 focus-within:border-primary-300 rounded-xl px-3.5 py-2.5 max-w-sm w-full sm:w-auto">
          <Search size={16} className="text-ink-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search subjects..."
            aria-label="Search your courses, lessons, quizzes, and resources"
            className="flex-1 outline-none text-sm bg-transparent placeholder:text-ink-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="text-ink-300 hover:text-ink-600 flex-shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setAddingCourse(true)}>Add course</Button>
      </div>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <LoadError
          title="Couldn't load your courses"
          message={error.message || 'Something went wrong loading your courses.'}
          onRetry={() => setRefreshVersion((version) => version + 1)}
        />
      ) : (
        <>
          {normalizedSearch && <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Courses</h2>}
          {filtered.length ? (
            <div className="grid sm:grid-cols-2 gap-4 items-start">
              {filtered.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  onSelectLesson={setSelectedLessonId}
                  onDelete={handleDeleteCourse}
                  onLaunchAssessment={setAssessmentLaunch}
                  assessmentsRefreshKey={assessmentsRefreshKey}
                />
              ))}
            </div>
          ) : subjects.length ? (
            <EmptyState
              icon={Search}
              title="No matching courses"
              message="Try a different search term."
            />
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              message="Generate your first AI-powered course."
              action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setAddingCourse(true)}>Generate Course</Button>}
            />
          )}
        </>
      )}

      {normalizedSearch && matchingLessons.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Lessons</h2>
          <div className="flex flex-col gap-2">
            {matchingLessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => handleOpenLesson(lesson.id)}
                className="w-full flex items-center gap-3 bg-white border border-ink-100 hover:border-primary-200 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="w-8 h-8 rounded-lg bg-ink-50 text-ink-400 flex items-center justify-center flex-shrink-0">
                  <FileText size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-800 truncate">{lesson.title}</span>
                  <span className="block text-xs text-ink-400 truncate">in {lesson.subjectName}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {normalizedSearch && extraResults.quizzes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Quizzes</h2>
          <div className="flex flex-col gap-2">
            {extraResults.quizzes.map((quiz) => (
              <button
                key={quiz.id}
                type="button"
                onClick={() => handleOpenQuiz(quiz.id)}
                className="w-full flex items-center gap-3 bg-white border border-ink-100 hover:border-primary-200 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="w-8 h-8 rounded-lg bg-ink-50 text-ink-400 flex items-center justify-center flex-shrink-0">
                  <ListChecks size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-800 truncate">{quiz.topic}</span>
                  <span className="block text-xs text-ink-400 truncate capitalize">{quizResultSubtitle(quiz)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {normalizedSearch && extraResults.resources.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Resources</h2>
          <div className="flex flex-col gap-2">
            {extraResults.resources.map((resource) => (
              <button
                key={resource.id}
                type="button"
                onClick={handleOpenResource}
                className="w-full flex items-center gap-3 bg-white border border-ink-100 hover:border-primary-200 rounded-xl px-4 py-3 text-left transition-colors"
              >
                <span className="w-8 h-8 rounded-lg bg-ink-50 text-ink-400 flex items-center justify-center flex-shrink-0">
                  <FolderOpen size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-800 truncate">{resource.title}</span>
                  <span className="block text-xs text-ink-400 truncate capitalize">{resource.type}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {normalizedSearch && extraLoading && (
        <p className="text-xs text-ink-400 mt-4">Searching quizzes and resources&hellip;</p>
      )}

      {selectedLessonId && (
        <LessonDetailPanel
          lessonId={selectedLessonId}
          onClose={() => setSelectedLessonId(null)}
          onCompleted={() => setRefreshVersion((version) => version + 1)}
          onAskAila={handleAskAila}
          onGenerateQuiz={setQuizRequest}
        />
      )}

      {quizRequest && <QuizRunner request={quizRequest} onClose={() => setQuizRequest(null)} />}

      {resumeQuizId && (
        <QuizRunner
          resumeQuizId={resumeQuizId}
          onClose={() => {
            setResumeQuizId(null);
            setRefreshVersion((version) => version + 1);
          }}
        />
      )}

      {assessmentLaunch && (
        <QuizRunner
          resumeQuizId={assessmentLaunch.quizId ?? null}
          reviewAttemptId={assessmentLaunch.reviewAttemptId ?? null}
          onClose={() => {
            setAssessmentLaunch(null);
            setAssessmentsRefreshKey((key) => key + 1);
            setRefreshVersion((version) => version + 1);
          }}
        />
      )}

      {addingCourse && (
        <AddCourseWizard
          onClose={() => setAddingCourse(false)}
          onGenerated={() => {
            setAddingCourse(false);
            setRefreshVersion((version) => version + 1);
          }}
        />
      )}
    </div>
  );
}
