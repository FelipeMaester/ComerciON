'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { clearSession, getTokens } from '@/lib/session';

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
    <header className="flex h-14 items-center justify-end border-b border-slate-200 bg-white px-6">
      <button onClick={handleLogout} className="text-sm text-slate-600 hover:text-slate-900">
        Sair
      </button>
    </header>
  );
}
