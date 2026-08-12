'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { setTokens } from '@/lib/session';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string }>('/customer-auth/login', {
        email,
        password,
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      router.push(searchParams.get('redirect') ?? '/account');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8">
        <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Acesse sua conta para ver pedidos e finalizar compras.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-slate-500 dark:text-slate-400 underline">
            Esqueci minha senha
          </Link>
        </p>

        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          Não tem conta?{' '}
          <Link href="/register" className="text-slate-900 dark:text-slate-100 underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
