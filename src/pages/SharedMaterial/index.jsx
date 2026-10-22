import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, ClipboardList, Copy, GraduationCap, ListChecks, Loader2, LogIn, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import MarkdownRenderer from '../../components/chatbot/MarkdownRenderer';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useToast } from '../../components/common/Toast';
import { viewSharedMaterial, copySharedMaterial, checkSharedQuizAnswers } from '../../services/api/shareService';

const DIFFICULTY_LABEL = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
  easy: 'Beginner', medium: 'Intermediate', hard: 'Advanced',
};

function SharedCourse({ data }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wide text-primary mb-1">
          <BookOpen size={12} /> Shared course
        </div>
        <h1 className="text-xl font-display font-semibold text-ink-800">{data.title}</h1>
        <p className="text-sm text-ink-500 mt-1">
          {DIFFICULTY_LABEL[data.difficulty] || data.difficulty}
          {data.goal ? ` · Goal: ${data.goal}` : ''} · {data.moduleCount} module{data.moduleCount === 1 ? '' : 's'} · {data.lessonCount} lesson{data.lessonCount === 1 ? '' : 's'}
        </p>
        {data.hasAssessments && (
          <p className="text-xs text-ink-400 mt-1 inline-flex items-center gap-1">
            <GraduationCap size={12} /> This course has checkpoint assessments. Copy it to take your own.
          </p>
        )}
      </div>

      {data.modules.map((module_, mi) => (
        <Card key={mi}>
          <h2 className="text-sm font-semibold text-ink-800 mb-3">Module {mi + 1}: {module_.title}</h2>
          <div className="flex flex-col gap-4">
            {module_.topics.map((topic, ti) => (
              <div key={ti}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">{topic.title}</h3>
                {topic.lessons.map((lesson, li) => (
                  <div key={li} className="mb-3">
                    <p className="text-sm font-semibold text-ink-700 mb-1">{lesson.title}</p>
                    {lesson.content && <MarkdownRenderer text={lesson.content} />}
                  </div>
                ))}
                {topic.keyTerms.length > 0 && (
                  <div className="text-xs text-ink-500 mt-1">
                    {topic.keyTerms.map((kt, ki) => (
                      <div key={ki}><span className="font-semibold text-ink-700">{kt.term}:</span> {kt.definition}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function normalize(value) {
  return (value ?? '').toString().trim().toLowerCase();
}

function QuizItemAnswer({ item, index, answer, onAnswer, graded }) {
  const submitted = Boolean(graded);
  const isCorrect = Boolean(graded?.isCorrect);
  const hasOptions = item.options?.length > 0;

  return (
    <div className="border border-ink-100 rounded-xl p-3.5">
      <p className="text-sm font-medium text-ink-800 mb-2.5">{index + 1}. {item.question}</p>

      {hasOptions ? (
        <div className="flex flex-col gap-1.5">
          {item.options.map((option) => {
            const selected = answer === option;
            const showCorrect = submitted && normalize(option) === normalize(graded?.correctAnswer);
            const showWrong = submitted && selected && !showCorrect;

            return (
              <button
                key={option}
                type="button"
                onClick={() => onAnswer(option)}
                disabled={submitted}
                className={[
                  'text-left text-sm px-3 py-2 min-h-[40px] rounded-lg border transition-colors',
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
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          disabled={submitted}
          placeholder="Type your answer"
          className={[
            'w-full text-sm px-3 py-2 min-h-[40px] rounded-lg border outline-none',
            submitted
              ? isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-rose-400 bg-rose-50 text-rose-700'
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
            <span className="font-semibold text-ink-700">{isCorrect ? 'Correct. ' : 'Incorrect. '}</span>
            {!isCorrect && (
              <span className="font-medium text-ink-700">Your answer: {graded.yourAnswer || '(blank)'}. Correct answer: {graded.correctAnswer}. </span>
            )}
            {graded.explanation}
          </span>
        </div>
      )}
    </div>
  );
}

function SharedQuiz({ data, token }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const confirm = useConfirm();

  const setAnswer = (index, value) => {
    if (result) return;
    setAnswers((current) => ({ ...current, [index]: value }));
  };

  const handleCheck = async () => {
    if (checking) return;
    const payload = data.items
      .map((_, index) => ({ index, answer: (answers[index] || '').trim() }))
      .filter((a) => a.answer);
    const unanswered = data.items.length - payload.length;

    if (unanswered > 0) {
      const ok = await confirm({
        title: 'Check anyway?',
        message: `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Check anyway?`,
        confirmLabel: 'Check anyway',
        variant: 'primary',
      });
      if (!ok) return;
    }

    setChecking(true);
    setCheckError(null);
    try {
      const response = await checkSharedQuizAnswers(token, payload);
      setResult(response);
    } catch (err) {
      // Inline, not a toast — a retried click after a failure (e.g. the
      // backend waking up) must replace the message, never stack another one.
      setCheckError(err.message || 'Could not check your answers right now.');
    } finally {
      setChecking(false);
    }
  };

  const handleTryAgain = () => {
    setAnswers({});
    setResult(null);
    setCheckError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wide text-primary mb-1">
          <ClipboardList size={12} /> Shared quiz
        </div>
        <h1 className="text-xl font-display font-semibold text-ink-800">{data.topic}</h1>
        <p className="text-sm text-ink-500 mt-1">
          {DIFFICULTY_LABEL[data.difficulty] || data.difficulty} · {data.questionCount} question{data.questionCount === 1 ? '' : 's'}
        </p>
        <p className="text-xs text-ink-400 mt-1 italic">Practice only — your answers aren&apos;t saved and don&apos;t count toward any AILA progress.</p>
      </div>

      {result && (
        <Card className="text-center">
          <p className="text-3xl font-display font-extrabold text-ink-800">{result.score}/{result.total}</p>
          <p className="text-sm text-ink-500 mt-1">{result.percent}% correct</p>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-4">
          {data.items.map((item, index) => (
            <QuizItemAnswer
              key={index}
              item={item}
              index={index}
              answer={answers[index] || ''}
              onAnswer={(value) => setAnswer(index, value)}
              graded={result?.results[index]}
            />
          ))}
        </div>
      </Card>

      {checkError && <p className="text-xs text-rose-600">{checkError}</p>}

      {result ? (
        <Button variant="outline" icon={<RotateCcw size={14} />} onClick={handleTryAgain} className="self-start">
          Try Again
        </Button>
      ) : (
        <Button
          disabled={checking}
          icon={checking ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />}
          onClick={handleCheck}
          className="self-start"
        >
          {checking ? 'Checking...' : 'Check Answers'}
        </Button>
      )}
    </div>
  );
}

export default function SharedMaterialPage({ token, isAuthenticated, onNavigate, onGoToLogin }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [copying, setCopying] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    viewSharedMaterial(token)
      .then((data) => { if (active) setState({ loading: false, error: null, data }); })
      .catch((err) => { if (active) setState({ loading: false, error: err, data: null }); });
    return () => { active = false; };
  }, [token]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const result = await copySharedMaterial(token);
      toast.success(`Added to your materials${result.materialType === 'subject' ? ' — open Learning Hub' : ''}.`);
      onNavigate?.(result.materialType === 'subject' ? 'hub' : 'hub');
    } catch (err) {
      toast.error(err.message || 'Could not copy this material.');
    } finally {
      setCopying(false);
    }
  };

  const { loading, error, data } = state;

  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="bg-surface border-b border-ink-100 px-5 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm font-display font-semibold text-ink-800">
          <Sparkles size={16} className="text-primary" /> AILA · Shared learning material
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-400 py-16 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading shared material…
          </div>
        )}

        {!loading && error && (
          <Card>
            <EmptyState title="This shared material is no longer available" message="The link may have been revoked, or the material was removed." />
          </Card>
        )}

        {!loading && data && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-400">Shared by {data.sharedBy} · {data.shareType === 'quiz' ? 'practice quiz' : 'read-only'}</p>
              {data.shareType !== 'quiz' && (
                isAuthenticated ? (
                  <Button size="sm" disabled={copying} icon={copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} onClick={handleCopy}>
                    Copy to my materials
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" icon={<LogIn size={14} />} onClick={onGoToLogin}>
                    Log in to copy
                  </Button>
                )
              )}
            </div>
            {data.shareType === 'subject' ? <SharedCourse data={data} /> : <SharedQuiz data={data} token={token} />}
          </>
        )}
      </main>
    </div>
  );
}
