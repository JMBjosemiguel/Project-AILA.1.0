import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, GraduationCap, Loader2, Share2, X, XCircle } from 'lucide-react';
import Button from '../../common/Button';
import ShareDialog from '../../common/ShareDialog';
import { useToast } from '../../common/Toast';
import QuizCard from '../../chatbot/QuizCard';
import { generateQuiz, startQuizAttempt, saveAttemptAnswer, submitAttempt, getQuizAttempt } from '../../../services/api/quizService';

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

export default function QuizRunner({ request, resumeQuizId = null, reviewAttemptId = null, onClose }) {
  const [quizType, setQuizType] = useState('multiple_choice');
  const [difficulty, setDifficulty] = useState('medium');
  const [itemCount, setItemCount] = useState(5);
  const [step, setStep] = useState(reviewAttemptId ? 'starting' : resumeQuizId ? 'starting' : 'setup');
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [initialAnswers, setInitialAnswers] = useState([]);
  const [presetReview, setPresetReview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [sharing, setSharing] = useState(false);
  const submittingRef = useRef(false);
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

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStep('loading');
    setError('');
    try {
      const generated = await generateQuiz({
        topic: request.topic, quizType, itemCount, difficulty,
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
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="quiz-runner-title">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
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
                          quizType === option.value ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300',
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
                          difficulty === option ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300',
                        ].join(' ')}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="quiz-item-count" className="text-xs font-semibold text-ink-600 mb-1.5 block">Number of items</label>
                  <input
                    id="quiz-item-count"
                    type="number"
                    min={1}
                    max={20}
                    value={itemCount}
                    onChange={(event) => setItemCount(Number(event.target.value))}
                    className="w-24 border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
                  />
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
            <Button full onClick={handleGenerate}>Generate Quiz</Button>
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
