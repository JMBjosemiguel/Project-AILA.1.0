import { useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, GraduationCap, Loader2, Lock, PlayCircle, RotateCcw } from 'lucide-react';
import Button from '../../common/Button';
import { useToast } from '../../common/Toast';
import { useCourseAssessments } from '../../../hooks/useCourseAssessments';
import { openModuleCheckpoint, openCourseFinal } from '../../../services/api/learningService';

const STATUS_LABEL = {
  locked: 'Locked',
  ready: 'Ready',
  in_progress: 'In progress',
  failed: 'Needs retry',
  passed: 'Passed',
};
const STATUS_STYLE = {
  locked: 'bg-ink-100 text-ink-400',
  ready: 'bg-primary-50 text-primary',
  in_progress: 'bg-amber-50 text-amber-700',
  failed: 'bg-rose-50 text-rose-600',
  passed: 'bg-emerald-50 text-emerald-600',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[status] || STATUS_STYLE.locked}`}>
      {status === 'locked' && <Lock size={9} />}
      {status === 'passed' && <CheckCircle2 size={9} />}
      {status === 'failed' && <AlertCircle size={9} />}
      {STATUS_LABEL[status] || status}
    </span>
  );
}

// One assessment row (a module checkpoint or the course final).
function AssessmentRow({ title, kind, state, lockedHint, busy, onTake, onResume, onReview }) {
  const { status, passingScore, bestScore, latestScore, itemCount } = state;
  const scoreLine = status === 'passed'
    ? `Passed · best ${bestScore}%`
    : status === 'failed'
      ? `Score ${latestScore}% · need ${passingScore}%`
      : status === 'ready' || status === 'in_progress'
        ? `Passing score ${passingScore}%${itemCount ? ` · ${itemCount} questions` : ''}`
        : lockedHint;

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-ink-700 truncate">{title}</span>
          <StatusBadge status={status} />
        </div>
        <p className="text-[0.7rem] text-ink-400 mt-0.5">{scoreLine}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {status === 'ready' && (
          <Button size="sm" disabled={busy} icon={busy ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />} onClick={onTake}>
            {kind === 'course_final' ? 'Start final' : 'Take'}
          </Button>
        )}
        {status === 'in_progress' && (
          <Button size="sm" disabled={busy} icon={busy ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />} onClick={onResume}>Resume</Button>
        )}
        {status === 'failed' && (
          <>
            <Button size="sm" variant="outline" onClick={onReview}>Review</Button>
            <Button size="sm" disabled={busy} icon={busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} onClick={onTake}>Retake</Button>
          </>
        )}
        {status === 'passed' && (
          <Button size="sm" variant="outline" onClick={onReview}>Review</Button>
        )}
      </div>
    </div>
  );
}

export default function CourseAssessments({ subjectId, refreshKey = 0, onLaunchAssessment }) {
  const { data, loading, error } = useCourseAssessments(subjectId, refreshKey);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  const launch = async (id, fn, meta) => {
    setBusyId(id);
    try {
      const take = await fn();
      onLaunchAssessment({ quizId: take.id, assessmentKind: take.assessmentKind, passingScore: take.passingScore, ...meta });
    } catch (err) {
      toast.error(err.message || 'Could not open that assessment.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="px-4 py-3 text-xs text-ink-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading assessments…</div>;
  }
  if (error || !data) {
    return <div className="px-4 py-3 text-xs text-ink-400">Assessments are unavailable right now.</div>;
  }

  return (
    <div className="border-t border-ink-100 bg-ink-50/30 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink-400 mb-1.5">
        <ClipboardCheck size={11} /> Assessments
      </div>

      <div className="divide-y divide-ink-100">
        {data.modules.map((module_) => (
          <AssessmentRow
            key={module_.moduleId}
            title={`Checkpoint — ${module_.title}`}
            kind="module_checkpoint"
            state={module_.checkpoint}
            lockedHint={`Complete this module's lessons to unlock (${module_.completedTopics}/${module_.totalTopics} topics done)`}
            busy={busyId === `cp-${module_.moduleId}`}
            onTake={() => launch(`cp-${module_.moduleId}`, () => openModuleCheckpoint(subjectId, module_.moduleId))}
            onResume={() => launch(`cp-${module_.moduleId}`, () => openModuleCheckpoint(subjectId, module_.moduleId))}
            onReview={() => onLaunchAssessment({ reviewAttemptId: module_.checkpoint.reviewAttemptId, assessmentKind: 'module_checkpoint' })}
          />
        ))}

        <div className="pt-2">
          <div className="flex items-center gap-1.5 mb-1">
            <GraduationCap size={13} className="text-primary" />
            <span className="text-xs font-bold text-ink-800">Course Final — Long Test</span>
          </div>
          <AssessmentRow
            title={data.courseName}
            kind="course_final"
            state={data.final}
            lockedHint="Pass every module checkpoint to unlock the course final"
            busy={busyId === 'final'}
            onTake={() => launch('final', () => openCourseFinal(subjectId))}
            onResume={() => launch('final', () => openCourseFinal(subjectId))}
            onReview={() => onLaunchAssessment({ reviewAttemptId: data.final.reviewAttemptId, assessmentKind: 'course_final' })}
          />
        </div>
      </div>

      {data.courseCompleted && (
        <p className="mt-2 text-[0.7rem] font-semibold text-emerald-600 flex items-center gap-1">
          <CheckCircle2 size={12} /> Course complete — all lessons done and every assessment passed.
        </p>
      )}
    </div>
  );
}
