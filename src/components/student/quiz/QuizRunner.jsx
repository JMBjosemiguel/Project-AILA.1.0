import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import Button from '../../common/Button';
import { useToast } from '../../common/Toast';
import QuizCard from '../../chatbot/QuizCard';
import { generateQuiz, submitQuizAttempt } from '../../../services/api/quizService';

const QUIZ_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'identification', label: 'Identification' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function QuizRunner({ request, onClose }) {
  const [quizType, setQuizType] = useState('multiple_choice');
  const [difficulty, setDifficulty] = useState('medium');
  const [itemCount, setItemCount] = useState(5);
  const [step, setStep] = useState('setup');
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const submittingRef = useRef(false);
  const toast = useToast();

  const handleGenerate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStep('loading');
    setError('');
    try {
      const generated = await generateQuiz({
        topic: request.topic,
        quizType,
        itemCount,
        difficulty,
        sourceType: request.sourceType,
        sourceId: request.sourceId,
      });
      setQuiz(generated);
      setStep('ready');
    } catch (err) {
      setError(err.message || 'Could not generate a quiz right now.');
      setStep('setup');
      toast.error(err.message || 'Could not generate a quiz right now.');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleSubmit = async (answers) => {
    try {
      const attemptResult = await submitQuizAttempt(quiz.id, answers);
      setResult(attemptResult);
      toast.success('Quiz finished — saved to your history.');
    } catch (err) {
      setError(err.message || 'Could not save your quiz attempt.');
      toast.error(err.message || 'Could not save your quiz attempt.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="quiz-runner-title">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div>
            <h3 id="quiz-runner-title" className="text-[0.95rem] font-semibold text-ink-800">
              {step === 'ready' && quiz ? `Quiz: ${quiz.topic}` : 'Generate a quiz'}
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">Topic: {request.topic}</p>
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

          {step === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-10 justify-center">
              <Loader2 size={16} className="animate-spin" /> AILA is generating your quiz...
            </div>
          )}

          {step === 'ready' && quiz && (
            <div>
              <QuizCard quiz={quiz} onSubmit={handleSubmit} />
              {result && (
                <p className="text-center text-xs text-ink-400 mt-2">
                  Saved to your quiz history · +{Math.round((result.score / result.total) * 20)} XP
                </p>
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
    </div>,
    document.body
  );
}
