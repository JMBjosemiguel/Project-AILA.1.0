const KEY = 'aila.prefillPrompt';

export function setPrefillPrompt(text, resourceId = null) {
  window.sessionStorage.setItem(KEY, JSON.stringify({ text, resourceId }));
}

export function consumePrefillPrompt() {
  const value = window.sessionStorage.getItem(KEY);
  if (!value) return null;
  window.sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(value);
  } catch {
    return { text: value, resourceId: null };
  }
}
