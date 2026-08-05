'use client';

import { useEffect, useState } from 'react';
import { applyTheme, getEffectiveTheme, type Theme } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(getEffectiveTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label="Alternar tema claro/escuro"
    >
      {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    </button>
  );
}
