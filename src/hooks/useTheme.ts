import { useState, useEffect, useCallback } from 'react';
import { logUser } from '../utils/logger';

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('rodovid_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark-theme', isDark);
    try {
      localStorage.setItem('rodovid_theme', theme);
    } catch {
      // ignore storage errors
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#111315' : '#ffffff');
    }
  }, [isDark, theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      logUser(`Змінено тему оформлення: ${next === 'dark' ? 'темна' : 'світла'}`, { theme: next });
      return next;
    });
  }, []);

  return { theme, isDark, handleToggleTheme };
}
