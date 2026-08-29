import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, XCircle } from 'lucide-react';
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

export default function QuizCard({ quiz, onSubmit }) {
  const items = quiz?.items ?? [];
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(() => {
    if (!submitted) return 0;
    return items.reduce((total, item, index) => (
      normalize(answers[index]) === normalize(item.correctAnswer) ? total + 1 : total
    ), 0);
  }, [submitted, answers, items]);

  const handleSubmit = () => {
    setSubmitted(true);
    onSubmit?.(items.map((item, index) => ({ questionId: item.id, selectedAnswer: answers[index] ?? '' })));
  };

  if (!items.length) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-ink-400">AILA couldn't build that quiz. Try asking again.</p>
      </Card>
    );
  }

  const setAnswer = (index, value) => {
    if (submitted) return;
    setAnswers((current) => ({ ...current, [index]: value }));
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
          const isCorrect = submitted && normalize(answers[index]) === normalize(item.correctAnswer);

          return (
            <div key={index} className="border border-ink-100 rounded-xl p-3.5">
              <p className="text-sm font-medium text-ink-800 mb-2.5">
                {index + 1}. {item.question}
              </p>

              {item.options?.length ? (
                <div className="flex flex-col gap-1.5">
                  {item.options.map((option) => {
                    const selected = answers[index] === option;
                    const showCorrect = submitted && normalize(option) === normalize(item.correctAnswer);
                    const showWrong = submitted && selected && !showCorrect;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAnswer(index, option)}
                        disabled={submitted}
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
                  disabled={submitted}
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
                    {!isCorrect && <span className="font-medium text-ink-700">Correct answer: {item.correctAnswer}. </span>}
                    {item.explanation}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && (
        <Button className="mt-4" full onClick={handleSubmit}>
          Check Answers
        </Button>
      )}
    </Card>
  );
}
