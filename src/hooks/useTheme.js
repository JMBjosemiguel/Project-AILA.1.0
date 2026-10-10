import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'aila.theme';

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// The inline script in index.html already applies the stored theme before
// first paint; this hook just keeps React state in sync and lets the UI
// toggle it. Default is light, same as the inline script.
export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
