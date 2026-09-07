import { useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, XCircle } from 'lucide-react';
import Card, { CardHeader } from '../common/Card';
import Button from '../common/Button';

const TYPE_LABELS = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True or False',
  identification: 'Identification',
};

function normalize(value) {
  return (value ?? '').toString().trim().toLowerCase();
}

// A graded quiz always resolves to one review row per item, no matter whether
// it was graded by the server (persisted quiz) or self-checked from an inline
// answer key (chatbot practice quiz).
function reviewFromServerResult(items, answers, result) {
  const graded = Array.isArray(result?.items) ? result.items : [];
  const byId = new Map(graded.map((row) => [row.id, row]));

  return items.map((item, index) => {
    const row = byId.get(item.id) || graded[index] || {};
    return {
      correctAnswer: row.correctAnswer ?? '',
      explanation: row.explanation ?? '',
      isCorrect: typeof row.isCorrect === 'boolean'
        ? row.isCorrect
        : normalize(answers[index]) === normalize(row.correctAnswer),
    };
  });
}

function reviewFromInlineKey(items, answers) {
  return items.map((item, index) => ({
    correctAnswer: item.correctAnswer ?? '',
    explanation: item.explanation ?? '',
    isCorrect: normalize(answers[index]) === normalize(item.correctAnswer),
  }));
}

export default function QuizCard({ quiz, onSubmit }) {
  const items = quiz?.items ?? [];
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submitted = review !== null;

  const score = submitted ? review.filter((row) => row.isCorrect).length : 0;

  if (!items.length) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-ink-400">AILA couldn&apos;t build that quiz. Try asking again.</p>
      </Card>
    );
  }

  const setAnswer = (index, value) => {
    if (submitted || submitting) return;
    setAnswers((current) => ({ ...current, [index]: value }));
  };

  const handleSubmit = async () => {
    if (submitting || submitted) return;

    if (onSubmit) {
      const payload = items.map((item, index) => ({
        questionId: item.id,
        selectedAnswer: answers[index] ?? '',
      }));
      setSubmitting(true);
      try {
        const result = await onSubmit(payload);
        setReview(reviewFromServerResult(items, answers, result));
      } catch {
        setSubmitting(false);
      }
      return;
    }

    // No server round-trip — informal practice quiz self-checked on the client.
    setReview(reviewFromInlineKey(items, answers));
  };

  return (
    <Card className="max-w-xl">
      <CardHeader
        title={`Quiz: ${quiz.topic}`}
        subtitle={`${TYPE_LABELS[quiz.quizType] || 'Quiz'} · ${items.length} item${items.length === 1 ? '' : 's'}`}
        action={<ClipboardList size={18} className="text-primary" />}
      />

      {submitted && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-primary-50 text-primary text-sm font-semibold">
          You scored {score} / {items.length}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {items.map((item, index) => {
          const graded = submitted ? review[index] : null;
          const isCorrect = Boolean(graded?.isCorrect);

          return (
            <div key={index} className="border border-ink-100 rounded-xl p-3.5">
              <p className="text-sm font-medium text-ink-800 mb-2.5">
                {index + 1}. {item.question}
              </p>

              {item.options?.length ? (
                <div className="flex flex-col gap-1.5">
                  {item.options.map((option) => {
                    const selected = answers[index] === option;
                    const showCorrect = submitted && normalize(option) === normalize(graded?.correctAnswer);
                    const showWrong = submitted && selected && !showCorrect;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAnswer(index, option)}
                        disabled={submitted || submitting}
                        className={[
                          'text-left text-sm px-3 py-2 rounded-lg border transition-colors',
                          showCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : '',
                          showWrong ? 'border-rose-400 bg-rose-50 text-rose-700' : '',
                          !submitted && selected ? 'border-primary bg-primary-50 text-primary' : '',
                          !submitted && !selected ? 'border-ink-100 text-ink-600 hover:border-primary-300' : '',
                          submitted && !showCorrect && !showWrong ? 'border-ink-100 text-ink-400' : '',
                        ].join(' ')}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={answers[index] ?? ''}
                  onChange={(event) => setAnswer(index, event.target.value)}
                  disabled={submitted || submitting}
                  placeholder="Type your answer"
                  className={[
                    'w-full text-sm px-3 py-2 rounded-lg border outline-none',
                    submitted
                      ? isCorrect
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'border-rose-400 bg-rose-50 text-rose-700'
                      : 'border-ink-100 focus:border-primary-300',
                  ].join(' ')}
                />
              )}

              {submitted && (
                <div className="mt-2.5 flex items-start gap-1.5 text-xs">
                  {isCorrect ? (
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={14} className="text-rose-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-ink-500">
                    {!isCorrect && graded?.correctAnswer && (
                      <span className="font-medium text-ink-700">Correct answer: {graded.correctAnswer}. </span>
                    )}
                    {graded?.explanation}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && (
        <Button className="mt-4" full onClick={handleSubmit} disabled={submitting}>
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Checking...</> : 'Check Answers'}
        </Button>
      )}
    </Card>
  );
}
