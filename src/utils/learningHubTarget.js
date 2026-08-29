const KEY = 'aila.resumeLessonId';

export function setResumeLesson(lessonId) {
  window.sessionStorage.setItem(KEY, String(lessonId));
}

export function consumeResumeLesson() {
  const value = window.sessionStorage.getItem(KEY);
  if (value) window.sessionStorage.removeItem(KEY);
  return value ? Number(value) : null;
}
