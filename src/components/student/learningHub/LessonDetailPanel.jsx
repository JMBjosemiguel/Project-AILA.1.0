import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import Button from '../../common/Button';
import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { useToast } from '../../common/Toast';
import MarkdownRenderer from '../../chatbot/MarkdownRenderer';
import { getLesson, completeLesson } from '../../../services/api/learningService';
import { getStudyToolObjectives } from '../../../services/api/aiToolsService';

const DIFFICULTY_STYLE = {
  easy: 'bg-emerald-50 text-emerald-600',
  medium: 'bg-amber-50 text-amber-700',
  hard: 'bg-rose-50 text-rose-600',
};

export default function LessonDetailPanel({ lessonId, onClose, onCompleted, onAskAila, onGenerateQuiz }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [objectives, setObjectives] = useState(null);
  const [objectivesLoading, setObjectivesLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setObjectives(null);

    getLesson(lessonId)
      .then((data) => { if (active) setDetail(data); })
      .catch((err) => { if (active) setError(err.message || 'Could not load this lesson.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [lessonId]);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await completeLesson(lessonId);
      setDetail((current) => (current ? { ...current, lesson: { ...current.lesson, completed: true } } : current));
      toast.success('Lesson completed. +10 XP earned.');
      onCompleted?.();
    } catch (err) {
      setError(err.message || 'Could not mark this lesson complete.');
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

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {detail && (
            <p className="text-xs text-ink-400 mb-1">{detail.subject.name} / {detail.module.title} / {detail.topic.title}</p>
          )}
          <h3 className="text-base font-display font-semibold text-ink-800">{detail?.lesson.title ?? 'Loading lesson...'}</h3>
          {detail && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize ${DIFFICULTY_STYLE[detail.lesson.difficulty] ?? DIFFICULTY_STYLE.medium}`}>
                {detail.lesson.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                <Clock size={12} /> ~{detail.lesson.estimated_minutes} min
              </span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-ink-400 py-6 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading lesson...
        </div>
      )}

      {error && !loading && <EmptyState title="Could not load lesson" message={error} />}

      {detail && !loading && (
        <div className="flex flex-col gap-5">
          {detail.prerequisiteLesson && !detail.prerequisiteLesson.completed && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              For the best experience, complete <span className="font-semibold">"{detail.prerequisiteLesson.title}"</span> first.
            </div>
          )}

          <MarkdownRenderer text={detail.lesson.content} />

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

          <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-100">
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
            >
              {detail.lesson.completed ? 'Completed' : completing ? 'Saving...' : 'Mark Complete'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
