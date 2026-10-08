// Hand-off used by the Learning Hub search: it stashes the matched term and
// navigates to the Resource Library, which picks it up on mount and prefills
// its own search box. Session-scoped and one-shot, same pattern as
// resumeLessonId / resumeQuizId.
const KEY = 'aila.resourceSearchTerm';

export function setResourceSearchTarget(term) {
  try {
    window.sessionStorage.setItem(KEY, String(term || ''));
  } catch {
    /* private mode / storage disabled — the link just won't prefill */
  }
}

export function consumeResourceSearchTarget() {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value) window.sessionStorage.removeItem(KEY);
    return value || null;
  } catch {
    return null;
  }
}
