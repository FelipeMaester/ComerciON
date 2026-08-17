'use client';

import { useEffect, useState } from 'react';
import { applyTheme, getEffectiveTheme, type Theme } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  // O tema real só é conhecido no navegador. Até lá o botão fica invisível,
  // para não aparecer um sol e virar lua no primeiro instante da tela.
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setTheme(getEffectiveTheme());
    setPronto(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className="rounded-lg p-2 text-suave transition hover:bg-realce hover:text-texto"
      aria-label="Alternar tema claro/escuro"
      title={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
    >
      <span className={pronto ? '' : 'invisible'}>
        {theme === 'dark' ? (
          // Sol
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
          </svg>
        ) : (
          // Lua
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="h-5 w-5">
            <path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5a8.6 8.6 0 1 0 10.9 10.9z" />
          </svg>
        )}
      </span>
    </button>
  );
}
