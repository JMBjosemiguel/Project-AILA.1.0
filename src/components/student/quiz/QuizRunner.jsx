import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, GraduationCap, Loader2, Share2, X, XCircle } from 'lucide-react';
import Button from '../../common/Button';
import ShareDialog from '../../common/ShareDialog';
import { useToast } from '../../common/Toast';
import QuizCard from '../../chatbot/QuizCard';
import {
  generateQuiz, startQuizAttempt, saveAttemptAnswer, submitAttempt, getQuizAttempt,
  startBatchQuizGeneration, appendQuizBatch, finishQuizGeneration,
} from '../../../services/api/quizService';

const QUIZ_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'identification', label: 'Identification' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const ASSESSMENT_LABEL = {
  module_checkpoint: 'Module Checkpoint',
  course_final: 'Course Final Assessment',
};

const MIN_ITEM_COUNT = 1;
const MAX_ITEM_COUNT = 150;
const PRESET_COUNTS = [5, 10, 15, 20];
// Mirrors backend quizService's SINGLE_CALL_MAX_ITEMS / BATCH_MAX_ITEMS — a
// count at or below this still uses the plain one-request generateQuiz path;
// above it, the client drives the start/batch/finish flow instead.
const SINGLE_CALL_MAX_ITEMS = 20;
const BATCH_MAX_ITEMS = 15;
const BATCH_CONCURRENCY = 3;

// itemCount is kept as a STRING in state so the field can be genuinely empty
// while the student is typing (Number('') === 0 in JS, which is why binding
// a number input straight to a numeric state produces a stuck "0" that can't
// be deleted, and later keystrokes land after it — "010" instead of "10").
// Only the value actually sent to the server gets parsed/clamped, here.
function clampItemCount(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return MIN_ITEM_COUNT;
  return Math.min(Math.max(n, MIN_ITEM_COUNT), MAX_ITEM_COUNT);
}

// Runs `jobs` (one appendQuizBatch call each) with up to BATCH_CONCURRENCY
// in flight at once, matching the server's row-lock-based concurrency-safe
// ordering. `cancelledRef.current` is checked before each NEW job starts —
// an in-flight request is always allowed to finish, only the next pickup is
// skipped, so "Cancel" stops future batches without aborting one in progress.
async function runBatchJobs(quizId, jobs, cancelledRef, onBatchSettled) {
  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      if (cancelledRef.current) return;
      const job = jobs[index];
      index += 1;
      try {
        const res = await appendQuizBatch(quizId, job);
        onBatchSettled(res, null);
      } catch (err) {
        onBatchSettled(null, err);
      }
    }
  }
  const workerCount = Math.min(BATCH_CONCURRENCY, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export default function QuizRunner({ request, resumeQuizId = null, reviewAttemptId = null, onClose }) {
  const [quizType, setQuizType] = useState('multiple_choice');
  const [difficulty, setDifficulty] = useState('medium');
  const [itemCount, setItemCount] = useState('5');
  const [showCustomCount, setShowCustomCount] = useState(false);
  const [step, setStep] = useState(reviewAttemptId ? 'starting' : resumeQuizId ? 'starting' : 'setup');
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [initialAnswers, setInitialAnswers] = useState([]);
  const [presetReview, setPresetReview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [sharing, setSharing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [shortResult, setShortResult] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const submittingRef = useRef(false);
  const batchCancelledRef = useRef(false);
  const toast = useToast();

  const attemptIdRef = useRef(null);
  const quizIdRef = useRef(resumeQuizId);
  const pendingRef = useRef(new Map());
  const chainRef = useRef(Promise.resolve());

  const drain = useCallback(async () => {
    while (pendingRef.current.size && attemptIdRef.current) {
      const [questionId, payload] = pendingRef.current.entries().next().value;
      pendingRef.current.delete(questionId);
      try {
        // eslint-disable-next-line no-await-in-loop
        await saveAttemptAnswer(attemptIdRef.current, {
          questionId, selectedAnswer: payload.selectedAnswer, currentIndex: payload.index,
        });
      } catch {
        pendingRef.current.set(questionId, payload);
        setSaveState('error');
        return;
      }
    }
    setSaveState(pendingRef.current.size ? 'error' : 'saved');
  }, []);

  const queueSave = useCallback(({ questionId, selectedAnswer, index }) => {
    if (questionId == null) return;
    pendingRef.current.set(questionId, { selectedAnswer, index });
    setSaveState('saving');
    chainRef.current = chainRef.current.then(drain, drain);
  }, [drain]);

  const flushSaves = useCallback(async () => {
    if (pendingRef.current.size) setSaveState('saving');
    chainRef.current = chainRef.current.then(drain, drain);
    await chainRef.current;
  }, [drain]);

  const beginAttempt = useCallback(async (quizId) => {
    quizIdRef.current = quizId;
    setStep('starting');
    setError('');
    try {
      const data = await startQuizAttempt(quizId);
      attemptIdRef.current = data.attempt.id;
      setAttempt(data.attempt);
      setInitialAnswers(data.answers || []);
      setQuiz({ ...data.quiz, items: data.items });
      setSaveState('idle');
      setStep('ready');
    } catch (err) {
      setError(err.message || 'Could not open this quiz. Please try again.');
      setStep('error');
    }
  }, []);

  const loadReview = useCallback(async (id) => {
    setStep('starting');
    setError('');
    try {
      const data = await getQuizAttempt(id);
      setQuiz({
        topic: data.topic,
        quizType: data.quizType,
        assessmentKind: data.assessmentKind,
        items: data.items.map((i) => ({ id: i.id, question: i.question, options: i.options })),
      });
      setPresetReview({
        answers: data.items.map((i) => ({ questionId: i.id, selectedAnswer: i.yourAnswer })),
        graded: data.items.map((i) => ({ correctAnswer: i.correctAnswer, explanation: i.explanation, isCorrect: i.isCorrect })),
      });
      setResult({ ...data, assessmentKind: data.assessmentKind });
      setStep('review');
    } catch (err) {
      setError(err.message || 'Could not load that result.');
      setStep('error');
    }
  }, []);

  useEffect(() => {
    if (reviewAttemptId) loadReview(reviewAttemptId);
    else if (resumeQuizId) beginAttempt(resumeQuizId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeQuizId, reviewAttemptId]);

  // Once generation finishes (or is cancelled), corrects item_count to the
  // real saved count and either jumps straight into the quiz (target met) or
  // shows the short-result choice (target not met).
  const settleBatchedGeneration = useCallback(async (quizId) => {
    const finished = await finishQuizGeneration(quizId);
    if (finished.actual >= finished.target) {
      await beginAttempt(quizId);
    } else {
      setShortResult({ quizId, target: finished.target, actual: finished.actual });
      setStep('batch-short-result');
    }
  }, [beginAttempt]);

  const handleBatchedGenerate = useCallback(async (count) => {
    batchCancelledRef.current = false;
    setCancelling(false);
    setStep('batch-generating');
    setError('');
    setBatchProgress({ target: count, completed: 0 });
    try {
      const started = await startBatchQuizGeneration({
        topic: request.topic, quizType, itemCount: count, difficulty,
        sourceType: request.sourceType, sourceId: request.sourceId,
      });
      setBatchProgress({ target: started.target, completed: 0 });
      const jobs = started.subtopics.map((subtopic) => ({ subtopic }));
      await runBatchJobs(started.quizId, jobs, batchCancelledRef, (res) => {
        if (res) setBatchProgress((prev) => (prev ? { ...prev, completed: Math.max(prev.completed, res.total) } : prev));
      });
      await settleBatchedGeneration(started.quizId);
    } catch (err) {
      setStep('setup');
      setError(err.message || 'Could not generate a quiz right now.');
      toast.error(err.message || 'Could not generate a quiz right now.');
    } finally {
      submittingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, quizType, difficulty, settleBatchedGeneration]);

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const count = clampItemCount(itemCount);
    if (count > SINGLE_CALL_MAX_ITEMS) {
      await handleBatchedGenerate(count);
      return;
    }
    setStep('loading');
    setError('');
    try {
      const generated = await generateQuiz({
        topic: request.topic, quizType, itemCount: count, difficulty,
        sourceType: request.sourceType, sourceId: request.sourceId,
      });
      await beginAttempt(generated.id);
    } catch (err) {
      setError(err.message || 'Could not generate a quiz right now.');
      setStep('setup');
      toast.error(err.message || 'Could not generate a quiz right now.');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleCancelBatches = () => {
    batchCancelledRef.current = true;
    setCancelling(true);
  };

  const handleUseShortResult = async () => {
    if (!shortResult) return;
    await beginAttempt(shortResult.quizId);
  };

  const handleTopUp = async () => {
    if (!shortResult) return;
    const { quizId, target, actual } = shortResult;
    batchCancelledRef.current = false;
    setCancelling(false);
    setStep('batch-generating');
    setBatchProgress({ target, completed: actual });
    const remaining = target - actual;
    const numBatches = Math.max(1, Math.ceil(remaining / BATCH_MAX_ITEMS));
    const jobs = Array.from({ length: numBatches }, () => ({}));
    try {
      await runBatchJobs(quizId, jobs, batchCancelledRef, (res) => {
        if (res) setBatchProgress((prev) => (prev ? { ...prev, completed: Math.max(prev.completed, res.total) } : prev));
      });
      await settleBatchedGeneration(quizId);
    } catch (err) {
      toast.error(err.message || 'Could not add more questions right now.');
      setShortResult({ quizId, target, actual });
      setStep('batch-short-result');
    }
  };

  const handleSubmit = async () => {
    await flushSaves();
    if (pendingRef.current.size) {
      toast.error("Some answers didn't save. Check your connection and try again.");
      throw new Error('unsaved answers');
    }
    try {
      const review = await submitAttempt(attemptIdRef.current);
      setResult(review);
      const formal = review.assessmentKind && review.assessmentKind !== 'practice';
      toast[formal && !review.passed ? 'error' : 'success'](
        formal
          ? (review.passed ? `Passed — ${review.percent}%` : `Not passed — ${review.percent}% (need ${review.passingScore}%)`)
          : 'Quiz submitted — saved to your history.'
      );
      if (review.leveledUp) toast.success(`Level up! You're now Level ${review.level}.`);
      (review.newAchievements ?? []).forEach((a) => toast.success(`Achievement unlocked: ${a.name}`));
      return review;
    } catch (err) {
      toast.error(err.message || 'Could not submit your quiz.');
      throw err;
    }
  };

  const assessmentKind = quiz?.assessmentKind && quiz.assessmentKind !== 'practice' ? quiz.assessmentKind : null;
  const passingScore = quiz?.passingScore ?? result?.passingScore ?? null;
  const headerTitle = assessmentKind
    ? ASSESSMENT_LABEL[assessmentKind]
    : step === 'ready' && quiz ? `Quiz: ${quiz.topic}` : reviewAttemptId ? 'Review' : resumeQuizId ? 'Resume quiz' : 'Generate a quiz';
  const resumedCount = step === 'ready' && !result ? initialAnswers.filter((a) => a.selectedAnswer).length : 0;
  const formalResult = result && result.assessmentKind && result.assessmentKind !== 'practice';

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="quiz-runner-title">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-surface border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div className="min-w-0">
            <h3 id="quiz-runner-title" className="text-[0.95rem] font-semibold text-ink-800 flex items-center gap-1.5">
              {assessmentKind === 'course_final' && <GraduationCap size={15} className="text-primary" />}
              {headerTitle}
            </h3>
            <p className="text-xs text-ink-400 mt-0.5 truncate">
              {quiz?.topic || request?.topic || '—'}
              {assessmentKind && passingScore != null && <span> · Passing {passingScore}%</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'setup' && (
            <>
              {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-xs font-semibold text-ink-600 mb-1.5 block">Quiz type</span>
                  <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Quiz type">
                    {QUIZ_TYPES.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setQuizType(option.value)}
                        role="radio"
                        aria-checked={quizType === option.value}
                        className={[
                          'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
                          quizType === option.value ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-ink-600 mb-1.5 block">Difficulty</span>
                  <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Difficulty">
                    {DIFFICULTIES.map((option) => (
                      <button
                        key={option}
                        onClick={() => setDifficulty(option)}
                        role="radio"
                        aria-checked={difficulty === option}
                        className={[
                          'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
                          difficulty === option ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
                        ].join(' ')}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-ink-600 mb-1.5 block">Number of items</span>
                  <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Number of items">
                    {PRESET_COUNTS.map((n) => {
                      const active = !showCustomCount && itemCount === String(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => { setShowCustomCount(false); setItemCount(String(n)); }}
                          role="radio"
                          aria-checked={active}
                          className={[
                            'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
                            active ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
                          ].join(' ')}
                        >
                          {n}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowCustomCount(true)}
                      role="radio"
                      aria-checked={showCustomCount}
                      className={[
                        'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
                        showCustomCount ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
                      ].join(' ')}
                    >
                      Custom
                    </button>
                  </div>
                  {showCustomCount && (
                    <label className="block mt-2">
                      <span className="sr-only">Custom number of items</span>
                      <input
                        id="quiz-item-count"
                        type="number"
                        min={MIN_ITEM_COUNT}
                        max={MAX_ITEM_COUNT}
                        value={itemCount}
                        onChange={(event) => setItemCount(event.target.value)}
                        placeholder="1-150"
                        className="w-24 border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
                      />
                    </label>
                  )}
                  {clampItemCount(itemCount) > SINGLE_CALL_MAX_ITEMS && (
                    <p className="text-xs text-ink-400 mt-1.5">
                      Quizzes above {SINGLE_CALL_MAX_ITEMS} items are generated in batches — this can take a minute or two.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {(step === 'loading' || step === 'starting') && (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-10 justify-center">
              <Loader2 size={16} className="animate-spin" />
              {step === 'loading' ? 'AILA is generating your assessment...' : 'Opening...'}
            </div>
          )}

          {step === 'batch-generating' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 size={20} className="animate-spin text-primary" />
              <p className="text-sm text-ink-700 font-medium">
                Generating questions… {batchProgress?.completed ?? 0} of {batchProgress?.target ?? 0}
              </p>
              <div
                className="w-full max-w-xs h-2 rounded-full bg-ink-100 overflow-hidden"
                role="progressbar"
                aria-valuenow={batchProgress?.completed ?? 0}
                aria-valuemin={0}
                aria-valuemax={batchProgress?.target ?? 0}
              >
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${batchProgress?.target ? Math.min(100, (batchProgress.completed / batchProgress.target) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-ink-400">This can take a minute or two for large quizzes.</p>
              <Button size="sm" variant="outline" onClick={handleCancelBatches} disabled={cancelling}>
                {cancelling ? 'Finishing up…' : 'Cancel'}
              </Button>
            </div>
          )}

          {step === 'batch-short-result' && shortResult && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle size={20} className="text-amber-500" />
              <p className="text-sm text-ink-700 font-medium">
                AILA made {shortResult.actual} of {shortResult.target} questions.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUseShortResult}>Use these {shortResult.actual}</Button>
                <Button size="sm" variant="outline" onClick={handleTopUp}>Try to add the rest</Button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle size={22} className="text-amber-500" />
              <p className="text-sm text-ink-600">{error || 'Something went wrong.'}</p>
              {quizIdRef.current && !reviewAttemptId && (
                <Button size="sm" variant="outline" onClick={() => beginAttempt(quizIdRef.current)}>Try again</Button>
              )}
            </div>
          )}

          {(step === 'ready' || step === 'review') && quiz && (
            <div>
              {quiz.id && step === 'ready' && !result && !assessmentKind && (
                <button
                  type="button"
                  onClick={() => setSharing(true)}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-600"
                >
                  <Share2 size={13} /> Share this quiz
                </button>
              )}
              {formalResult && (
                <div className={`mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${result.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {result.passed ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> : <XCircle size={16} className="mt-0.5 flex-shrink-0" />}
                  <div>
                    <p className="font-semibold">
                      {result.passed ? 'Passed' : 'Not passed'} — {result.percent}% (passing {result.passingScore}%)
                    </p>
                    {!result.passed && result.recommendation?.message && (
                      <p className="text-xs mt-0.5 text-rose-600">{result.recommendation.message}</p>
                    )}
                  </div>
                </div>
              )}
              {resumedCount > 0 && (
                <p className="text-xs text-ink-400 mb-3">Resumed — {resumedCount} saved answer{resumedCount === 1 ? '' : 's'} restored.</p>
              )}
              <QuizCard
                quiz={quiz}
                onSubmit={step === 'review' ? undefined : handleSubmit}
                presetReview={presetReview}
                initialAnswers={initialAnswers}
                initialIndex={attempt?.currentIndex ?? 0}
                onAnswerChange={step === 'review' ? undefined : queueSave}
                saveState={saveState}
                onRetrySave={flushSaves}
              />
              {result && !formalResult && (
                <p className="text-center text-xs text-ink-400 mt-2">
                  Saved to your quiz history{result.xpAwarded > 0 ? ` · +${result.xpAwarded} XP` : ''}
                </p>
              )}
              {formalResult && result.passed && result.xpAwarded > 0 && (
                <p className="text-center text-xs text-emerald-600 mt-2 font-semibold">+{result.xpAwarded} XP earned</p>
              )}
            </div>
          )}
        </div>

        {step === 'setup' && (
          <div className="flex-shrink-0 border-t border-ink-100 px-5 py-4">
            <Button full onClick={handleGenerate}>Generate quiz</Button>
          </div>
        )}
      </div>

      {sharing && quiz?.id && (
        <ShareDialog materialType="quiz" materialId={quiz.id} materialName={quiz.topic} onClose={() => setSharing(false)} />
      )}
    </div>,
    document.body
  );
}
