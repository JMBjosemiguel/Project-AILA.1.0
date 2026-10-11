import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import PersonalizedBadge from '../../common/PersonalizedBadge';
import { useToast } from '../../common/Toast';
import { useMobileDrawer } from '../../../hooks/useMobileDrawer';
import MarkdownRenderer from '../../chatbot/MarkdownRenderer';
import { getLesson, completeLesson } from '../../../services/api/learningService';
import { getStudyToolObjectives } from '../../../services/api/aiToolsService';

const DIFFICULTY_STYLE = {
  easy: 'bg-emerald-50 text-emerald-600',
  medium: 'bg-amber-50 text-amber-700',
  hard: 'bg-rose-50 text-rose-600',
};

const FOCUSABLE_SELECTOR = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

// A full-screen "preview a file" reader (like Google Drive), replacing the old
// inline LessonDetailPanel. Every way of opening a lesson across the app
// renders this same component — see LearningHubPage.
export default function LessonReader({
  lessonId, onClose, onCompleted, onAskAila, onGenerateQuiz,
  hasPrevious = false, hasNext = false, onPrevious, onNext,
  previousLessonTitle, nextLessonTitle,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [objectives, setObjectives] = useState(null);
  const [objectivesLoading, setObjectivesLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const toast = useToast();

  const containerRef = useRef(null);
  const contentScrollRef = useRef(null);
  const closeButtonRef = useRef(null);
  // Captured once at mount — this is whatever the student just clicked (a
  // lesson row, Continue, a search result, ...) so closing can restore it.
  const triggerRef = useRef(document.activeElement);
  const closedByPopRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setDetail(null);
    setObjectives(null);
    setScrollProgress(0);
    contentScrollRef.current?.scrollTo(0, 0);

    getLesson(lessonId)
      .then((data) => { if (active) setDetail(data); })
      .catch((err) => { if (active) setError(err.message || 'Could not load this lesson.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [lessonId, reloadKey]);

  // The browser Back button closes the reader instead of leaving the page —
  // push one history marker on open, and route EVERY close path (X, Escape,
  // Back) through history.back() so there is exactly one popstate per open,
  // never an orphaned forward-history entry or a "dead" extra Back press.
  useEffect(() => {
    window.history.pushState({ lessonReader: true }, '', window.location.pathname);
    const handlePopState = () => {
      closedByPopRef.current = true;
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = useCallback(() => {
    if (closedByPopRef.current) return;
    window.history.back();
  }, []);

  // Scroll lock + Escape -> requestClose (shared with the app's drawers).
  useMobileDrawer(true, requestClose);

  // Focus moves into the dialog on open, and back to the trigger on close.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const trigger = triggerRef.current;
    return () => { trigger?.focus?.(); };
  }, []);

  const handleKeyDownTrap = (event) => {
    if (event.key !== 'Tab' || !containerRef.current) return;
    const focusables = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleContentScroll = () => {
    const el = contentScrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrollProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
  };

  const contentUnavailable = detail && !loading && !detail.lesson.content;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const result = await completeLesson(lessonId);
      setDetail((current) => (current ? { ...current, lesson: { ...current.lesson, completed: true } } : current));
      if (!result?.alreadyCompleted) {
        toast.success(`Lesson completed. +${result?.xpAwarded ?? 10} XP earned.`);
        if (result?.leveledUp) toast.success(`Level up! You're now Level ${result.level}.`);
        (result?.newAchievements ?? []).forEach((a) => toast.success(`Achievement unlocked: ${a.name}`));
      }
      onCompleted?.();
    } catch (err) {
      // Toast only — `error` is the full-reader "couldn't load this lesson"
      // state; setting it here replaced the lesson content with an error box
      // even though the lesson was sitting right there, fully loaded.
      toast.error(err.message || 'Could not mark this lesson complete.');
    } finally {
      setCompleting(false);
    }
  };

  const handleObjectives = async () => {
    if (objectives || !detail) return;
    setObjectivesLoading(true);
    try {
      const result = await getStudyToolObjectives(detail.topic.title);
      setObjectives(result.objectives);
    } catch (err) {
      setObjectives(`_Could not generate objectives: ${err.message || 'please try again.'}_`);
    } finally {
      setObjectivesLoading(false);
    }
  };

  return createPortal(
    <div
      ref={containerRef}
      onKeyDown={handleKeyDownTrap}
      className="fixed inset-0 z-[110] bg-surface flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-reader-title"
    >
      <div className="flex-shrink-0 bg-surface border-b border-ink-100">
        <div className="h-0.5 bg-ink-100 overflow-hidden">
          <div className="h-full bg-primary transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
        </div>
        <div className="max-w-[760px] mx-auto flex items-start justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="min-w-0">
            {detail && (
              <p className="text-xs text-ink-400 truncate">{detail.subject.name} / {detail.module.title} / {detail.topic.title}</p>
            )}
            <h2 id="lesson-reader-title" className="text-base font-display font-semibold text-ink-800 truncate">
              {detail?.lesson.title ?? 'Loading lesson...'}
            </h2>
            {detail && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize ${DIFFICULTY_STYLE[detail.lesson.difficulty] ?? DIFFICULTY_STYLE.medium}`}>
                  {detail.lesson.difficulty}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                  <Clock size={12} /> ~{detail.lesson.estimated_minutes} min
                </span>
                <PersonalizedBadge level={detail.lesson.personalizationLevel} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous lesson"
              title={hasPrevious ? previousLessonTitle : undefined}
              className="h-8 px-2 flex items-center justify-center gap-1 rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft size={17} />
              <span className="hidden lg:inline text-xs font-semibold">Previous</span>
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next lesson"
              title={hasNext ? nextLessonTitle : undefined}
              className="h-8 px-2 flex items-center justify-center gap-1 rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800 disabled:opacity-30 disabled:pointer-events-none"
            >
              <span className="hidden lg:inline text-xs font-semibold">Next</span>
              <ChevronRight size={17} />
            </button>
            <button
              ref={closeButtonRef}
              onClick={requestClose}
              aria-label="Close lesson"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800 ml-1"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      </div>

      <div ref={contentScrollRef} onScroll={handleContentScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-6">
          {loading && (
            <div className="flex flex-col items-center gap-1 text-sm text-ink-400 py-10 justify-center">
              <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading lesson...</span>
              <span className="text-xs text-ink-400">A new lesson can take up to a minute to generate.</span>
            </div>
          )}

          {error && !loading && <EmptyState title="Could not load lesson" message={error} />}

          {detail && !loading && (
            <div className="flex flex-col gap-5">
              {detail.prerequisiteLesson && !detail.prerequisiteLesson.completed && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  For the best experience, complete <span className="font-semibold">&quot;{detail.prerequisiteLesson.title}&quot;</span> first.
                </div>
              )}

              {contentUnavailable ? (
                <div className="flex flex-col items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>AILA couldn&apos;t write this lesson just now. Your progress is safe — try again in a moment.</span>
                  <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button>
                </div>
              ) : (
                <MarkdownRenderer text={detail.lesson.content} />
              )}

              <div>
                <button
                  onClick={handleObjectives}
                  disabled={objectivesLoading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-600 disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  {objectivesLoading ? 'Generating objectives...' : objectives ? 'Learning objectives' : 'Generate learning objectives with AILA'}
                </button>
                {objectives && (
                  <div className="mt-2 bg-primary-50/60 border border-primary-100 rounded-xl p-3">
                    <MarkdownRenderer text={objectives} />
                  </div>
                )}
              </div>

              {detail.definitions.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Key terms</div>
                  <div className="flex flex-col gap-2">
                    {detail.definitions.map((item) => (
                      <div key={item.id} className="text-sm">
                        <span className="font-semibold text-ink-800">{item.term}:</span>{' '}
                        <span className="text-ink-600">{item.definition_text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.examples.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Examples</div>
                  <div className="flex flex-col gap-2">
                    {detail.examples.map((item) => (
                      <div key={item.id} className="text-sm text-ink-600 bg-ink-50 rounded-lg p-2.5">
                        {item.title && <p className="font-semibold text-ink-800 mb-0.5">{item.title}</p>}
                        {item.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.relatedResources.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Related resources</div>
                  <div className="flex flex-col gap-1.5">
                    {detail.relatedResources.map((resource) => (
                      <div key={resource.id} className="flex items-center gap-2 text-sm text-ink-600">
                        <ExternalLink size={13} className="text-ink-300 flex-shrink-0" />
                        {resource.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {detail && !loading && (
        <div className="flex-shrink-0 bg-surface border-t border-ink-100 px-4 sm:px-6 py-3">
          <div className="max-w-[760px] mx-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<Sparkles size={14} />}
              onClick={() => onAskAila?.(`Can you help me understand "${detail.lesson.title}" from ${detail.subject.name}?`)}
            >
              Ask AILA
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGenerateQuiz?.({ sourceType: 'lesson', sourceId: detail.lesson.id, topic: detail.topic.title })}
            >
              Generate Quiz
            </Button>
            <Button
              variant={detail.lesson.completed ? 'subtle' : 'outline'}
              size="sm"
              icon={<CheckCircle2 size={14} />}
              onClick={handleComplete}
              disabled={detail.lesson.completed || completing}
              className={detail.lesson.completed ? '!bg-emerald-50 !text-emerald-600 !opacity-100' : ''}
            >
              {detail.lesson.completed ? 'Completed' : completing ? 'Saving...' : 'Mark Complete'}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
