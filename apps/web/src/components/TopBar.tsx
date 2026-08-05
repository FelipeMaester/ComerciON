'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { clearSession, getTokens } from '@/lib/session';
import { ThemeToggle } from './ThemeToggle';

export function TopBar() {
  const router = useRouter();

  async function handleLogout() {
    const tokens = getTokens();
    try {
      if (tokens?.refreshToken) {
        await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
      }
    } finally {
      clearSession();
      router.push('/login');
    }
  }

  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-900">
      <ThemeToggle />
      <button onClick={handleLogout} className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
        Sair
      </button>
    </header>
  );
}
