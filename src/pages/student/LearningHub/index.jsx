import { BookOpen, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonGrid } from '../../../components/common/Skeleton';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import AddCourseWizard from '../../../components/student/learningHub/AddCourseWizard';
import LessonDetailPanel from '../../../components/student/learningHub/LessonDetailPanel';
import SubjectCard from '../../../components/student/learningHub/SubjectCard';
import QuizRunner from '../../../components/student/quiz/QuizRunner';
import { useLearningHubData } from '../../../hooks/useLearningHubData';
import { deleteCourse } from '../../../services/api/learningService';
import { setPrefillPrompt } from '../../../utils/aiPrefill';
import { consumeResumeLesson } from '../../../utils/learningHubTarget';

export default function LearningHubPage({ onNavigate }) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading } = useLearningHubData(refreshVersion);
  const [search, setSearch] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [quizRequest, setQuizRequest] = useState(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const subjects = data?.subjects ?? [];
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    const resumeId = consumeResumeLesson();
    if (resumeId) setSelectedLessonId(resumeId);
  }, []);

  const filtered = useMemo(() => (
    search ? subjects.filter((subject) => subject.name.toLowerCase().includes(search.toLowerCase())) : subjects
  ), [subjects, search]);

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
            placeholder="Search subjects..."
            className="flex-1 outline-none text-sm bg-transparent placeholder:text-ink-400"
          />
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setAddingCourse(true)}>Add course</Button>
      </div>

      {loading ? (
        <SkeletonGrid count={4} />
      ) : filtered.length ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} onSelectLesson={setSelectedLessonId} onDelete={handleDeleteCourse} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          message="Generate your first AI-powered course."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setAddingCourse(true)}>Generate Course</Button>}
        />
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
