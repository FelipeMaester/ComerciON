'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { setTokens } from '@/lib/session';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string }>('/customer-auth/register', {
        name,
        email,
        password,
        phone: phone || undefined,
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      router.push('/account');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar sua conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8">
        <h1 className="mb-1 text-xl font-semibold">Criar conta</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Cadastre-se para comprar e acompanhar seus pedidos.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input"
            type="password"
            placeholder="Senha (mín. 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input className="input" placeholder="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Criando…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Já tem conta?{' '}
          <Link href="/login" className="text-slate-900 dark:text-slate-100 underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
