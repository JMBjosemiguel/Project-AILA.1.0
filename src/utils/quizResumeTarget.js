// Hand-off used by the Dashboard "Resume Test" widget: it stashes the quiz id
// and navigates to Learning Hub, which picks it up on mount and opens the
// QuizRunner straight into the unfinished attempt. Session-scoped and one-shot,
// exactly like resumeLessonId — the real progress lives on the server.
const KEY = 'aila.resumeQuizId';

export function setResumeQuiz(quizId) {
  try {
    window.sessionStorage.setItem(KEY, String(quizId));
  } catch {
    /* private mode / storage disabled — the widget just won't deep-link */
  }
}

export function consumeResumeQuiz() {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value) window.sessionStorage.removeItem(KEY);
    return value ? Number(value) : null;
  } catch {
    return null;
  }
}
