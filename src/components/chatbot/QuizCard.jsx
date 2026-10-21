import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Check, CheckCircle2, ClipboardList, Cloud, Loader2, RotateCcw, XCircle } from 'lucide-react';
import Card, { CardHeader } from '../common/Card';
import Button from '../common/Button';
import PersonalizedBadge from '../common/PersonalizedBadge';

const TYPE_LABELS = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True or False',
  identification: 'Identification',
};

function normalize(value) {
  return (value ?? '').toString().trim().toLowerCase();
}

// Identification only: uppercase, trim, collapse whitespace, strip
// surrounding punctuation, then accept an exact match or one that differs
// only by a trailing singular/plural "s"/"es" on either side — mirrors the
// backend's identification grading (quizService.isAnswerMatch) so the
// instant client-side check here never disagrees with the server's.
function normalizeIdentification(value) {
  return (value ?? '')
    .toString()
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function isSimplePluralVariant(a, b) {
  return a === `${b}S` || a === `${b}ES` || b === `${a}S` || b === `${a}ES`;
}

function isAnswerMatch(selectedAnswer, correctAnswer, quizType) {
  if (quizType !== 'identification') {
    return normalize(selectedAnswer) === normalize(correctAnswer);
  }
  const a = normalizeIdentification(selectedAnswer);
  const b = normalizeIdentification(correctAnswer);
  return a === b || isSimplePluralVariant(a, b);
}

// Server-saved answers arrive as [{ questionId, selectedAnswer }]; QuizCard keys
// its local answer state by item index, so map one onto the other up front.
function seedAnswers(items, initialAnswers) {
  const byId = new Map((initialAnswers ?? []).map((row) => [row.questionId, row.selectedAnswer]));
  const seeded = {};
  items.forEach((item, index) => {
    const value = byId.get(item.id);
    if (value != null && value !== '') seeded[index] = value;
  });
  return seeded;
}

// A graded quiz always resolves to one review row per item, no matter whether
// it was graded by the server (persisted quiz) or self-checked from an inline
// answer key (chatbot practice quiz).
function reviewFromServerResult(items, answers, result, quizType) {
  const graded = Array.isArray(result?.items) ? result.items : [];
  const byId = new Map(graded.map((row) => [row.id, row]));

  return items.map((item, index) => {
    const row = byId.get(item.id) || graded[index] || {};
    return {
      correctAnswer: row.correctAnswer ?? '',
      explanation: row.explanation ?? '',
      isCorrect: typeof row.isCorrect === 'boolean'
        ? row.isCorrect
        : isAnswerMatch(answers[index], row.correctAnswer, quizType),
    };
  });
}

function reviewFromInlineKey(items, answers, quizType) {
  return items.map((item, index) => ({
    correctAnswer: item.correctAnswer ?? '',
    explanation: item.explanation ?? '',
    isCorrect: isAnswerMatch(answers[index], item.correctAnswer, quizType),
  }));
}

const SAVE_LABEL = {
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save",
};

// Taking/reviewing a long quiz gets paging, a navigator, and collapsed
// explanations; an informal chatbot mini-quiz (capped at 20 items by
// chatIntent.js) never does — it must look/behave exactly as it always has.
const PAGE_SIZE = 10;
const EXPLANATION_COLLAPSE_THRESHOLD = 20;

export default function QuizCard({
  quiz,
  onSubmit,
  initialAnswers,
  initialIndex = 0,
  onAnswerChange,
  saveState = 'idle',
  onRetrySave,
  presetReview = null,
  // Informal chatbot mini-quiz only: session-scoped state lift + "Save as Quiz".
  localState = null,
  onLocalStateChange,
  onSaveAsQuiz,
  saveAsQuizState = 'idle',
}) {
  const items = quiz?.items ?? [];
  // MessageBubble always passes onSaveAsQuiz for a real chat quiz card (see
  // AIAssistant's isChatbotQuiz); QuizRunner never passes it at all — the one
  // reliable signal to keep every long-quiz addition below out of chat.
  const isChatQuiz = Boolean(onSaveAsQuiz);
  const [answers, setAnswers] = useState(() => {
    if (localState?.answers) return localState.answers;
    return presetReview ? seedAnswers(items, presetReview.answers) : seedAnswers(items, initialAnswers);
  });
  const [review, setReview] = useState(() => localState?.review ?? presetReview?.graded ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => Math.floor(initialIndex / PAGE_SIZE));
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const [showUnansweredWarning, setShowUnansweredWarning] = useState(false);
  const [resultFilter, setResultFilter] = useState('all');
  const [expandedExplanations, setExpandedExplanations] = useState(() => new Set());
  const submitted = review !== null;
  const itemRefs = useRef([]);
  const didMountRef = useRef(false);

  // On resume/jump, scroll to the focused question. On mount, this mirrors
  // the original resume behavior exactly — only scrolls if resuming past the
  // first question; any later change (navigator tap, "Go to first
  // unanswered") always scrolls, including back to question 1.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      if (initialIndex > 0) itemRefs.current[focusedIndex]?.scrollIntoView({ block: 'center' });
      return;
    }
    itemRefs.current[focusedIndex]?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, currentPage]);

  const score = submitted ? review.filter((row) => row.isCorrect).length : 0;
  const unansweredIndexes = items.map((_, i) => i).filter((i) => !answers[i]);
  const isPaginated = !isChatQuiz && !submitted && items.length > PAGE_SIZE;
  const totalPages = isPaginated ? Math.ceil(items.length / PAGE_SIZE) : 1;
  const pageStart = isPaginated ? currentPage * PAGE_SIZE : 0;
  const pageEnd = isPaginated ? Math.min(pageStart + PAGE_SIZE, items.length) : items.length;
  const collapseExplanationsByDefault = !isChatQuiz && items.length > EXPLANATION_COLLAPSE_THRESHOLD;
  const reviewIndexes = items.map((_, i) => i).filter((i) => resultFilter === 'all' || !review?.[i]?.isCorrect);
  const takeIndexes = isPaginated
    ? Array.from({ length: pageEnd - pageStart }, (_, i) => pageStart + i)
    : items.map((_, i) => i);
  const renderIndexes = submitted ? reviewIndexes : takeIndexes;

  if (!items.length) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm text-ink-400">AILA couldn&apos;t build that quiz. Try asking again.</p>
      </Card>
    );
  }

  const setAnswer = (index, value) => {
    if (submitted || submitting) return;
    setAnswers((current) => {
      const next = { ...current, [index]: value };
      onLocalStateChange?.({ answers: next, review });
      return next;
    });
    onAnswerChange?.({ questionId: items[index]?.id, selectedAnswer: value, index });
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
        setReview(reviewFromServerResult(items, answers, result, quiz?.quizType));
      } catch {
        setSubmitting(false);
      }
      return;
    }

    // No server round-trip — informal practice quiz self-checked on the client.
    const graded = reviewFromInlineKey(items, answers, quiz?.quizType);
    setReview(graded);
    onLocalStateChange?.({ answers, review: graded });
  };

  const jumpToQuestion = (index) => {
    setCurrentPage(Math.floor(index / PAGE_SIZE));
    setFocusedIndex(index);
  };

  const handleCheckClick = () => {
    if (!isChatQuiz && unansweredIndexes.length > 0) {
      setShowUnansweredWarning(true);
      return;
    }
    handleSubmit();
  };

  const handleGoToFirstUnanswered = () => {
    setShowUnansweredWarning(false);
    if (unansweredIndexes.length) jumpToQuestion(unansweredIndexes[0]);
  };

  const handleSubmitAnyway = () => {
    setShowUnansweredWarning(false);
    handleSubmit();
  };

  const toggleExplanation = (index) => {
    setExpandedExplanations((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const toggleAllExplanations = () => {
    setExpandedExplanations((current) => (
      current.size === items.length ? new Set() : new Set(items.map((_, i) => i))
    ));
  };

  const showSaveStatus = !submitted && typeof onAnswerChange === 'function' && saveState !== 'idle';

  return (
    <Card className="max-w-xl">
      <CardHeader
        title={`Quiz: ${quiz.topic}`}
        subtitle={`${TYPE_LABELS[quiz.quizType] || 'Quiz'} · ${items.length} item${items.length === 1 ? '' : 's'}`}
        action={
          <div className="flex items-center gap-2">
            <PersonalizedBadge level={quiz.personalizationLevel} />
            <ClipboardList size={18} className="text-primary" />
          </div>
        }
      />

      {submitted && (
        <div className="mb-4">
          <div className="px-3 py-2 rounded-xl bg-primary-50 text-primary text-sm font-semibold">
            You scored {score} / {items.length}
            {items.length > 0 ? ` (${Math.round((score / items.length) * 100)}%)` : ''}
          </div>
          {!isChatQuiz && (
            <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-1.5" role="radiogroup" aria-label="Result filter">
                <button
                  type="button"
                  role="radio"
                  aria-checked={resultFilter === 'all'}
                  onClick={() => setResultFilter('all')}
                  className={[
                    'text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors',
                    resultFilter === 'all' ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
                  ].join(' ')}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={resultFilter === 'wrong'}
                  onClick={() => setResultFilter('wrong')}
                  className={[
                    'text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors',
                    resultFilter === 'wrong' ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300',
                  ].join(' ')}
                >
                  Wrong only ({items.length - score})
                </button>
              </div>
              {collapseExplanationsByDefault && (
                <button type="button" onClick={toggleAllExplanations} className="text-xs font-semibold text-primary hover:underline">
                  {expandedExplanations.size === items.length ? 'Collapse all' : 'Expand all'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showSaveStatus && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-ink-400" aria-live="polite">
          {saveState === 'saving' && <Cloud size={12} className="animate-pulse" />}
          {saveState === 'saved' && <Check size={12} className="text-emerald-500" />}
          {saveState === 'error' && <XCircle size={12} className="text-rose-500" />}
          <span className={saveState === 'error' ? 'text-rose-600' : ''}>{SAVE_LABEL[saveState]}</span>
          {saveState === 'error' && onRetrySave && (
            <button
              type="button"
              onClick={onRetrySave}
              className="ml-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <RotateCcw size={11} /> Retry
            </button>
          )}
        </div>
      )}

      {isPaginated && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-ink-600 mb-2">
            Questions {pageStart + 1}–{pageEnd} of {items.length}
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Question navigator">
            {items.map((_, i) => {
              const answered = Boolean(answers[i]);
              const current = i === focusedIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => jumpToQuestion(i)}
                  aria-label={`Question ${i + 1}${answered ? ', answered' : ', unanswered'}${current ? ', current' : ''}`}
                  className={[
                    // Visible square stays 28px (w-7 h-7) — the ::before
                    // pseudo-element extends the tappable area to ~40x40px
                    // without affecting layout (absolutely positioned, invisible).
                    'relative w-7 h-7 flex items-center justify-center rounded-md text-[0.7rem] font-semibold border transition-colors',
                    "before:content-[''] before:absolute before:-inset-1.5",
                    answered ? 'bg-primary-50 border-primary-200 text-primary' : 'bg-surface border-ink-100 text-ink-400',
                    current ? 'ring-2 ring-primary ring-offset-1' : '',
                  ].join(' ')}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs">
            <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <span className="text-ink-400">Page {currentPage + 1} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={currentPage === totalPages - 1} onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {renderIndexes.map((index) => {
          const item = items[index];
          const graded = submitted ? review[index] : null;
          const isCorrect = Boolean(graded?.isCorrect);

          return (
            <div
              key={index}
              ref={(node) => { itemRefs.current[index] = node; }}
              className={[
                'border rounded-xl p-3.5',
                !submitted && isPaginated && index === focusedIndex ? 'border-primary-300 ring-1 ring-primary-200' : 'border-ink-100',
              ].join(' ')}
            >
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
                  {collapseExplanationsByDefault && !expandedExplanations.has(index) ? (
                    <button
                      type="button"
                      onClick={() => toggleExplanation(index)}
                      className="font-semibold text-primary hover:underline"
                    >
                      {isCorrect ? 'Correct' : 'Incorrect'} — Show explanation
                    </button>
                  ) : (
                    <span className="text-ink-500">
                      {!isCorrect && graded?.correctAnswer && (
                        <span className="font-medium text-ink-700">Correct answer: {graded.correctAnswer}. </span>
                      )}
                      {graded?.explanation}
                      {collapseExplanationsByDefault && (
                        <button type="button" onClick={() => toggleExplanation(index)} className="ml-1.5 font-semibold text-primary hover:underline">
                          Hide
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted && showUnansweredWarning && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <p className="font-medium">{unansweredIndexes.length} unanswered.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={handleGoToFirstUnanswered}>Go to first unanswered</Button>
            <Button size="sm" onClick={handleSubmitAnyway}>Submit anyway</Button>
          </div>
        </div>
      )}
      {!submitted && !showUnansweredWarning && (
        <Button className="mt-4" full onClick={handleCheckClick} disabled={submitting}>
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Checking...</> : 'Check answers'}
        </Button>
      )}

      {onSaveAsQuiz && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-50 pt-3">
          <p className="text-xs text-ink-400">
            Practice quiz — not graded. Save it to take it formally with XP and history.
          </p>
          <button
            type="button"
            onClick={onSaveAsQuiz}
            disabled={saveAsQuizState === 'saving' || saveAsQuizState === 'saved'}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-50 disabled:opacity-60"
          >
            {saveAsQuizState === 'saving' && <><Loader2 size={12} className="animate-spin" /> Saving…</>}
            {saveAsQuizState === 'saved' && <><Check size={12} className="text-emerald-500" /> Saved</>}
            {saveAsQuizState === 'error' && <><XCircle size={12} className="text-rose-500" /> Try again</>}
            {saveAsQuizState === 'idle' && <><BookmarkPlus size={12} /> Save as Quiz</>}
          </button>
        </div>
      )}
    </Card>
  );
}
