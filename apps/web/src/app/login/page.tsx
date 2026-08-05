'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { setTenantSlug, setTokens } from '@/lib/session';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlugInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setTenantSlug(tenantSlug.trim());
      const result = await api.post<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/login', {
        email,
        password,
        twoFactorCode: twoFactorCode || undefined,
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-semibold">ComerciON</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Entre com as credenciais da sua empresa.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Empresa (identificador)">
            <input
              className="input"
              placeholder="ex: autopecas-silva"
              value={tenantSlug}
              onChange={(e) => setTenantSlugInput(e.target.value)}
              required
            />
          </Field>
          <Field label="E-mail">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Senha">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Código 2FA (se habilitado)">
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Ainda não tem conta?{' '}
          <Link href="/register" className="text-slate-900 underline dark:text-slate-100">
            Criar conta
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
