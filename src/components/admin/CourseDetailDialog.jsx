import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Circle, Loader2, X } from 'lucide-react';
import { getAdminCourseDetail } from '../../services/api/adminService';
import { SkeletonList } from '../common/Skeleton';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-ink-50 last:border-0">
      <span className="text-ink-400 font-medium text-sm">{label}</span>
      <span className="text-ink-800 font-medium text-sm text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function CourseDetailDialog({ courseId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAdminCourseDetail(courseId)
      .then((result) => { if (active) setDetail(result); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId]);

  const course = detail?.course;
  const allLessons = course?.modules?.flatMap((module_) => module_.topics.flatMap((topic) => topic.lessons)) ?? [];
  const completionPercent = allLessons.length
    ? Math.round((allLessons.filter((lesson) => lesson.completed).length / allLessons.length) * 100)
    : null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="course-detail-title">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div>
            <h3 id="course-detail-title" className="text-[0.95rem] font-semibold text-ink-800">
              {loading ? 'Loading course...' : course?.name}
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">{detail?.owner ? `${detail.owner.first_name} ${detail.owner.last_name} · ${detail.owner.email}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-10 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading course details...
            </div>
          ) : course ? (
            <div className="flex flex-col gap-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Overview</div>
                <Row label="Difficulty" value={course.difficulty} />
                <Row label="Goal" value={course.goal} />
                <Row label="Modules" value={course.modules?.length} />
                <Row label="Completion" value={completionPercent !== null ? `${completionPercent}%` : '—'} />
                <Row label="Avg quiz score" value={detail.avgQuizScore !== null ? `${detail.avgQuizScore}%` : 'No attempts yet'} />
                <Row label="AI-generated" value={course.is_ai_generated ? 'Yes' : 'No'} />
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Modules & Lessons</div>
                <div className="flex flex-col gap-3">
                  {course.modules?.map((module_) => (
                    <div key={module_.id} className="border border-ink-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-ink-800">{module_.title}</span>
                        <span className="text-xs text-ink-400">{module_.progress_percent}%</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {module_.topics.flatMap((topic) => topic.lessons).map((lesson) => (
                          <div key={lesson.id} className="flex items-center gap-2 text-xs text-ink-600">
                            {lesson.completed ? <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" /> : <Circle size={13} className="text-ink-300 flex-shrink-0" />}
                            <span className="truncate">{lesson.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <SkeletonList count={4} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
