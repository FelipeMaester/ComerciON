'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/customer-auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8">
        <h1 className="mb-1 text-xl font-semibold">Esqueci minha senha</h1>

        {sent ? (
          <>
            {/* Confirmação propositalmente vaga: a API responde igual exista o
                e-mail ou não, e a tela não pode contradizer isso. */}
            <p className="mb-4 mt-3 text-sm text-slate-600 dark:text-slate-300">
              Se este e-mail estiver cadastrado, enviamos um link para criar uma nova senha.
              Confira também a caixa de spam.
            </p>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              O link vale por 1 hora e só pode ser usado uma vez.
            </p>
            <Link href="/login" className="btn-primary block w-full text-center">
              Voltar para o login
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Informe o e-mail da sua conta. Enviaremos um link para você escolher uma nova senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                className="input"
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Lembrou a senha?{' '}
              <Link href="/login" className="text-slate-900 dark:text-slate-100 underline">
                Entrar
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
